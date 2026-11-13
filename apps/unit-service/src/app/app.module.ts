import { TypeOrmModule } from '@nestjs/typeorm';

import {
  infrastructureConfig,
} from './config/infrastructure.config.js';

import { UnitModule } from './units/unit.module.js';
import { DeviceModule } from './devices/device.module.js';
import { ReactiveLimitModule } from './reactive-limits/reactive-limit.module.js';

import { UnitEntity } from './units/entities/unit.entity.js';
import { OrganizationUnitLogEntity } from './units/entities/organization-unit-log.js';

import { DeviceEntity } from './devices/entities/device.entity.js';
import { DeviceLogEntity } from './devices/entities/device-log.entity.js';

import { ReactiveLimitEntity } from './reactive-limits/entities/reactive-limit.entity.js';

import {
  Module,
} from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import {
  RedisModule,
  type RedisModuleOptions,
} from '@mini-pms/redis';

import {
  Neo4jModule,
  type Neo4jModuleOptions,
} from '@mini-pms/neo4j';

import {
  INFRASTRUCTURE_CONFIG_KEY,
  type UnitServiceInfrastructureConfig,
} from './config/infrastructure.config.js';

import {
  UNIT_NEO4J_CONSTRAINTS,
} from './units/graph/unit-graph.constraints.js';

import {
  HealthController,
} from './health/health.controller.js';

import {
  HealthService,
} from './health/health.service.js';

function readInfrastructureConfig(
  dependency: unknown,
): UnitServiceInfrastructureConfig {
  if (!(dependency instanceof ConfigService)) {
    throw new Error(
      'Infrastructure module factory requires ConfigService',
    );
  }

  /**
   * ConfigService içinden namespace'in tamamını tek seferde okuyoruz.
   */
  return dependency.getOrThrow<UnitServiceInfrastructureConfig>(
    INFRASTRUCTURE_CONFIG_KEY,
  );
}

/**
 * ConfigService değerlerini ortak RedisModule'ün beklediği option biçimine
 * dönüştürür.
 */
function createRedisModuleOptions(
  dependency: unknown,
): RedisModuleOptions {
  const infrastructure = readInfrastructureConfig(dependency);

  return {
    options: {
      host: infrastructure.redis.host,
      port: infrastructure.redis.port,

      /**
       * ioredis client oluşturulduğunda bağlantı kurmaya başlar.
       *
       * Bağlantı sonradan koparsa ortak Redis factory içerisindeki
       * retryStrategy yeniden bağlanmayı yönetir.
       */
      lazyConnect: false,
    },
  };
}

/**
 * ConfigService değerlerini ortak Neo4jModule'ün beklediği option biçimine
 * dönüştürür.
 */
function createNeo4jModuleOptions(
  dependency: unknown,
): Neo4jModuleOptions {
  const infrastructure = readInfrastructureConfig(dependency);

  return {
    uri: infrastructure.neo4j.uri,
    username: infrastructure.neo4j.username,
    password: infrastructure.neo4j.password,
    database: infrastructure.neo4j.database,

    /**
     * Unit Service'e ait domain constraint'leri ortak Neo4j altyapısına
     * başlangıç yapılandırması olarak veriyoruz.
     */
    constraints: UNIT_NEO4J_CONSTRAINTS,

    /**
     * Neo4j container'ı Unit Service'ten birkaç saniye geç hazır olabilir.
     */
    startupRetry: {
      maxAttempts: 5,
      initialDelayMs: 1_000,
      maxDelayMs: 8_000,
    },
  };
}
@Module({
  imports: [
    /**
     * Environment değerlerini tek noktadan yükler ve ConfigService'i bütün
     * Unit Service modüllerinde kullanılabilir hale getirir.
     *
     * cache=true aynı config değerinin tekrar tekrar hesaplanmasını önler.
     */
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [infrastructureConfig],
    }),

    /**
     * Unit Service process'i başına tek Redis client oluşturur.
     *
     * Bağlantı bilgileri doğrudan process.env yerine ConfigService üzerinden
     * tipli RedisModule seçeneklerine dönüştürülür.
     */
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createRedisModuleOptions,
    }),

    /**
     * Unit Service process'i başına tek Neo4j Driver oluşturur.
     *
     * Uygulama başlangıcında bağlantı doğrulanır ve Unit domain'ine ait
     * idempotent constraint listesi oluşturulur.
     */
    Neo4jModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createNeo4jModuleOptions,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',

      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),

      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,

      entities: [
        UnitEntity,
        OrganizationUnitLogEntity,
        DeviceEntity,
        DeviceLogEntity,
        ReactiveLimitEntity,
      ],

      synchronize: false,
    }),

    UnitModule,
    DeviceModule,
    ReactiveLimitModule,
  ],

  /**
   * HealthController'ı doğrudan AppModule'a kaydediyoruz.
   * Böylece aynı AppModule tarafından import edilen singleton Redis ve
   * Neo4j health provider'larını kullanır; ikinci client/driver oluşturmaz.
   */
  controllers: [
    HealthController,
  ],

  providers: [
    HealthService,
  ],
})
export class AppModule {}
