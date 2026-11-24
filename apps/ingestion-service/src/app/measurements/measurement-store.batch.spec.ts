import { QueryFailedError, Repository } from 'typeorm';
import type { MeasurementEvent } from '@mini-pms/contracts';
import { IntervalEntity } from './entities/interval.entity';
import { MEASUREMENT_BATCH_SIZE } from './measurement.constants';
import { MeasurementStoreService } from './measurement-store.service';

function measurement(patch: Partial<MeasurementEvent> = {}): MeasurementEvent {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    deviceId: '3',
    serialNo: 'METER-003',
    organizationUnitId: '1',
    periodStart: '2026-11-18T10:00:00.000Z',
    intervalMinutes: 15,
    producedAt: '2026-11-18T10:15:00.000Z',
    source: 'simulator',
    simulationMode: 'normal',
    activeImportKwh: 10,
    activeExportKwh: 0,
    inductiveKvarh: 2,
    capacitiveKvarh: 0.5,
    ...patch,
  };
}

describe('MeasurementStoreService.storeBatch', () => {
  let query: jest.Mock;
  let batchQuery: jest.Mock;
  let transaction: jest.Mock;
  let service: MeasurementStoreService;

  beforeEach(() => {
    query = jest.fn();
    batchQuery = jest.fn();
    transaction = jest.fn(async (_isolation, callback) =>
      callback({ query: batchQuery }),
    );
    service = new MeasurementStoreService({
      query,
      manager: { transaction },
    } as unknown as Repository<IntervalEntity>);
  });

  it('boş listede veritabanına gitmez', async () => {
    await expect(service.storeBatch([])).resolves.toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('üst sınırı aşan grubu sorgu göndermeden reddeder', async () => {
    await expect(
      service.storeBatch(
        Array.from({ length: MEASUREMENT_BATCH_SIZE + 1 }, () => measurement()),
      ),
    ).rejects.toThrow('batch boyutunu aşıyor');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('tek elemanda mevcut store metodunu kullanır', async () => {
    query.mockResolvedValueOnce([{ id: '1' }]);
    await expect(service.storeBatch([measurement()])).resolves.toEqual([
      { status: 'inserted' },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('grup için tek INSERT ve tek toplu karşılaştırma yapar', async () => {
    const list = [measurement(), measurement({ deviceId: '4' })];
    batchQuery
      .mockResolvedValueOnce(
        list.map((item) => ({
          device_id: item.deviceId,
          period_start: new Date(item.periodStart),
        })),
      )
      .mockResolvedValueOnce([
        { ordinal: 0, same_values: true },
        { ordinal: 1, same_values: true },
      ]);
    await expect(service.storeBatch(list)).resolves.toEqual([
      { status: 'inserted' },
      { status: 'inserted' },
    ]);
    expect(transaction).toHaveBeenCalledWith(
      'READ COMMITTED',
      expect.any(Function),
    );
    expect(batchQuery).toHaveBeenCalledTimes(2);
    expect(
      batchQuery.mock.calls.filter(([sql]) => /INSERT INTO/.test(sql)),
    ).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
    expect(batchQuery.mock.calls[0][1]).toEqual([
      0,
      '3',
      list[0].periodStart,
      '10',
      '0',
      '2',
      '0.5',
      1,
      '4',
      list[1].periodStart,
      '10',
      '0',
      '2',
      '0.5',
    ]);
    expect(batchQuery.mock.calls[0][0]).toContain('$14::numeric');
  });

  it('aynı grup içindeki inserted, duplicate ve conflict sırasını korur', async () => {
    batchQuery
      .mockResolvedValueOnce([
        { device_id: '3', period_start: new Date(measurement().periodStart) },
      ])
      .mockResolvedValueOnce([
        { ordinal: 2, same_values: false },
        { ordinal: 0, same_values: true },
        { ordinal: 1, same_values: true },
      ]);
    await expect(
      service.storeBatch([
        measurement(),
        measurement(),
        measurement({ activeImportKwh: 12 }),
      ]),
    ).resolves.toEqual([
      { status: 'inserted' },
      { status: 'duplicate' },
      { status: 'conflict', reason: expect.any(String) },
    ]);
    expect(batchQuery.mock.calls[0][0]).toContain(
      'SELECT DISTINCT ON (input.device_id, input.period_start)',
    );
    expect(batchQuery.mock.calls[0][0]).toContain(
      'ORDER BY input.device_id, input.period_start, input.ordinal',
    );
  });

  it('önceden var olan anahtarda ilk mesajı inserted saymaz', async () => {
    batchQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { ordinal: 0, same_values: false },
      { ordinal: 1, same_values: true },
    ]);
    await expect(
      service.storeBatch([measurement(), measurement({ activeImportKwh: 12 })]),
    ).resolves.toEqual([
      { status: 'conflict', reason: expect.any(String) },
      { status: 'duplicate' },
    ]);
  });

  it('eksik karşılaştırmayı başarılı saymaz', async () => {
    batchQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ordinal: 0, same_values: true }]);
    await expect(
      service.storeBatch([measurement(), measurement()]),
    ).rejects.toThrow('sonuçları eksik');
  });

  it('satır sayısı eşit olsa bile eksik ordinal için hata verir', async () => {
    batchQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { ordinal: 0, same_values: true },
      { ordinal: 0, same_values: true },
    ]);
    await expect(
      service.storeBatch([measurement(), measurement()]),
    ).rejects.toThrow('karşılaştırma sonucu bulunamadı');
  });

  it.each([
    ['23503', 'fk_interval_device'],
    ['23514', 'chk_interval_values'],
  ])(
    'tanınan veri hatasında grubu bölüp sağlam ölçümü korur: %s',
    async (code, constraint) => {
      const error = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('bad data'), { code, constraint }),
      );
      batchQuery.mockRejectedValueOnce(error);
      query.mockRejectedValueOnce(error).mockResolvedValueOnce([{ id: '2' }]);
      await expect(
        service.storeBatch([measurement(), measurement({ deviceId: '4' })]),
      ).resolves.toEqual([
        { status: 'rejected', reason: expect.any(String) },
        { status: 'inserted' },
      ]);
      expect(query.mock.calls[0][1][0]).toBe('3');
      expect(query.mock.calls[1][1][0]).toBe('4');
    },
  );

  it.each([
    ['08006', undefined],
    ['57014', undefined],
    ['40P01', undefined],
    ['23503', 'other_foreign_key'],
  ])(
    'bağlantı, timeout ve tanınmayan hatalarda grubu bölmez: %s',
    async (code, constraint) => {
      const error = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('failed'), { code, constraint }),
      );
      batchQuery.mockRejectedValueOnce(error);
      await expect(
        service.storeBatch([measurement(), measurement()]),
      ).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('INSERT sonrası karşılaştırma hatasını yukarı taşır', async () => {
    const error = new Error('connection lost');
    batchQuery.mockResolvedValueOnce([]).mockRejectedValueOnce(error);
    await expect(
      service.storeBatch([measurement(), measurement()]),
    ).rejects.toBe(error);
    expect(query).not.toHaveBeenCalled();
  });
});
