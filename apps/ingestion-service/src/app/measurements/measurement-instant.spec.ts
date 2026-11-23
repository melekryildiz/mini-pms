import type { ClientProxy } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { ServiceUnavailableException } from '@nestjs/common';
import { NEVER, of, throwError, TimeoutError } from 'rxjs';
import type { RedisService } from '@mini-pms/redis';
import { MeasurementLatestService } from './measurement-latest.service';
import { MeasurementRpcController } from './measurement-rpc.controller';

function meter(id: number) {
  return {
    deviceId: String(id),
    serialNo: `M-${id}`,
    organizationUnitId: '10',
    unitCode: 'TM-10',
    unitName: 'Test TM',
  };
}
function hash(id: number) {
  const data = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    deviceId: String(id),
    serialNo: `M-${id}`,
    organizationUnitId: '10',
    periodStart: '2026-01-01T10:00:00.000Z',
    intervalMinutes: 15,
    producedAt: '2026-01-01T10:15:00.000Z',
    source: 'simulator',
    simulationMode: 'normal',
    activeImportKwh: id,
    activeExportKwh: 0,
    inductiveKvarh: 2,
    capacitiveKvarh: 0.5,
  };
  return {
    periodStartMs: String(Date.parse(data.periodStart)),
    measurement: JSON.stringify(data),
  };
}
describe('Anlık değer okuma', () => {
  let send: jest.Mock;
  let hgetall: jest.Mock;
  let exec: jest.Mock;
  let pipeline: jest.Mock;
  let service: MeasurementLatestService;
  beforeEach(() => {
    send = jest.fn();
    hgetall = jest.fn();
    exec = jest.fn();
    pipeline = jest.fn(() => ({ hgetall, exec }));
    service = new MeasurementLatestService(
      { getClient: () => ({ pipeline }) } as unknown as RedisService,
      { send, close: jest.fn() } as unknown as ClientProxy,
    );
  });
  it('100 sayaç için tek RPC, 100 HGETALL ve tek pipeline exec kullanır', async () => {
    const meters = Array.from({ length: 100 }, (_, i) => meter(i + 1));
    send.mockReturnValue(of(meters));
    exec.mockResolvedValue(meters.map((_, i) => [null, hash(i + 1)]));
    const result = await service.getUnitInstantValues('10');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('unit.getSubtreeMeters', {
      unitId: '10',
    });
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(hgetall).toHaveBeenCalledTimes(100);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(result.meters).toHaveLength(100);
    for (let i = 0; i < 100; i++) {
      expect(hgetall.mock.calls[i][0]).toBe(`mpms:measurement:latest:${i + 1}`);
      expect(result.meters[i].measurement?.activeImportKwh).toBe(i + 1);
    }
    expect(result.meters[0].measurement?.periodEnd).toBe(
      '2026-01-01T10:15:00.000Z',
    );
  });
  it('ölçümü olmayan sayaç listede null ile kalır; sıfır tüketim farklıdır', async () => {
    send.mockReturnValue(of([meter(1), meter(2)]));
    const zero = hash(2);
    zero.measurement = JSON.stringify({
      ...JSON.parse(zero.measurement),
      activeImportKwh: 0,
    });
    exec.mockResolvedValue([
      [null, {}],
      [null, zero],
    ]);
    const result = await service.getUnitInstantValues('10');
    expect(result.meters[0].measurement).toBeNull();
    expect(result.meters[1].measurement?.activeImportKwh).toBe(0);
  });
  it('boş sayaç listesinde Redis çağırmaz', async () => {
    send.mockReturnValue(of([]));
    await expect(service.getUnitInstantValues('10')).resolves.toMatchObject({
      meters: [],
    });
    expect(pipeline).not.toHaveBeenCalled();
  });
  it.each([
    null,
    [],
    [[new Error('Redis failed'), null]],
    [[null, { measurement: '{broken' }]],
    [[null, { ...hash(1), periodStartMs: '0' }]],
    [[null, hash(2)]],
  ])(
    'eksik veya bozuk cache sonucunu veri yok diye gizlemez: %j',
    async (value) => {
      send.mockReturnValue(of([meter(1)]));
      exec.mockResolvedValue(value);
      await expect(service.getUnitInstantValues('10')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );
  it('Unit Service hatasını yukarı taşır', async () => {
    const error = { statusCode: 404, message: 'not found' };
    send.mockReturnValue(throwError(() => error));
    await expect(service.getUnitInstantValues('10')).rejects.toBe(error);
    expect(pipeline).not.toHaveBeenCalled();
  });
  it('Unit Service cevap vermezse 5 saniyede timeout olur', async () => {
    jest.useFakeTimers();
    try {
      send.mockReturnValue(NEVER);
      const assertion = expect(
        service.getUnitInstantValues('10'),
      ).rejects.toBeInstanceOf(TimeoutError);
      await jest.advanceTimersByTimeAsync(5000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('MeasurementRpcController', () => {
  let get: jest.Mock;
  let controller: MeasurementRpcController;
  beforeEach(() => {
    get = jest.fn();
    controller = new MeasurementRpcController({
      getUnitInstantValues: get,
    } as unknown as MeasurementLatestService);
  });
  it('isteği mevcut latest servisine iletir', async () => {
    get.mockResolvedValue({ unitId: '10', meters: [] });
    await expect(
      controller.getUnitInstantValues({ unitId: '10' }),
    ).resolves.toMatchObject({ unitId: '10' });
  });
  it.each(['0', '-1', 'abc', '9223372036854775808'])(
    'hatalı kimliği servise göndermeden reddeder: %s',
    async (unitId) => {
      const error = await controller
        .getUnitInstantValues({ unitId })
        .catch((e) => e);
      expect(error).toBeInstanceOf(RpcException);
      expect(error.getError()).toMatchObject({ statusCode: 400 });
      expect(get).not.toHaveBeenCalled();
    },
  );
  it.each([400, 404, 503, 504])(
    'Unit Service hata kodunu korur: %s',
    async (statusCode) => {
      get.mockRejectedValue({ statusCode, message: 'test reason' });
      const error = await controller
        .getUnitInstantValues({ unitId: '10' })
        .catch((e) => e);
      expect(error.getError()).toEqual({ statusCode, message: 'test reason' });
    },
  );
  it('timeout durumunu 504 yapar', async () => {
    get.mockRejectedValue(new TimeoutError());
    const error = await controller
      .getUnitInstantValues({ unitId: '10' })
      .catch((e) => e);
    expect(error.getError()).toMatchObject({ statusCode: 504 });
  });
});
