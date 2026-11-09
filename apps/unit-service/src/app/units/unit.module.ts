
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UnitEntity } from './entities/unit.entity.js';
import { OrganizationUnitLogEntity } from './entities/organization-unit-log.js';

import { UnitController } from './unit.controller.js';
import { UnitRpcController } from './unit-rpc.controller.js';

import { UnitService } from './unit.service.js';
import { UnitOrchestrator } from './unit.orchestrator.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UnitEntity,
      OrganizationUnitLogEntity,
    ]),
  ],
  controllers: [
    UnitController,
    UnitRpcController,
  ],
  providers: [
    UnitService,
    UnitOrchestrator,
  ],
  exports: [UnitService],
})
export class UnitModule {}
