import {
  Injectable,
} from '@nestjs/common';

import {
  RedisHealthService,
  type RedisHealthResult,
} from '@mini-pms/redis';

import {
  Neo4jHealthService,
  type Neo4jHealthResult,
} from '@mini-pms/neo4j';


export interface UnitServiceHealthResult {
  /**
   * Bütün bağımlılıklar çalışıyorsa ok,
   * en az bir bağımlılık çalışmıyorsa degraded.
   */
  status: 'ok' | 'degraded';

  /**
   * Her altyapı bağımlılığının kendi health sonucu.
   */
  dependencies: {
    redis: RedisHealthResult;
    neo4j: Neo4jHealthResult;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly redisHealthService: RedisHealthService,
    private readonly neo4jHealthService: Neo4jHealthService,
  ) {}

  async check(): Promise<UnitServiceHealthResult> {
    /**
     * Redis ve Neo4j kontrolleri birbirinden bağımsızdır.
     *
     * Sırayla await etseydik toplam süre:
     *
     * Redis süresi + Neo4j süresi
     *
     * olurdu. Promise.all ile ikisini paralel çalıştırıyoruz; toplam bekleme
     * yaklaşık olarak en yavaş kontrolün süresi kadar olur.
     */
    const [
      redis,
      neo4j,
    ] = await Promise.all([
      this.redisHealthService.check(),
      this.neo4jHealthService.check(),
    ]);

    /**
     * Servis ancak iki bağımlılık da kullanılabilir olduğunda tamamen
     * sağlıklı kabul edilir.
     */
    const allDependenciesAreUp =
      redis.status === 'up' &&
      neo4j.status === 'up';

    return {
      status: allDependenciesAreUp
        ? 'ok'
        : 'degraded',

      dependencies: {
        redis,
        neo4j,
      },
    };
  }
}