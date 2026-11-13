import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceEntity } from './entities/device.entity.js';
import { DeviceLogEntity } from './entities/device-log.entity.js';
import { UnitEntity } from '../units/entities/unit.entity.js';

import { DeviceService } from './device.service.js';
import { DeviceOrchestrator } from './device.orchestrator.js';
import { DeviceController } from './device.controller.js';
import { DeviceRpcController } from './device-rpc.controller.js';

import {
  TopologyModule,
} from '../topology/topology.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceEntity, DeviceLogEntity, UnitEntity]),

    /**
     * DeviceOrchestrator'ın PostgreSQL commit'inden sonra graph projection'ını
     * güncellemesi için ortak TopologyGraphService sağlar.
     */
    TopologyModule,
  ],
  controllers: [DeviceController, DeviceRpcController],
  providers: [DeviceService, DeviceOrchestrator],
  exports: [DeviceService, DeviceOrchestrator],
})
export class DeviceModule {}
