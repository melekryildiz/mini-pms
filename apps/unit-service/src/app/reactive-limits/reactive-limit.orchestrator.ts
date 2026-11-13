import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BaseOrchestrator, Transactional } from '@mini-pms/common';

import { ReactiveLimitService } from './reactive-limit.service.js';
import { ReactiveLimitEntity } from './entities/reactive-limit.entity.js';

@Injectable()
export class ReactiveLimitOrchestrator extends BaseOrchestrator {
  constructor(
    entityManager: EntityManager,
    private readonly reactiveLimitService: ReactiveLimitService,
  ) {
    super(entityManager);
  }

  @Transactional()
  async create(
    data: {
      organization_unit_id: string;
      limit_type: string;
      limit_value: string;
      valid_from: Date;
      valid_to: Date | null;
    },
    manager?: EntityManager,
  ): Promise<ReactiveLimitEntity> {
    if (!manager) {
      throw new Error('Transaction manager is required');
    }

    return await this.reactiveLimitService.create(data, manager);
  }
  @Transactional()
  async update(
    id: string,
    data: {
      limit_value: string;
    },
    manager?: EntityManager,
  ): Promise<ReactiveLimitEntity> {
    if (!manager) {
      throw new Error('Transaction manager is required');
    }

    const repository = manager.getRepository(ReactiveLimitEntity);

    const existingLimit = await repository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!existingLimit) {
      throw new NotFoundException('Reactive limit not found');
    }

    return await this.reactiveLimitService.update(existingLimit, data, manager);
  }
}
