import { MeasurementDlqService } from './measurement-dlq.service';
import type { DlqInput } from './measurement-dlq.service';

describe('MeasurementDlqService bulk send', () => {
  let service: MeasurementDlqService;
  let send: jest.Mock;
  const input: DlqInput = {
    code: 'INVALID_MEASUREMENT',
    reason: 'broken JSON',
    message: {
      topic: 'raw',
      partition: 1,
      offset: '42',
      key: '3',
      raw: '{broken',
    },
  };
  beforeEach(() => {
    service = new MeasurementDlqService();
    send = jest.fn().mockResolvedValue([]);
    Object.defineProperty(service, 'producer', { value: { send } });
  });
  it('boş listede Kafka isteği göndermez', async () => {
    await service.publishMany([]);
    expect(send).not.toHaveBeenCalled();
  });
  it('her kaydın hata ve kaynağını koruyarak tek istekte gönderir', async () => {
    const second: DlqInput = {
      ...input,
      code: 'MEASUREMENT_CONFLICT',
      message: { ...input.message, key: null, offset: '43' },
    };
    await service.publishMany([input, second]);
    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0][0];
    expect(request.acks).toBe(-1);
    expect(request.messages).toHaveLength(2);
    expect(JSON.parse(request.messages[0].value)).toMatchObject({
      original: input.message,
      error: { code: input.code, reason: input.reason },
      failureId: 'raw:1:42',
    });
    expect(request.messages[1].key).toBe('raw:1:43');
  });
  it('Kafka hatasını yukarı taşır', async () => {
    const error = new Error('Kafka failure');
    send.mockRejectedValueOnce(error);
    await expect(service.publishMany([input])).rejects.toBe(error);
  });
});
