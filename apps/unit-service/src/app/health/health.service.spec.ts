import type {
  RedisHealthService,
} from '@mini-pms/redis';

import type {
  Neo4jHealthService,
} from '@mini-pms/neo4j';

import {
  HealthService,
} from './health.service.js';

describe('HealthService', () => {
  let redisCheck: jest.MockedFunction<RedisHealthService['check']>;
  let neo4jCheck: jest.MockedFunction<Neo4jHealthService['check']>;
  let healthService: HealthService;

  beforeEach(() => {
    redisCheck = jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 2,
    });

    neo4jCheck = jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 5,
    });

    healthService = new HealthService(
      {
        check: redisCheck,
      } as unknown as RedisHealthService,
      {
        check: neo4jCheck,
      } as unknown as Neo4jHealthService,
    );
  });

  it('Redis ve Neo4j up olduğunda ok sonucu verir', async () => {
    await expect(healthService.check()).resolves.toEqual({
      status: 'ok',
      dependencies: {
        redis: {
          status: 'up',
          latencyMs: 2,
        },
        neo4j: {
          status: 'up',
          latencyMs: 5,
        },
      },
    });

    expect(redisCheck).toHaveBeenCalledTimes(1);
    expect(neo4jCheck).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Redis', 'down', 'up'],
    ['Neo4j', 'up', 'down'],
    ['iki bağımlılık', 'down', 'down'],
  ] as const)(
    '%s kullanılamadığında degraded sonucu verir',
    async (_description, redisStatus, neo4jStatus) => {
      redisCheck.mockResolvedValue({
        status: redisStatus,
        latencyMs: 10,
      });

      neo4jCheck.mockResolvedValue({
        status: neo4jStatus,
        latencyMs: 20,
      });

      const result = await healthService.check();

      expect(result.status).toBe('degraded');
      expect(result.dependencies.redis.status).toBe(redisStatus);
      expect(result.dependencies.neo4j.status).toBe(neo4jStatus);
    },
  );

  it('iki health kontrolünü sırayla beklemek yerine birlikte başlatır', async () => {
    let resolveRedis: (() => void) | undefined;
    let resolveNeo4j: (() => void) | undefined;

    redisCheck.mockReturnValue(
      new Promise((resolve) => {
        resolveRedis = () => resolve({
          status: 'up',
          latencyMs: 1,
        });
      }),
    );

    neo4jCheck.mockReturnValue(
      new Promise((resolve) => {
        resolveNeo4j = () => resolve({
          status: 'up',
          latencyMs: 1,
        });
      }),
    );

    const healthPromise = healthService.check();

    /**
     * Promise'leri resolve etmeden önce iki check de çağrılmış olmalıdır.
     * Bu, ikinci kontrolün birincinin tamamlanmasını beklemediğini kanıtlar.
     */
    expect(redisCheck).toHaveBeenCalledTimes(1);
    expect(neo4jCheck).toHaveBeenCalledTimes(1);

    resolveRedis?.();
    resolveNeo4j?.();

    await expect(healthPromise).resolves.toMatchObject({
      status: 'ok',
    });
  });
});
