import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service.js';

/**
 * Redis health kontrolünün dışarıya döndüreceği güvenli sonuç tipi.
 *
 * Bağlantı URL'si, host, kullanıcı adı, parola veya hata stack'i
 * health cevabına eklenmez.
 */
export type RedisHealthResult =
  | {
      status: 'up';
      latencyMs: number;
    }
  | {
      status: 'down';
      latencyMs: number;
    };

/**
 * RedisHealthService, Redis'in gerçekten komut kabul edip etmediğini kontrol eder.
 *
 * Bu servis HTTP bilmez. Yalnızca Redis durumunu ölçer.
 * Daha sonra Unit Service'teki HealthService bu sonucu Neo4j sonucuyla
 * birleştirecek.
 */
@Injectable()
export class RedisHealthService {
  /**
   * Health endpoint'in Redis için en fazla ne kadar bekleyeceğini belirler.
   *
   * Redis bağlantısı sorunlu olduğunda /health isteğinin 10-20 saniye
   * beklemesini istemeyiz.
   */
  private static readonly HEALTH_TIMEOUT_MS = 2_000;

  constructor(
    private readonly redisService: RedisService,
  ) {}

  /**
   * Redis'e PING gönderir.
   *
   * Başarılı cevap "PONG" olmalıdır.
   * Hata veya timeout dışarı fırlatılmaz; status: down sonucuna dönüştürülür.
   */
  async check(): Promise<RedisHealthResult> {
    const startedAt = Date.now();

    try {
      const response = await this.pingWithTimeout();

      if (response !== 'PONG') {
        return {
          status: 'down',
          latencyMs: Date.now() - startedAt,
        };
      }

      return {
        status: 'up',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      /**
       * Hata nesnesini burada loglamıyoruz veya response'a eklemiyoruz.
       *
       * Redis URL'si parola içerebilir. Health endpoint için servisin
       * "down" olduğunu bilmek yeterlidir.
       */
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * PING işlemini sınırlı süre içinde tamamlar.
   *
   * Promise.race kullanmamızın nedeni ioredis'in bağlantı kurulmasını
   * beklerken health endpoint'ini uzun süre bloke etmesini önlemektir.
   */
  private async pingWithTimeout(): Promise<string> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Redis health check timed out'));
      }, RedisHealthService.HEALTH_TIMEOUT_MS);
    });

    try {
      return await Promise.race([
        this.redisService.ping(),
        timeoutPromise,
      ]);
    } finally {
      /**
       * PING timeout olmadan tamamlanırsa bekleyen timer'ı temizleriz.
       *
       * Timer temizlenmezse Node.js event loop gereksiz yere açık kalabilir
       * ve testler yavaş kapanabilir.
       */
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}