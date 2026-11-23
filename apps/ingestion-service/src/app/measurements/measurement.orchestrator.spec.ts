import type { MeasurementEvent } from '@mini-pms/contracts';
import { MeasurementOrchestrator } from './measurement.orchestrator';
import { MeasurementStoreService } from './measurement-store.service';
import { MeasurementDlqService } from './measurement-dlq.service';
import type { MeasurementMessage } from './measurement-dlq.service';
import { MeasurementLatestService } from './measurement-latest.service';

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

function source(
  raw: string | null = JSON.stringify(event),
): MeasurementMessage {
  return {
    topic: 'mpms.measurement.raw',
    partition: 1,
    offset: '42',
    key: '3',
    raw,
  };
}

describe('MeasurementOrchestrator', () => {
  let store: jest.Mock;
  let storeBatch: jest.Mock;
  let publish: jest.Mock;
  let publishMany: jest.Mock;
  let updateMany: jest.Mock;
  let update: jest.Mock;
  let orchestrator: MeasurementOrchestrator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-18T10:30:00.000Z'));
    store = jest.fn().mockResolvedValue({ status: 'inserted' });
    storeBatch = jest.fn();
    publish = jest.fn().mockResolvedValue(undefined);
    publishMany = jest.fn().mockResolvedValue(undefined);
    updateMany = jest.fn().mockResolvedValue(1);
    update = jest.fn().mockResolvedValue(true);
    orchestrator = new MeasurementOrchestrator(
      { store, storeBatch } as unknown as MeasurementStoreService,
      { publish, publishMany } as unknown as MeasurementDlqService,
      {
        updateIfNewer: update,
        updateManyIfNewer: updateMany,
      } as unknown as MeasurementLatestService,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('processBatch', () => {
    it('karışık grupta sonuçları orijinal kaynaklarla eşler', async () => {
      const events = [
        event,
        { ...event, deviceId: '4' },
        { ...event, deviceId: '5' },
        { ...event, deviceId: '6' },
      ];
      const messages = [
        source(),
        { ...source('{broken'), offset: '43' },
        ...events
          .slice(1)
          .map((item, index) => ({
            ...source(JSON.stringify(item)),
            key: item.deviceId,
            offset: String(44 + index),
          })),
      ];
      storeBatch.mockResolvedValueOnce([
        { status: 'inserted' },
        { status: 'conflict', reason: 'conflict' },
        { status: 'duplicate' },
        { status: 'rejected', reason: 'missing' },
      ]);
      const results = await orchestrator.processBatch(messages);
      expect(results.map((item) => item.status)).toEqual([
        'inserted',
        'sent-to-dlq',
        'sent-to-dlq',
        'duplicate',
        'sent-to-dlq',
      ]);
      expect(storeBatch).toHaveBeenCalledWith(events);
      expect(store).not.toHaveBeenCalled();
      expect(publishMany).toHaveBeenCalledTimes(1);
      expect(publishMany).toHaveBeenCalledWith([
        {
          message: messages[1],
          code: 'INVALID_MEASUREMENT',
          reason: expect.any(String),
        },
        {
          message: messages[2],
          code: 'MEASUREMENT_CONFLICT',
          reason: 'conflict',
        },
        {
          message: messages[4],
          code: 'MEASUREMENT_REJECTED',
          reason: 'missing',
        },
      ]);
      expect(updateMany).toHaveBeenCalledWith([events[0], events[2]]);
      expect(update).not.toHaveBeenCalled();
    });
    it('boş grupta SQL çalıştırmaz', async () => {
      await expect(orchestrator.processBatch([])).resolves.toEqual([]);
      expect(storeBatch).not.toHaveBeenCalled();
    });
    it('tamamen geçersiz grupta yalnız DLQ gönderir', async () => {
      await expect(
        orchestrator.processBatch([source(null), source('{broken')]),
      ).resolves.toHaveLength(2);
      expect(storeBatch).not.toHaveBeenCalled();
      expect(publishMany.mock.calls[0][0]).toHaveLength(2);
      expect(updateMany).toHaveBeenCalledWith([]);
    });
    it('eksik SQL sonuçlarını başarılı saymaz', async () => {
      storeBatch.mockResolvedValueOnce([]);
      await expect(orchestrator.processBatch([source()])).rejects.toThrow(
        'sonuç sayısı',
      );
      expect(updateMany).not.toHaveBeenCalled();
    });
    it('DB hatasında offset için başarı dönmez', async () => {
      const error = new Error('DB unavailable');
      storeBatch.mockRejectedValueOnce(error);
      await expect(orchestrator.processBatch([source()])).rejects.toBe(error);
      expect(publishMany).not.toHaveBeenCalled();
    });
    it('DLQ hatasını yukarı taşır', async () => {
      const error = new Error('DLQ unavailable');
      publishMany.mockRejectedValueOnce(error);
      await expect(orchestrator.processBatch([source('{broken')])).rejects.toBe(
        error,
      );
      expect(updateMany).not.toHaveBeenCalled();
    });
    it('Redis hatasını yukarı taşır', async () => {
      storeBatch.mockResolvedValueOnce([{ status: 'duplicate' }]);
      const error = new Error('Redis unavailable');
      updateMany.mockRejectedValueOnce(error);
      await expect(orchestrator.processBatch([source()])).rejects.toBe(error);
    });
  });

  it.each(['inserted', 'duplicate'])(
    '%s sonucunda kayıt sonrası Redis adımını çalıştırır',
    async (status) => {
      store.mockResolvedValueOnce({ status });
      await expect(orchestrator.process(source())).resolves.toEqual({
        status,
        measurement: event,
      });
      expect(store).toHaveBeenCalledWith(event);
      expect(update).toHaveBeenCalledWith(event);
      expect(store.mock.invocationCallOrder[0]).toBeLessThan(
        update.mock.invocationCallOrder[0],
      );
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it.each([null, '{bozuk', JSON.stringify({ ...event, activeImportKwh: -1 })])(
    "geçersiz mesajı kaynak bilgileri ve nedeni ile DLQ'ya gönderir",
    async (raw) => {
      const message = source(raw);
      await expect(orchestrator.process(message)).resolves.toEqual({
        status: 'sent-to-dlq',
        code: 'INVALID_MEASUREMENT',
        reason: expect.any(String),
      });
      expect(publish).toHaveBeenCalledWith({
        message,
        code: 'INVALID_MEASUREMENT',
        reason: expect.any(String),
      });
      expect(store).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['conflict', 'MEASUREMENT_CONFLICT'],
    ['rejected', 'MEASUREMENT_REJECTED'],
  ])("%s sonucunu DLQ'ya gönderir, Redis'e yazmaz", async (status, code) => {
    store.mockResolvedValueOnce({ status, reason: 'test reason' });
    const message = source();
    await expect(orchestrator.process(message)).resolves.toEqual({
      status: 'sent-to-dlq',
      code,
      reason: 'test reason',
    });
    expect(publish).toHaveBeenCalledWith({
      message,
      code,
      reason: 'test reason',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('DB bağlantı hatasını DLQ sonucuna çevirmeden yukarı taşır', async () => {
    const error = new Error('DB disconnected');
    store.mockRejectedValueOnce(error);
    await expect(orchestrator.process(source())).rejects.toBe(error);
    expect(update).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it.each(['inserted', 'duplicate'])(
    '%s sonrasında Redis hatasını yukarı taşır',
    async (status) => {
      store.mockResolvedValueOnce({ status });
      const error = new Error('Redis disconnected');
      update.mockRejectedValueOnce(error);
      await expect(orchestrator.process(source())).rejects.toBe(error);
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it('eski dönem nedeniyle Redis güncellenmezse başarılı kalır', async () => {
    update.mockResolvedValueOnce(false);
    await expect(orchestrator.process(source())).resolves.toMatchObject({
      status: 'inserted',
    });
  });

  it.each(['invalid', 'conflict', 'rejected'])(
    'DLQ gönderimi başarısızsa başarı dönmez: %s',
    async (kind) => {
      const error = new Error('Kafka unavailable');
      publish.mockRejectedValueOnce(error);
      if (kind !== 'invalid')
        store.mockResolvedValueOnce({ status: kind, reason: 'test reason' });
      await expect(
        orchestrator.process(
          source(kind === 'invalid' ? '{bozuk' : JSON.stringify(event)),
        ),
      ).rejects.toBe(error);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('DLQ gönderimi onaylanana kadar sonucu döndürmez', async () => {
    let acknowledge!: () => void;
    publish.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
    );
    let completed = false;
    const pending = orchestrator.process(source('{bozuk')).then((result) => {
      completed = true;
      return result;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(publish).toHaveBeenCalledTimes(1);
    acknowledge();
    await expect(pending).resolves.toMatchObject({ status: 'sent-to-dlq' });
  });

  it('Redis tamamlanmadan başarılı sonucu döndürmez', async () => {
    let acknowledge!: () => void;
    update.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        acknowledge = () => resolve(true);
      }),
    );
    let completed = false;
    const pending = orchestrator.process(source()).then((result) => {
      completed = true;
      return result;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    acknowledge();
    await expect(pending).resolves.toMatchObject({ status: 'inserted' });
  });
});
