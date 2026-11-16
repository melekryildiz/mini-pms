import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  RedisModule,
  type RedisModuleOptions,
} from '@mini-pms/redis';

import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Gateway'in genel controller ve service dosyaları.
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Organization Unit HTTP endpointleri.
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';
import { UnitCacheService } from './units/unit-cache.service';

// Device HTTP endpointleri.
import { DevicesController } from './devices/devices.controller';
import { DevicesService } from './devices/devices.service';

// Reactive Limit HTTP endpointleri.
import { ReactiveLimitsController } from './reactive-limits/reactive-limits.controller.js';
import { ReactiveLimitsService } from './reactive-limits/reactive-limits.service.js';
import { RolesGuard } from '../auth/roles.guard';

import { AuthController } from '../auth/auth.controller';
import {
  CACHE_CONFIG_KEY,
  gatewayCacheConfig,
  type GatewayCacheConfig,
} from './config/cache.config';

/**
 * ConfigService içinden Gateway cache yapılandırmasını tipli olarak okur.
 * Eksik veya yanlış provider bağlanırsa uygulama sessizce yanlış ayarla
 * çalışmak yerine başlangıçta anlaşılır bir hata verir.
 */
function readGatewayCacheConfig(
  dependency: unknown,
): GatewayCacheConfig {
  if (!(dependency instanceof ConfigService)) {
    throw new Error(
      'Gateway Redis factory requires ConfigService',
    );
  }

  return dependency.getOrThrow<GatewayCacheConfig>(
    CACHE_CONFIG_KEY,
  );
}

/**
 * Ortak RedisModule'ün anlayacağı bağlantı seçeneklerini üretir.
 * RedisModule bu seçeneklerle Gateway process'i başına tek client oluşturur.
 */
function createRedisOptions(
  dependency: unknown,
): RedisModuleOptions {
  const cacheConfig = readGatewayCacheConfig(dependency);

  return {
    options: {
      host: cacheConfig.redis.host,
      port: cacheConfig.redis.port,

      // İlk cache isteğinde bağlantı kurma gecikmesi yaşanmaması için client
      // Gateway açılırken Redis bağlantısını başlatır.
      lazyConnect: false,
    },
  };
}

@Module({
  imports: [
    /**
     * Environment değerlerini tipli gatewayCacheConfig nesnesine dönüştürür.
     */
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [gatewayCacheConfig],
    }),

    /**
     * Gateway genelinde paylaşılacak tek Redis client'ını oluşturur.
     */
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createRedisOptions,
    }),

    // Unit Service ile RabbitMQ üzerinden haberleşmek
    // için tek bir ClientProxy oluşturuyoruz.
    ClientsModule.register([
      {
        // Service'lerde @Inject('UNIT_SERVICE') ile kullanılır.
        name: 'UNIT_SERVICE',

        // Mesajlaşma protokolü olarak RabbitMQ kullanıyoruz.
        transport: Transport.RMQ,

        options: {
          // RabbitMQ bağlantı adresi.
          urls: [
            process.env.RABBITMQ_URL ??
              'amqp://mpms:mpms_dev_password@localhost:5672',
          ],

          // Unit Service'in dinlediği kuyruk.
          queue: 'mpms.unit',

          // Kuyruğun broker yeniden başladığında
          // tanımının korunmasını sağlar.
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],

  // HTTP isteklerini karşılayan controller'lar.
  controllers: [
    AppController,
    UnitsController,
    DevicesController,
    AuthController,
    ReactiveLimitsController,
  ],

  // Controller'ların kullandığı servisler.
  providers: [
    AppService,
    UnitsService,
    // Unit detay cache key, TTL, JSON ve invalidation işlemlerini yönetir.
    UnitCacheService,
    DevicesService,
    ReactiveLimitsService,

    // Önce JWT doğrulanır.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // Sonra kullanıcının rolü kontrol edilir.
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
