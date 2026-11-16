import { registerAs } from '@nestjs/config';

/**
 * ConfigService içinde kullanılacak namespace.
 *
 * `cache.redis.host` gibi isimler yerine config'in tamamını tek anahtar altında
 * tutmak, ileride başka servislerin cache ayarlarıyla isim çakışmasını önler.
 */
export const CACHE_CONFIG_KEY = 'gatewayCache';

/** Gateway'in Redis bağlantısı için ihtiyaç duyduğu tipli ayarlar. */
export interface GatewayRedisConfig {
  host: string;
  port: number;
}

/** Birim detay cache davranışını belirleyen ayarlar. */
export interface UnitDetailCacheConfig {
  /** Cache kaydının Redis'te kaç saniye yaşayacağı. */
  ttlSeconds: number;
}

/** Gateway cache yapılandırmasının tamamı. */
export interface GatewayCacheConfig {
  redis: GatewayRedisConfig;
  unitDetail: UnitDetailCacheConfig;
}

/**
 * Environment değerlerini doğrulanmış ve tipli bir config nesnesine çevirir.
 *
 * Neden doğrudan her serviste `process.env` kullanmıyoruz?
 * - Aynı parsing kodunu farklı dosyalara dağıtmamak için.
 * - Hatalı port veya TTL değerini uygulama açılırken yakalamak için.
 * - Testlerde config üretimini tek başına sınayabilmek için.
 */
export const gatewayCacheConfig = registerAs(
  CACHE_CONFIG_KEY,
  (): GatewayCacheConfig => ({
    redis: {
      // Gateway host makinede çalışırken Docker Redis'e localhost'tan ulaşır.
      // Gateway container'a taşınırsa REDIS_HOST=redis verilmesi yeterlidir.
      host: readOptionalString('REDIS_HOST', '127.0.0.1'),
      port: readPositiveInteger('REDIS_PORT', 6379),
    },
    unitDetail: {
      /**
       * 60 saniye başlangıç için dengeli bir TTL'dir.
       *
       * TTL, invalidation'ın yerine geçmez. Update/delete sonrasında ilgili
       * key ayrıca silinecek; TTL yalnızca unutulmuş/eski kayıtlar için ikinci
       * bir güvenlik katmanıdır.
       */
      ttlSeconds: readPositiveInteger('UNIT_DETAIL_CACHE_TTL_SECONDS', 60),
    },
  }),
);

/** Boş string'i verilmemiş kabul ederek güvenli varsayılana döner. */
function readOptionalString(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/**
 * Port ve TTL için yalnızca pozitif tam sayı kabul eder.
 * `Number('abc')` sonucundaki NaN veya negatif değerler Redis ayarlarına kadar
 * ilerlemeden anlaşılır bir config hatasına dönüştürülür.
 */
function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}
