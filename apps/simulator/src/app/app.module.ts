import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { MeterCatalogService } from './meter-catalog.service.js';
import { MeasurementProducerService } from './measurement-producer.service.js';
import { SimulationRunnerService } from './simulation-runner.service.js';
import { UNIT_SERVICE_CLIENT } from './simulator.constants.js';

@Module({
  imports: [
    ClientsModule.register([
      {
        // Bu token MeterCatalogService içindeki @Inject ile eşleşir.
        name: UNIT_SERVICE_CLIENT,
        transport: Transport.RMQ,
        options: {
          urls: [
            process.env.RABBITMQ_URL ??
              'amqp://mpms:mpms_dev_password@localhost:5672',
          ],
          // Unit Service'in dinlediği kuyrukla aynı olmalıdır.
          queue: 'mpms.unit',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  providers: [
    MeterCatalogService,
    MeasurementProducerService,
    SimulationRunnerService,
  ],
  exports: [MeterCatalogService],
})
export class AppModule {}
