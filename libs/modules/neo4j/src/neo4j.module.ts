import {
  DynamicModule,
  Module,
  type Provider,
} from '@nestjs/common';

import {
  NEO4J_DRIVER,
  NEO4J_MODULE_OPTIONS,
} from './neo4j.constants.js';

import {
  createNeo4jDriver,
} from './neo4j-driver.factory.js';

import type {
  Neo4jModuleAsyncOptions,
  Neo4jModuleOptions,
} from './neo4j.interfaces.js';

import {
  Neo4jService,
} from './neo4j.service.js';

import {
  Neo4jConstraintInitializer,
} from './neo4j-constraint.initializer.js';

import {
  Neo4jHealthService,
} from './neo4j-health.service.js';
/**
 * Neo4j altyapısını NestJS dependency injection sistemine bağlar.
 *
 * Modülün temel garantisi:
 * Bir NestJS application container içerisinde yalnızca bir Driver oluşturmak.
 */
@Module({})
export class Neo4jModule {
  /**
   * Bağlantı seçenekleri doğrudan biliniyorsa kullanılır.
   *
   * Daha çok test veya küçük uygulamalar için uygundur.
   */
  static forRoot(
    options: Neo4jModuleOptions,
  ): DynamicModule {
    return {
      /**
       * Yalnızca forRoot ile yapılandırılan dynamic module global olur.
       * Feature modülleri aynı Neo4jService ve tek Driver instance'ını
       * ikinci kez bağlantı yapılandırmadan inject edebilir.
       */
      global: true,

      module: Neo4jModule,

      providers: [
        {
          provide: NEO4J_MODULE_OPTIONS,
          useValue: options,
        },

        this.createDriverProvider(),

        Neo4jService,
        Neo4jHealthService,
        Neo4jConstraintInitializer,
      ],

      exports: [
        /**
         * İleri seviye ihtiyaçlar için driver export ediliyor.
         */
        NEO4J_DRIVER,
        Neo4jHealthService,
        Neo4jService,
      ],
    };
  }

  /**
   * Bağlantı seçenekleri environment veya ConfigService üzerinden
   * üretilecekse kullanılır.
   *
   * Unit Service entegrasyonunda kullanacağımız yöntem budur.
   */
  static forRootAsync(
    options: Neo4jModuleAsyncOptions,
  ): DynamicModule {
    const optionsProvider: Provider = {
      provide: NEO4J_MODULE_OPTIONS,
      inject: options.inject ?? [],
      useFactory: options.useFactory,
    };

    return {
      /**
       * AppModule'da forRootAsync ile bir kez yapılandırılan Neo4j altyapısı
       * bütün feature modüllerinde aynı Driver üzerinden kullanılır.
       */
      global: true,

      module: Neo4jModule,

      imports: options.imports ?? [],

      providers: [
        optionsProvider,
        this.createDriverProvider(),
        Neo4jService,
         Neo4jHealthService,
         Neo4jConstraintInitializer,
      ],

      exports: [
        NEO4J_DRIVER,
        Neo4jService,
        Neo4jHealthService,
      ],
    };
  }

  /**
   * NEO4J_MODULE_OPTIONS değerinden tek Driver oluşturan provider.
   *
   * NestJS provider'ları default singleton scope'a sahip olduğu için
   * useFactory application container başına yalnızca bir kez çalışır.
   */
  private static createDriverProvider(): Provider {
    return {
      provide: NEO4J_DRIVER,
      inject: [NEO4J_MODULE_OPTIONS],

      useFactory: (
        options: Neo4jModuleOptions,
      ) => createNeo4jDriver(options),
    };
  }
}
