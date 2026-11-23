import { RedisService } from '@mini-pms/redis';
import type { ClientProxy } from '@nestjs/microservices';
import type { MeasurementEvent } from '@mini-pms/contracts';
import { MeasurementLatestService } from './measurement-latest.service';

function measurement(deviceId: string, hour: string): MeasurementEvent {
  return {
    deviceId,
    periodStart: `2026-01-01T${hour}:00.000Z`,
  } as MeasurementEvent;
}

describe('MeasurementLatestService pipeline', () => {
  let evalCommand: jest.Mock;
  let exec: jest.Mock;
  let pipeline: jest.Mock;
  let close: jest.Mock;
  let service: MeasurementLatestService;
  beforeEach(() => {
    evalCommand = jest.fn();
    exec = jest.fn();
    pipeline = jest.fn(() => ({ eval: evalCommand, exec }));
    close = jest.fn().mockResolvedValue(undefined);
    service = new MeasurementLatestService(
      { getClient: () => ({ pipeline }) } as unknown as RedisService,
      { close } as unknown as ClientProxy,
    );
  });
  it('kapanışta Unit Service RPC clientını kapatır', async () => {
    await service.onApplicationShutdown();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('boş listede Redis isteği göndermez', async () => {
    await expect(service.updateManyIfNewer([])).resolves.toBe(0);
    expect(pipeline).not.toHaveBeenCalled();
  });
  it('her cihazın en yeni dönemini bir pipeline ile gönderir', async () => {
    exec.mockResolvedValueOnce([
      [null, 1],
      [null, 0],
    ]);
    const newest = measurement('3', '10:30');
    await expect(
      service.updateManyIfNewer([
        measurement('3', '10:00'),
        newest,
        measurement('3', '10:15'),
        measurement('4', '10:00'),
      ]),
    ).resolves.toBe(1);
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledTimes(2);
    expect(evalCommand.mock.calls[0].slice(1)).toEqual([
      1,
      'mpms:measurement:latest:3',
      String(Date.parse(newest.periodStart)),
      JSON.stringify(newest),
    ]);
    expect(exec).toHaveBeenCalledTimes(1);
  });
  it('aynı dönem tekrarında ilk ölçümü seçer', async () => {
    exec.mockResolvedValueOnce([[null, 1]]);
    const first = measurement('3', '10:00');
    await service.updateManyIfNewer([first, { ...first, eventId: 'other' }]);
    expect(evalCommand.mock.calls[0][4]).toBe(JSON.stringify(first));
  });
  it.each([null, [], [[null, 2]]])(
    'eksik veya geçersiz sonuçta hata verir: %j',
    async (result) => {
      exec.mockResolvedValueOnce(result);
      await expect(
        service.updateManyIfNewer([measurement('3', '10:00')]),
      ).rejects.toThrow();
    },
  );
  it('pipeline komutlarından birinin hatasını yutmaz', async () => {
    const error = new Error('Redis failure');
    exec.mockResolvedValueOnce([
      [null, 1],
      [error, null],
    ]);
    await expect(
      service.updateManyIfNewer([
        measurement('3', '10:00'),
        measurement('4', '10:00'),
      ]),
    ).rejects.toBe(error);
  });
});
