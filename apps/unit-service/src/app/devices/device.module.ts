
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceEntity } from './entities/device.entity.js';
import { DeviceLogEntity } from './entities/device-log.entity.js';
import { UnitEntity } from '../units/entities/unit.entity.js';

import { DeviceService } from './device.service.js';
import { DeviceOrchestrator } from './device.orchestrator.js';
import { DeviceController } from './device.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceEntity,
      DeviceLogEntity,
      UnitEntity,
    ]),
  ],
  controllers: [DeviceController],
  providers: [
    DeviceService,
    DeviceOrchestrator,
  ],
  exports: [
    DeviceService,
    DeviceOrchestrator,
  ],
})
export class DeviceModule {}
