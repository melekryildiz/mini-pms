import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';

/**
 * Uygulama kodunun Redis client'a eriştiği ortak servis katmanıdır.
 *
 * Her feature kendi `new Redis()` bağlantısını oluşturmaz. Bütün komutlar
 * NestJS tarafından oluşturulan aynı client üzerinden çalışır.
 */
@Injectable()
export class RedisService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly client: Redis,
  ) {}

  /**
   * Redis bağlantısının gerçekten cevap verip vermediğini kontrol eder.
   *
   * Client nesnesinin bellekte bulunması Redis'in çalıştığı anlamına gelmez.
   * PING komutu Redis server'a gerçek bir ağ isteği gönderir.
   */
  ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * String değer okur.
   *
   * Key bulunamazsa Redis null döndürür.
   */
  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * String değer yazar.
   *
   * ttlSeconds verilirse key belirlenen süre sonunda otomatik silinir.
   * TTL verilmezse değer süresiz saklanır.
   */
  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(key, value);
  }

  /**
   * Bir veya birden fazla key'i siler.
   *
   * Dönüş değeri gerçekten silinen key sayısıdır.
   */
  delete(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return Promise.resolve(0);
    }

    return this.client.del(...keys);
  }

  /**
   * İleri seviye işlemler için aynı Redis client'ına kontrollü erişim sağlar.
   *
   * Örneğin:
   * - publish/subscribe
   * - distributed lock
   * - list queue
   * - pipeline
   *
   * Buradan alınan client ile yeni bağlantı oluşturulmaz.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * NestJS uygulaması kontrollü biçimde kapanırken Redis bağlantısını kapatır.
   *
   * quit():
   * - Bekleyen komutların tamamlanmasına fırsat verir.
   * - Redis'e QUIT komutu gönderir.
   * - TCP bağlantısını kontrollü kapatır.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit();
  }
}