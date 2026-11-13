import { Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import type { RedisModuleOptions } from './redis.interfaces.js';

/**
 * Bu logger yalnızca bağlantı durumunu bildirir.
 *
 * Redis URL'si, kullanıcı adı, parola veya gönderilen Redis komutları
 * loglanmaz.
 */
const logger = new Logger('RedisClient');

/**
 * Uygulama başına kullanılacak tek ioredis client'ını oluşturur.
 *
 * Fonksiyonu NestJS modülünden ayrı tutuyoruz çünkü:
 * - Kolay birim testi yazabiliriz.
 * - Retry ayarlarını tek yerde tutarız.
 * - Farklı servislerin farklı `new Redis()` kodları yazmasını engelleriz.
 */
export function createRedisClient(
  moduleOptions: RedisModuleOptions,
): Redis {
  /**
   * ioredis bağlantı koptuğunda varsayılan olarak yeniden bağlanmayı dener.
   *
   * retryStrategy:
   * - İlk hatalarda kısa bekler.
   * - Bekleme süresi giderek artar.
   * - En fazla 2 saniyeye çıkar.
   *
   * Böylece Redis kısa süreli kapandığında uygulamayı yeniden başlatmaya
   * gerek kalmadan bağlantı toparlanabilir.
   */
  const defaultOptions: RedisOptions = {
    enableReadyCheck: true,
    connectTimeout: 10_000,
    maxRetriesPerRequest: 3,

    retryStrategy(attempt: number): number {
      return Math.min(attempt * 200, 2_000);
    },
  };

  /**
   * Uygulamaya özel seçenekler varsayılanların üzerine yazılabilir.
   *
   * Örneğin testte retryStrategy kapatılabilir veya farklı database
   * seçilebilir.
   */
  const redisOptions: RedisOptions = {
    ...defaultOptions,
    ...moduleOptions.options,
  };

  /**
   * URL varsa URL constructor'ını, yoksa options constructor'ını kullanırız.
   *
   * Her iki durumda da yalnızca bir Redis instance oluşturulur.
   */
  const client = moduleOptions.url
    ? new Redis(moduleOptions.url, redisOptions)
    : new Redis(redisOptions);

  /**
   * EventEmitter üzerindeki "error" eventi dinlenmezse Node.js bazı hata
   * durumlarında unhandled error davranışı gösterebilir.
   *
   * Hata nesnesini doğrudan loglamıyoruz; bağlantı URL'si veya başka hassas
   * bilgi içerebilme ihtimaline karşı yalnızca güvenli bir mesaj yazıyoruz.
   */
  client.on('error', () => {
    logger.warn('Redis connection error; the client will retry');
  });

  client.on('ready', () => {
    logger.log('Redis connection is ready');
  });

  client.on('reconnecting', () => {
    logger.warn('Redis connection lost; reconnecting');
  });

  return client;
}