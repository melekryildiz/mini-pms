import { Test, type TestingModule } from '@nestjs/testing';
import type { ConfigService } from '@nestjs/config';
import type { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';

import {
  RedisModule,
  RedisService,
} from '@mini-pms/redis';

import type { GatewayCacheConfig } from '../config/cache.config';
import { UnitCacheService } from './unit-cache.service';
import { UnitsService } from './units.service';

/**
 * Bu test gerçek yerel Redis bağlantısı gerektirdiği için normal birim testi
 * koşusunda çalışmaz. Şu environment ile açıkça etkinleştirilir:
 *
 * RUN_REDIS_INTEGRATION=1 pnpm exec jest ...
 *
 * Test PostgreSQL veya gerçek Unit Service verisini değiştirmez. RPC cevabını
 * taklit eder ve yalnız kendisine ait benzersiz Redis key'ini kullanır.
 */
const describeRedisIntegration =
  process.env.RUN_REDIS_INTEGRATION === '1' ? describe : describe.skip;

describeRedisIntegration('Unit detail cache Redis integration', () => {
  let testingModule: TestingModule;
  let cacheService: UnitCacheService;
  let unitsService: UnitsService;

  const unitId = `f2t5-integration-${process.pid}-${Date.now()}`;
  const client = {
    send: jest.fn(),
  };

  beforeAll(async () => {
    testingModule = await Test.createTestingModule({
      imports: [
        RedisModule.forRoot({
          options: {
            host: process.env.REDIS_HOST ?? '127.0.0.1',
            port: Number(process.env.REDIS_PORT ?? 6379),
            lazyConnect: false,
          },
        }),
      ],
    }).compile();

    const redisService = testingModule.get(RedisService);
    const config: GatewayCacheConfig = {
      redis: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      unitDetail: {
        ttlSeconds: 60,
      },
    };

    const configService = {
      getOrThrow: jest.fn().mockReturnValue(config),
    } as unknown as ConfigService;

    cacheService = new UnitCacheService(redisService, configService);
    unitsService = new UnitsService(
      client as unknown as ClientProxy,
      cacheService,
    );

    // Önceki yarım kalmış bir test aynı process/id kombinasyonunu bırakmışsa
    // bile başlangıç durumunun kesinlikle cache miss olmasını sağlar.
    await cacheService.invalidate(unitId);
  });

  afterAll(async () => {
    await cacheService.invalidate(unitId);
    await testingModule.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ilk isteği kaynaktan, ikinci isteği 20 ms altında Redis cache üzerinden döndürür', async () => {
    const sourceUnit = {
      id: unitId,
      name: 'F2-T5 integration unit',
    };

    client.send.mockReturnValue(of(sourceUnit));

    // İlk çağrı cache miss olur ve taklit edilen RPC kaynağına gider.
    await expect(unitsService.findOne(unitId)).resolves.toEqual(sourceUnit);
    expect(client.send).toHaveBeenCalledTimes(1);

    client.send.mockClear();

    const startedAt = performance.now();
    const cachedResult = await unitsService.findOne(unitId);
    const cacheHitDurationMs = performance.now() - startedAt;

    expect(cachedResult).toEqual(sourceUnit);
    expect(client.send).not.toHaveBeenCalled();
    expect(cacheHitDurationMs).toBeLessThan(20);
  });

  it('update sonrasında eski Redis verisini döndürmez', async () => {
    const oldUnit = {
      id: unitId,
      name: 'Old name',
    };
    const updatedUnit = {
      id: unitId,
      name: 'Updated name',
    };

    await cacheService.set(unitId, oldUnit);

    client.send.mockImplementation((pattern: string) => {
      if (pattern === 'unit.update') {
        return of({ success: true, data: updatedUnit });
      }

      if (pattern === 'unit.findOne') {
        return of(updatedUnit);
      }

      return of({ success: true });
    });

    await unitsService.update(
      unitId,
      { name: updatedUnit.name },
      'f2t5-test',
    );

    const detailAfterUpdate = await unitsService.findOne(unitId);

    expect(client.send).toHaveBeenCalledWith('unit.findOne', { id: unitId });
    expect(detailAfterUpdate).toEqual(updatedUnit);
    expect(detailAfterUpdate).not.toEqual(oldUnit);
  });
});
