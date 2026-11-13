import {
  Neo4jHealthService,
} from './neo4j-health.service.js';

import type {
  Neo4jService,
} from './neo4j.service.js';

describe('Neo4jHealthService', () => {
  /**
   * Health servisi Neo4jService'in yalnızca verifyConnectivity metodunu
   * kullanır. Gerçek driver ve veritabanı bağlantısı oluşturmadan bu küçük
   * yüzeyi mockluyoruz.
   */
  let verifyConnectivity:
    jest.MockedFunction<() => Promise<void>>;

  let healthService: Neo4jHealthService;

  beforeEach(() => {
    verifyConnectivity = jest
      .fn()
      .mockResolvedValue(undefined);

    const neo4jService = {
      verifyConnectivity,
    } as unknown as Neo4jService;

    healthService = new Neo4jHealthService(neo4jService);
  });

  afterEach(() => {
    /**
     * Timeout senaryolarında sanal timer kullandığımız için her testten sonra
     * Jest'i gerçek timer sistemine döndürüyoruz. Aksi halde bir testin timer
     * durumu sonraki testi etkileyebilir.
     */
    jest.useRealTimers();
  });

  it('Neo4j bağlantısı doğrulandığında up sonucu verir', async () => {
    const result = await healthService.check();

    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(verifyConnectivity).toHaveBeenCalledTimes(1);
  });

  it('Neo4j bağlantı kontrolü hata attığında down sonucu verir', async () => {
    verifyConnectivity.mockRejectedValue(
      new Error('Connection unavailable'),
    );

    /**
     * Health servisi ham driver hatasını dışarı fırlatmamalıdır. Hata güvenli
     * bir down sonucuna dönüştürülmelidir.
     */
    await expect(healthService.check()).resolves.toMatchObject({
      status: 'down',
    });

    expect(verifyConnectivity).toHaveBeenCalledTimes(1);
  });

  it('bağlantı kontrolü askıda kalırsa 2 saniye sonra down döndürür', async () => {
    jest.useFakeTimers();

    /**
     * Resolve veya reject olmayan Promise, driver'ın bağlantı kurmaya
     * çalışırken askıda kaldığı durumu temsil eder.
     */
    verifyConnectivity.mockReturnValue(
      new Promise<void>(() => undefined),
    );

    const healthPromise = healthService.check();

    // Gerçekte iki saniye beklemeden health timeout süresini ilerletiyoruz.
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(healthPromise).resolves.toEqual({
      status: 'down',
      latencyMs: 2_000,
    });
  });

  it('bağlantı kontrolü tamamlanınca bekleyen timeout timerını temizler', async () => {
    jest.useFakeTimers();

    await expect(healthService.check()).resolves.toMatchObject({
      status: 'up',
    });

    /**
     * Timeout timer'ı temizlenmeseydi burada bir bekleyen timer kalırdı.
     * Bu kontrol Node.js process'inin ve Jest'in gereksiz açık handle ile
     * beklememesini doğrular.
     */
    expect(jest.getTimerCount()).toBe(0);
  });
});
