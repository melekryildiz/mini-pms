
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReactiveLimitEntity } from './entities/reactive-limit.entity.js';

import { ReactiveLimitService } from './reactive-limit.service.js';
import { ReactiveLimitOrchestrator } from './reactive-limit.orchestrator.js';

import { ReactiveLimitController } from './reactive-limit.controller.js';
import { ReactiveLimitRpcController } from './reactive-limit-rpc.controller.js';

@Module({
  imports: [
    // Reactive Limit tablosu için TypeORM repository sağlar.
    TypeOrmModule.forFeature([ReactiveLimitEntity]),
  ],

  controllers: [
    // Unit Service'e doğrudan gelen HTTP istekleri.
    ReactiveLimitController,

    // RabbitMQ üzerinden gelen RPC mesajları.
    ReactiveLimitRpcController,
  ],

  providers: [
    // Veritabanı işlemleri ve iş kuralları.
    ReactiveLimitService,

    // İş akışı ve transaction yönetimi.
    ReactiveLimitOrchestrator,
  ],

  exports: [
    ReactiveLimitService,
  ],
})
export class ReactiveLimitModule {}
