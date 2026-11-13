/**
 * Redis kütüphanesinin public API yüzeyi.
 *
 * Uygulamalar yalnızca bu dosyada export edilen sınıf, token ve tipleri
 * kullanmalıdır.
 */

export {
  REDIS_CLIENT,
  REDIS_MODULE_OPTIONS,
} from './redis.constants.js';

export {
  RedisModule,
} from './redis.module.js';

export {
  RedisService,
} from './redis.service.js';

export type {
  RedisModuleAsyncOptions,
  RedisModuleOptions,
  RedisModuleOptionsFactory,
} from './redis.interfaces.js';
export {
  RedisHealthService,
} from './redis-health.service.js';

export type {
  RedisHealthResult,
} from './redis-health.service.js';