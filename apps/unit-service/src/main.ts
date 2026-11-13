import {
  Logger,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /**
   * Business endpoint'leri /api altında kalır.
   *
   * Monitoring ve container healthcheck araçlarının standart /health
   * adresini kullanabilmesi için yalnızca GET /health prefix dışında kalır.
   */
  app.setGlobalPrefix('api', {
    exclude: [
      {
        path: 'health',
        method: RequestMethod.GET,
      },
    ],
  });

  // RabbitMQ üzerinden gelen RPC mesajlarını dinle
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [
          process.env.RABBITMQ_URL ??
            'amqp://mpms:mpms_dev_password@localhost:5672',
        ],
        queue: 'mpms.unit',
        queueOptions: {
          durable: true,
        },
        noAck: true,
      },
    },
    {
      inheritAppConfig: true,
    },
  );

  await app.startAllMicroservices();
  Logger.log('TEST: RabbitMQ microservice started');
  // Unit Service hibrit çalışır: iş akışında Gateway ile RabbitMQ üzerinden
  // konuşur; doğrudan HTTP yüzeyi ise yerel teşhis/e2e için 3003'te kalır.
  // Servise özel değişken, ortak PORT değerinin başka uygulamaları etkilemesini önler.
  const port = Number(
    process.env.UNIT_SERVICE_PORT ?? process.env.PORT ?? 3003,
  );
  await app.listen(port);

  Logger.log(`HTTP: http://localhost:${port}/api`);
  Logger.log(`Health: http://localhost:${port}/health`);
  Logger.log('RabbitMQ: listening on mpms.unit');
}

bootstrap();
