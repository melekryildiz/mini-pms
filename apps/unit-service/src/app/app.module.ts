
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UnitModule } from './units/unit.module.js';
import { DeviceModule } from './devices/device.module.js';
import { ReactiveLimitModule } from './reactive-limits/reactive-limit.module.js';

import { UnitEntity } from './units/entities/unit.entity.js';
import { OrganizationUnitLogEntity } from './units/entities/organization-unit-log.js';

import { DeviceEntity } from './devices/entities/device.entity.js';
import { DeviceLogEntity } from './devices/entities/device-log.entity.js';

import { ReactiveLimitEntity } from './reactive-limits/entities/reactive-limit.entity.js';

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
        ReactiveLimitEntity,
      ],

      synchronize: false,
    }),

    UnitModule,
    DeviceModule,
    ReactiveLimitModule,
  ],
})
export class AppModule {}
