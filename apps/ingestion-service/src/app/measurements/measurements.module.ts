import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@mini-pms/redis';

import { IntervalEntity } from './entities/interval.entity.js';
import { MeasurementStoreService } from './measurement-store.service.js';
import { MeasurementDlqService } from './measurement-dlq.service.js';
import { MeasurementLatestService } from './measurement-latest.service.js';
import { MeasurementOrchestrator } from './measurement.orchestrator.js';
import { MeasurementConsumerService } from './measurement-consumer.service.js';
import { MeasurementRpcController } from './measurement-rpc.controller.js';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { UNIT_SERVICE_CLIENT } from './measurement.constants.js';

@Module({
  imports: [
    // Bu modüldeki servisler IntervalEntity repository'sini
    // constructor üzerinden alabilecek.
    TypeOrmModule.forFeature([IntervalEntity]),
    // Ölçüm servisleri aynı Redis bağlantısını kullanır.
    RedisModule.forRoot({
      options: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    ClientsModule.register([
      {
        name: UNIT_SERVICE_CLIENT,
        transport: Transport.RMQ,
        options: {
          urls: [
            process.env.RABBITMQ_URL ??
              'amqp://mpms:mpms_dev_password@localhost:5672',
          ],

          // Unit Service zaten bu kuyruğu dinliyor.
          queue: 'mpms.unit',

          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [MeasurementRpcController],
  providers: [
    MeasurementStoreService,
    MeasurementDlqService,
    MeasurementLatestService,
    MeasurementOrchestrator,
    MeasurementConsumerService,
  ],
})
export class MeasurementsModule {}
