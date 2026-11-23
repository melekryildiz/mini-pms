import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

import type { SimulationDevice } from '@mini-pms/contracts';

import { UNIT_SERVICE_CLIENT } from './simulator.constants.js';

@Injectable()
export class MeterCatalogService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MeterCatalogService.name);

  constructor(
    @Inject(UNIT_SERVICE_CLIENT)
    private readonly unitServiceClient: ClientProxy,
  ) {}

  /** Uygulama hazır olduğunda RabbitMQ bağlantısını erkenden doğrular. */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Connecting to Unit Service through RabbitMQ');
    await this.unitServiceClient.connect();
    this.logger.log('RabbitMQ client connected');
  }

  /** Unit Service'ten aktif ve silinmemiş sayaçları alır. */
  async getActiveMeters(): Promise<SimulationDevice[]> {
    this.logger.log('Requesting active meters from Unit Service');

    const meters = await firstValueFrom(
      this.unitServiceClient
        .send<SimulationDevice[]>('device.findMetersForSimulation', {})
        // RPC cevabı gelmezse simulator'ın sonsuza kadar beklemesini engeller.
        .pipe(timeout(10_000)),
    );

    this.logger.log(`Received ${meters.length} active meter(s)`);
    return meters;
  }

  /** Açık socket bırakmamak için uygulama kapanırken client'ı kapatır. */
  async onApplicationShutdown(): Promise<void> {
    await this.unitServiceClient.close();
    this.logger.log('RabbitMQ client closed');
  }
}
