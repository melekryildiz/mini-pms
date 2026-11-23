import { Logger } from '@nestjs/common';
import type { EachBatchPayload } from 'kafkajs';
import { MeasurementConsumerService } from './measurement-consumer.service';
import { MeasurementOrchestrator } from './measurement.orchestrator';
import { MEASUREMENT_BATCH_SIZE } from './measurement.constants';

describe('MeasurementConsumerService batch commit', () => {
  let service: MeasurementConsumerService;
  let processBatch: jest.Mock;
  let commit: jest.Mock;
  let handler: (payload: EachBatchPayload) => Promise<void>;
  let order: string[];
  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    order = [];
    processBatch = jest.fn(async (messages) => {
      order.push(`process:${messages.length}`);
      return messages.map(() => ({ status: 'duplicate' }));
    });
    service = new MeasurementConsumerService({
      processBatch,
    } as unknown as MeasurementOrchestrator);
    commit = jest.fn(async (offsets) => {
      order.push(`commit:${offsets[0].offset}`);
    });
    Object.defineProperty(service, 'consumer', {
      value: {
        connect: jest.fn(),
        subscribe: jest.fn(),
        run: jest.fn(async (config) => {
          expect(config.autoCommit).toBe(false);
          expect(config.eachBatchAutoResolve).toBe(false);
          handler = config.eachBatch;
        }),
        commitOffsets: commit,
        stop: jest.fn(),
        disconnect: jest.fn(),
      },
    });
    await service.onApplicationBootstrap();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  function payload(count: number): EachBatchPayload {
    return {
      batch: {
        topic: 'raw',
        partition: 0,
        messages: Array.from({ length: count }, (_, i) => ({
          offset: String(i),
          key: Buffer.from('3'),
          value: Buffer.from('{}'),
        })),
      },
      heartbeat: jest.fn().mockResolvedValue(undefined),
      resolveOffset: jest.fn(),
      isRunning: () => true,
      isStale: () => false,
    } as unknown as EachBatchPayload;
  }
  it('500 sınırını aşan grupta artan mesajları bekletmeden işler', async () => {
    const size = MEASUREMENT_BATCH_SIZE;
    await handler(payload(size + 3));
    expect(order).toEqual([
      `process:${size}`,
      `commit:${size}`,
      'process:3',
      `commit:${size + 3}`,
    ]);
  });
  it('az mesaj geldiğinde grup dolmasını beklemez', async () => {
    await handler(payload(2));
    expect(processBatch.mock.calls[0][0]).toHaveLength(2);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  it('büyük offset değerini hassasiyet kaybetmeden ilerletir', async () => {
    const input = payload(1);
    input.batch.messages[0].offset = '9007199254740993';
    await handler(input);
    expect(commit).toHaveBeenCalledWith([
      { topic: 'raw', partition: 0, offset: '9007199254740994' },
    ]);
  });
  it('hata durumunda commit etmez ve aynı grubu tekrar dener', async () => {
    jest.useFakeTimers();
    processBatch.mockRejectedValueOnce(new Error('DB failure'));
    const work = handler(payload(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(commit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    await work;
    expect(processBatch).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(processBatch.mock.calls[0][0]).toEqual(
      processBatch.mock.calls[1][0],
    );
  });
  it('eski batch durumunda işlem ve commit yapmaz', async () => {
    const input = payload(2);
    input.isStale = () => true;
    await handler(input);
    expect(processBatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
  it('işlem sırasında batch eskirse commit etmez', async () => {
    let stale = false;
    const input = payload(2);
    input.isStale = () => stale;
    processBatch.mockImplementationOnce(async () => {
      stale = true;
      return [{ status: 'duplicate' }, { status: 'duplicate' }];
    });
    await handler(input);
    expect(commit).not.toHaveBeenCalled();
  });
});
