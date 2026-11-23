import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module.js';
import { SimulationRunnerService } from './app/simulation-runner.service.js';
import { readSimulationOptions } from './app/simulation-options.js';

async function bootstrap(): Promise<void> {
  // Geçersiz komutta RabbitMQ/Kafka bağlantıları açılmaz.
  const options = readSimulationOptions();

  /**
   * Simulator bir HTTP sunucusu olmadığı için port açmayız. Application
   * context bize yalnızca NestJS DI ve lifecycle yönetimini sağlar.
   */
  const application = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
  });
  const controller = new AbortController();

  // Sinyal geldiğinde canlı döngüye veya backfill'e kapanmasını bildiriyoruz.
  const stop = (): void => controller.abort();

  process.once('SIGINT', stop); // Ctrl+C
  process.once('SIGTERM', stop); // Sürecin durdurulması

  try {
    const runner = application.get(SimulationRunnerService);

    if (options.mode === 'backfill') {
      // Backfill sonlu bir iştir; aralık bitince kapanır.
      await runner.runBackfill(options.from, options.to, controller.signal);
    } else {
      // Diğer modlar yeni dönemleri bekleyerek çalışır.
      await runner.runLive(options.mode, controller.signal);
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);

    // Döngü durduktan sonra broker bağlantılarını kapatıyoruz.
    await application.close();
  }
}

void bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : 'Simulator çalıştırılamadı.',
    undefined,
    'Simulator',
  );

  process.exitCode = 1;
});
