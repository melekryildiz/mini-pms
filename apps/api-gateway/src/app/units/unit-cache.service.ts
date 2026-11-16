import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '@mini-pms/redis';

import {
  CACHE_CONFIG_KEY,
  type GatewayCacheConfig,
} from '../config/cache.config';

/**
 *  UnitsService iş akışını; bu servis ise cache ayrıntılarını
 * yönetecek.
 */
@Injectable()
export class UnitCacheService {
  private readonly logger = new Logger(UnitCacheService.name);

  /**
   * Bütün Unit detail key'lerinin aynı namespace altında bulunmasını sağlar.
   */
  private readonly keyPrefix = 'gateway:unit:detail';

  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    const cacheConfig =
      configService.getOrThrow<GatewayCacheConfig>(CACHE_CONFIG_KEY);

    this.ttlSeconds = cacheConfig.unitDetail.ttlSeconds;
  }

  /**
   * Unit ID'den Redis key üretir.
   *
   * Key üretimini merkezi tutmak önemlidir. get(), set() ve invalidate()
   * farklı key biçimleri kullansaydı update sonrası eski kayıt silinmezdi.
   */
  private createKey(unitId: string): string {
    return `${this.keyPrefix}:${encodeURIComponent(unitId)}`;
  }

  /**
   * Redis'ten Unit detayını okumaya çalışır.
   */
  async get<T>(unitId: string): Promise<T | null> {
    const key = this.createKey(unitId);

    try {
      const cachedValue = await this.redisService.get(key);

      if (cachedValue === null) {
        return null;
      }

      try {
        /**
         * Redis yalnız string saklar. Bu nedenle yazarken JSON.stringify,
         * okurken JSON.parse kullanıyoruz.
         */
        return JSON.parse(cachedValue) as T;
      } catch {
        this.logger.warn(
          `Invalid cached unit detail removed for unit ${unitId}`,
        );

        await this.invalidate(unitId);

        return null;
      }
    } catch {
      this.logger.warn(`Unit detail cache read failed for unit ${unitId}`);

      return null;
    }
  }

  /**
   * Unit detayını belirlenen TTL ile Redis'e yazar.
   */
  async set<T>(unitId: string, value: T): Promise<void> {
    const key = this.createKey(unitId);

    try {
      await this.redisService.set(key, JSON.stringify(value), this.ttlSeconds);
    } catch {
      this.logger.warn(`Unit detail cache write failed for unit ${unitId}`);
    }
  }

  /**
   * Update veya delete sonrasında eski Unit detayını cache'ten kaldırır.
   */
  async invalidate(unitId: string): Promise<void> {
    const key = this.createKey(unitId);

    try {
      await this.redisService.delete(key);
    } catch {
      this.logger.warn(
        `Unit detail cache invalidation failed for unit ${unitId}`,
      );
    }
  }
}
