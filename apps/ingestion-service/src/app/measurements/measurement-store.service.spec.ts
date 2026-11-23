import { QueryFailedError, Repository } from 'typeorm';
import type { MeasurementEvent } from '@mini-pms/contracts';
import { IntervalEntity } from './entities/interval.entity';
import { MeasurementStoreService } from './measurement-store.service';

const event: MeasurementEvent = {
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
};

describe('MeasurementStoreService', () => {
  let query: jest.Mock;
  let service: MeasurementStoreService;

  beforeEach(() => {
    query = jest.fn();
    service = new MeasurementStoreService({
      query,
    } as unknown as Repository<IntervalEntity>);
  });

  it('yeni kaydı parametreli SQL ile ekler', async () => {
    query.mockResolvedValueOnce([{ id: '1' }]);
    await expect(service.store(event)).resolves.toEqual({ status: 'inserted' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /ON CONFLICT \(device_id, period_start\)\s+DO NOTHING/,
      ),
      ['3', event.periodStart, '10', '0', '2', '0.5'],
    );
  });

  it('aynı cihaz, dönem ve enerjiler için duplicate döndürür', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ same_values: true }]);
    await expect(service.store(event)).resolves.toEqual({
      status: 'duplicate',
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('enerji eşitliğini metin yerine PostgreSQL NUMERIC ile karşılaştırır', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ same_values: true }]);
    await service.store(event);
    const sql = query.mock.calls[1][0] as string;
    for (const [column, parameter] of [
      ['active_import_kwh', 3],
      ['active_export_kwh', 4],
      ['inductive_kvarh', 5],
      ['capacitive_kvarh', 6],
    ]) {
      expect(sql).toContain(`${column} = $${parameter}::numeric`);
    }
  });

  it('farklı enerji geldiğinde kaydı güncellemeden conflict döndürür', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ same_values: false }]);
    await expect(service.store(event)).resolves.toEqual({
      status: 'conflict',
      reason: expect.any(String),
    });
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls)
      expect(sql).not.toMatch(/\bUPDATE\b/i);
  });

  it('eklenmeyen kayıt karşılaştırmada da yoksa hatayı yukarı taşır', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(service.store(event)).rejects.toThrow(
      'işlem tekrar denenmeli',
    );
  });

  it.each([
    ['23503', 'fk_interval_device', 'cihaz'],
    ['23514', 'chk_interval_values', 'Enerji'],
  ])(
    'tanınan veri hatasını rejected yapar: %s / %s',
    async (code, constraint, reason) => {
      const driverError = Object.assign(new Error('database detail'), {
        code,
        constraint,
      });
      query.mockRejectedValueOnce(
        new QueryFailedError('INSERT', [], driverError),
      );
      await expect(service.store(event)).resolves.toEqual({
        status: 'rejected',
        reason: expect.stringContaining(reason),
      });
    },
  );

  it.each([
    ['23503', 'other_foreign_key'],
    ['23514', 'other_check'],
    ['08006', undefined],
    ['40P01', undefined],
    ['42601', undefined],
  ])(
    'tanımadığı veya geçici DB hatasını rejected yapmaz: %s',
    async (code, constraint) => {
      const driverError = Object.assign(new Error('database detail'), {
        code,
        constraint,
      });
      const error = new QueryFailedError('INSERT', [], driverError);
      query.mockRejectedValueOnce(error);
      await expect(service.store(event)).rejects.toBe(error);
    },
  );

  it('bağlantı hatasını olduğu gibi yukarı taşır', async () => {
    const error = new Error('Connection lost');
    query.mockRejectedValueOnce(error);
    await expect(service.store(event)).rejects.toBe(error);
  });

  it('duplicate karşılaştırması sırasındaki hatayı da yukarı taşır', async () => {
    const error = new Error('Connection lost');
    query.mockResolvedValueOnce([]).mockRejectedValueOnce(error);
    await expect(service.store(event)).rejects.toBe(error);
  });
});
