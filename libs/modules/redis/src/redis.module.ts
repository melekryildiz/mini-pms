import {
  DynamicModule,
  Module,
  type Provider,
} from '@nestjs/common';
import {
  REDIS_CLIENT,
  REDIS_MODULE_OPTIONS,
} from './redis.constants.js';
import { createRedisClient } from './redis-client.factory.js';
import type {
  RedisModuleAsyncOptions,
  RedisModuleOptions,
} from './redis.interfaces.js';
import { RedisService } from './redis.service.js';
import { RedisHealthService } from './redis-health.service.js';

/**
 * Redis altyapısını NestJS dependency injection sistemine bağlayan modüldür.
 *
 * Bu modül her feature'ın kendi Redis bağlantısını oluşturmasını engeller.
 */
@Module({})
export class RedisModule {
  /**
   * Bağlantı seçenekleri uygulama başlatılırken doğrudan biliniyorsa kullanılır.
   *
   * Örnek:
   * RedisModule.forRoot({
   *   options: {
   *     host: 'localhost',
   *     port: 6379,
   *   },
   * })
   */
  static forRoot(options: RedisModuleOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [
  {
    provide: REDIS_MODULE_OPTIONS,
    useValue: options,
  },

  // Uygulama başına tek ioredis client oluşturur.
  this.createClientProvider(),

  // Redis komutlarını ortak client üzerinden çalıştırır.
  RedisService,

  // Redis'in gerçek PING cevabını health sonucuna dönüştürür.
  RedisHealthService,
],
exports: [
  REDIS_CLIENT,
  RedisService,
  RedisHealthService,
],
    };
  }

  /**
   * Bağlantı seçenekleri environment veya başka provider'lardan üretilecekse
   * kullanılır.
   *
   * Unit Service'te kullanacağımız yöntem budur.
   */
  static forRootAsync(
    options: RedisModuleAsyncOptions,
  ): DynamicModule {
    const optionsProvider: Provider = {
      provide: REDIS_MODULE_OPTIONS,
      inject: options.inject ?? [],
      useFactory: options.useFactory,
    };

    return {
      module: RedisModule,
      imports: options.imports ?? [],
      providers: [
        optionsProvider,

        // Asenkron üretilen bağlantı seçenekleriyle tek client oluşturulur.
        this.createClientProvider(),

        RedisService,
        RedisHealthService,
        ],
        exports: [
        REDIS_CLIENT,
        RedisService,
        RedisHealthService,
        ],
    };
  }

  /**
   * REDIS_MODULE_OPTIONS provider'ını kullanarak tek ioredis client oluşturur.
   *
   * NestJS provider'ları varsayılan olarak singleton scope'a sahiptir.
   * Bu factory uygulama bootstrap sırasında bir kez çalışır.
   */
  private static createClientProvider(): Provider {
    return {
      provide: REDIS_CLIENT,
      inject: [REDIS_MODULE_OPTIONS],
      useFactory: (options: RedisModuleOptions) =>
        createRedisClient(options),
    };
  }
}