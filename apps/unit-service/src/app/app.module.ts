
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UnitEntity } from './units/entities/unit.entity.js';
import { UnitService } from './units/unit.service.js';
import { UnitController } from './units/unit.controller.js';
import { OrganizationUnitLogEntity } from './units/entities/organization-unit-log.js';
import { UnitOrchestrator } from './units/unit.orchestrator.js';

import { DeviceModule } from './devices/device.module.js';
import { DeviceEntity } from './devices/entities/device.entity.js';
import { DeviceLogEntity } from './devices/entities/device-log.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',

      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),

      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,

      entities: [
        UnitEntity,
        OrganizationUnitLogEntity,
        DeviceEntity,
        DeviceLogEntity,
      ],

      synchronize: false,
    }),

    TypeOrmModule.forFeature([
      UnitEntity,
      OrganizationUnitLogEntity,
    ]),

    DeviceModule,
  ],

  controllers: [UnitController],
  providers: [UnitService, UnitOrchestrator],
})
export class AppModule {}
