
import { Logger, ValidationPipe } from '@nestjs/common';
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

  app.setGlobalPrefix('api');

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
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  Logger.log(`HTTP: http://localhost:${port}/api`);
  Logger.log('RabbitMQ: listening on mpms.unit');
}

bootstrap();
