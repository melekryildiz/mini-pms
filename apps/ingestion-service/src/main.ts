/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  // Ctrl+C ve SIGTERM geldiğinde Kafka, Redis ve DB kapanış hook'ları çalışır.
  app.enableShutdownHooks();
  // Gateway'den gelen anlık değer RPC isteklerini dinler.
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [
          process.env.RABBITMQ_URL ??
            'amqp://mpms:mpms_dev_password@localhost:5672',
        ],
        queue: 'mpms.instant',
        queueOptions: { durable: true },
        noAck: true,
      },
    },
    { inheritAppConfig: true },
  );
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.INGESTION_SERVICE_PORT || process.env.PORT || 3004;
  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
