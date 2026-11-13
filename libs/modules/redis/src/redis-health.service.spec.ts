import type { RedisService } from './redis.service.js';
import { RedisHealthService } from './redis-health.service.js';

describe('RedisHealthService', () => {
  /**
   * RedisHealthService yalnızca ping metodunu kullanıyor.
   *
   * Bütün RedisService'i taklit etmek yerine ihtiyacımız olan minimum
   * davranışı mockluyoruz.
   */
  let ping: jest.MockedFunction<() => Promise<string>>;
  let healthService: RedisHealthService;

  beforeEach(() => {
    ping = jest.fn().mockResolvedValue('PONG');

    const redisService = {
      ping,
    } as unknown as RedisService;

    healthService = new RedisHealthService(redisService);
  });

  afterEach(() => {
    /**
     * Timeout testinde fake timer kullanıldığı için her testten sonra gerçek
     * timer sistemine dönüyoruz.
     */
    jest.useRealTimers();
  });

  it('Redis PONG döndürdüğünde up sonucu verir', async () => {
    const result = await healthService.check();

    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('Redis beklenmeyen bir cevap döndürdüğünde down sonucu verir', async () => {
    ping.mockResolvedValue('UNEXPECTED');

    const result = await healthService.check();

    expect(result.status).toBe('down');
  });

  it('Redis PING hata attığında down sonucu verir', async () => {
    ping.mockRejectedValue(new Error('Connection unavailable'));

    const result = await healthService.check();

    expect(result.status).toBe('down');
  });

  it('Redis PING zamanında tamamlanmazsa timeout sonrası down döndürür', async () => {
    jest.useFakeTimers();

    /**
     * Hiç resolve veya reject olmayan Promise bağlantının askıda kalmasını
     * temsil eder.
     */
    ping.mockReturnValue(new Promise<string>(() => undefined));

    const healthPromise = healthService.check();

    /**
     * Health servisindeki 2 saniyelik timeout'u sanal zamanda ilerletiyoruz.
     * Testin gerçekten 2 saniye beklemesine gerek kalmaz.
     */
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(healthPromise).resolves.toMatchObject({
      status: 'down',
    });
  });
});
