import type { Redis } from 'ioredis';
import { RedisService } from './redis.service.js';

/**
 * Gerçek Redis yerine kullandığımız minimum mock client tipi.
 *
 * Yalnızca RedisService'in bu testlerde kullandığı metotları tanımlıyoruz.
 */
type MockRedisClient = {
  status: string;
  ping: jest.MockedFunction<() => Promise<string>>;
  get: jest.MockedFunction<(key: string) => Promise<string | null>>;
  set: jest.MockedFunction<(...args: unknown[]) => Promise<'OK'>>;
  del: jest.MockedFunction<(...keys: string[]) => Promise<number>>;
  quit: jest.MockedFunction<() => Promise<'OK'>>;
};

describe('RedisService', () => {
  let client: MockRedisClient;
  let service: RedisService;

  beforeEach(() => {
    /**
     * Her test için yeni mock oluşturuyoruz.
     *
     * Böylece bir testte yapılan çağrılar diğer testi etkilemez.
     */
    client = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    /**
     * RedisService constructor'ı gerçek Redis tipi bekliyor.
     *
     * Mock nesnemiz aynı metotları sunduğu için test sınırında Redis tipine
     * dönüştürüyoruz. Uygulama kodunda böyle bir cast kullanılmayacak.
     */
    service = new RedisService(client as unknown as Redis);
  });

  it('PING komutunu aynı Redis client üzerinden çalıştırır', async () => {
    await expect(service.ping()).resolves.toBe('PONG');

    expect(client.ping).toHaveBeenCalledTimes(1);
  });

  it('bir key değerini Redis client üzerinden okur', async () => {
    client.get.mockResolvedValue('cached-value');

    await expect(service.get('unit:5')).resolves.toBe('cached-value');

    expect(client.get).toHaveBeenCalledWith('unit:5');
  });

  it('TTL olmadan normal SET komutu gönderir', async () => {
    await service.set('unit:5', '{"id":"5"}');

    expect(client.set).toHaveBeenCalledWith('unit:5', '{"id":"5"}');
  });

  it('TTL verildiğinde EX seçeneğiyle SET komutu gönderir', async () => {
    await service.set('unit:5', '{"id":"5"}', 300);

    expect(client.set).toHaveBeenCalledWith('unit:5', '{"id":"5"}', 'EX', 300);
  });

  it('verilen keyleri DEL komutuna aktarır', async () => {
    client.del.mockResolvedValue(2);

    await expect(service.delete('unit:5', 'unit:list')).resolves.toBe(2);

    expect(client.del).toHaveBeenCalledWith('unit:5', 'unit:list');
  });

  it('key verilmediyse Redis sunucusuna DEL göndermez', async () => {
    await expect(service.delete()).resolves.toBe(0);

    expect(client.del).not.toHaveBeenCalled();
  });

  it('uygulama kapanırken açık Redis bağlantısını kapatır', async () => {
    client.status = 'ready';

    await service.onApplicationShutdown();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('Redis bağlantısı zaten kapalıysa tekrar quit çağırmaz', async () => {
    client.status = 'end';

    await service.onApplicationShutdown();

    expect(client.quit).not.toHaveBeenCalled();
  });
});
