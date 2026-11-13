import {
  registerAs,
} from '@nestjs/config';

/**
 * ConfigService içinde kullanılacak namespace.
 *
 * Namespace kullanımı `redis.host` gibi genel anahtarların başka modüllerle
 * çakışmasını engeller. Değerlere ileride şu biçimde erişeceğiz:
 *
 *   configService.get('infrastructure.redis.host')
 */
export const INFRASTRUCTURE_CONFIG_KEY = 'infrastructure';

/**
 * Unit Service'in Redis bağlantısı için ihtiyaç duyduğu tipli ayarlar.
 */
export interface UnitServiceRedisConfig {
  host: string;
  port: number;
}

/**
 * Unit Service'in Neo4j bağlantısı için ihtiyaç duyduğu tipli ayarlar.
 *
 * Parola bu nesnede bulunur fakat hiçbir zaman log veya health cevabına
 * eklenmemelidir.
 */
export interface UnitServiceNeo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
}

/**
 * Ortak altyapı yapılandırmasının tamamı.
 */
export interface UnitServiceInfrastructureConfig {
  redis: UnitServiceRedisConfig;
  neo4j: UnitServiceNeo4jConfig;
}

/**
 * Redis ve Neo4j environment değerlerini tek, tipli bir ConfigService
 * namespace'ine dönüştürür.
 *
 * registerAs kullanmamızın nedenleri:
 * - Environment erişimini uygulamanın farklı yerlerine dağıtmamak.
 * - Redis/Neo4j modüllerini daha sonra ConfigService ile yapılandırabilmek.
 * - Testlerde yalnızca bu config factory'sini izole çalıştırabilmek.
 */
export const infrastructureConfig = registerAs(
  INFRASTRUCTURE_CONFIG_KEY,
  (): UnitServiceInfrastructureConfig => ({
    redis: {
      /**
       * Unit Service host makinede çalışırken Docker Redis portuna localhost
       * üzerinden ulaşır. Container içinde çalıştırıldığında REDIS_HOST=redis
       * verilerek bu varsayılan değiştirilir.
       */
      host: readOptionalString(
        'REDIS_HOST',
        '127.0.0.1',
      ),

      port: readPort(
        'REDIS_PORT',
        6379,
      ),
    },

    neo4j: {
      /**
       * HTTP yönetim portu 7474 değil, uygulama bağlantısı için Bolt portu
       * 7687 kullanılır.
       */
      uri: readOptionalString(
        'NEO4J_URI',
        'bolt://127.0.0.1:7687',
      ),

      username: readOptionalString(
        'NEO4J_USERNAME',
        'neo4j',
      ),

      /**
       * Parolaya güvenli bir varsayılan vermiyoruz. Eksik secret ile
       * bağlantı denemek yerine uygulama başlangıcını açık bir config
       * hatasıyla durduruyoruz.
       */
      password: readRequiredString('NEO4J_PASSWORD'),

      database: readOptionalString(
        'NEO4J_DATABASE',
        'neo4j',
      ),
    },
  }),
);

/**
 * Opsiyonel string değerini okur; boş veya yalnızca whitespace olan değeri
 * verilmemiş kabul edip güvenli varsayılana döner.
 */
function readOptionalString(
  name: string,
  fallback: string,
): string {
  const value = process.env[name]?.trim();

  return value || fallback;
}

/**
 * Zorunlu değerin gerçekten tanımlı ve boş olmadığını doğrular.
 *
 * Hata mesajında değerin kendisini göstermiyoruz. Böylece secret terminale
 * veya merkezi log sistemine sızmaz.
 */
function readRequiredString(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Required environment variable ${name} is missing`,
    );
  }

  return value;
}

/**
 * Port değerini güvenli TCP port aralığında pozitif integer olarak okur.
 */
function readPort(
  name: string,
  fallback: number,
): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(
      `Environment variable ${name} must be a valid TCP port`,
    );
  }

  return value;
}
