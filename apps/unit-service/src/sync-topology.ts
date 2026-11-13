import {
  Logger,
  type INestApplicationContext,
} from '@nestjs/common';

import {
  NestFactory,
} from '@nestjs/core';

import {
  AppModule,
} from './app/app.module.js';

import {
  TopologySyncService,
} from './app/topology/topology-sync.service.js';

/**
 * sync-topology bakım komutunun loglarında kullanılacak context adıdır.
 */
const LOGGER_CONTEXT = 'SyncTopology';

/**
 * PostgreSQL'deki güncel Unit ve Device kayıtlarından Neo4j topology
 * projection'ını yeniden oluşturan komutun giriş noktasıdır.
 */
async function syncTopology(): Promise<void> {
  
  let applicationContext:
    | INestApplicationContext
    | undefined;

  try {
    /**
    * NestFactory.create(AppModule) kullansaydık HTTP uygulaması oluşturmuş
    * olurduk. Burada controller dinlemek veya port açmak istemiyoruz.
    */
    applicationContext =
      await NestFactory.createApplicationContext(
        AppModule,
        {
          abortOnError: false,
        },
      );

    const topologySyncService =
      applicationContext.get(TopologySyncService);

    Logger.log(
      'Topology synchronization started',
      LOGGER_CONTEXT,
    );

   
    const result = await topologySyncService.sync();

    Logger.log(
      [
        'Topology synchronization completed successfully.',
        `Units: ${result.unitCount}.`,
        `Devices: ${result.deviceCount}.`,
      ].join(' '),
      LOGGER_CONTEXT,
    );
  } catch (error: unknown) {
    
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown topology synchronization error';

    Logger.error(
      `Topology synchronization failed: ${message}`,
      undefined,
      LOGGER_CONTEXT,
    );

    /**
     * process.exit(1) kullanmıyoruz.
     *
     * process.exit() process'i anında durdurabilir ve finally bloğundaki
     * bağlantı kapatma işlemlerinin çalışmasını engelleyebilir.
     *
     * exitCode yalnızca işlem tamamlandığında terminale başarısız sonuç
     * döndürülmesini sağlar.
     */
    process.exitCode = 1;
  } finally {
    /**
     * Application context oluşturulduysa kapatılır.
     */
    await applicationContext?.close();
  }
}

/**
 * Async fonksiyonu başlatıyoruz.
 *
 * Promise'i bilinçli olarak dışarıda await
 * etmiypruz TypeScript ve ESLint e. Fonksiyon kendi hata yönetimini
 * try/catch/finally ile yapıyor.
 */
void syncTopology();