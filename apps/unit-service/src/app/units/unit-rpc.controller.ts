
import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { FindOptionsWhere } from 'typeorm';

import { UnitEntity } from './entities/unit.entity.js';
import { UnitService } from './unit.service.js';
import { UnitOrchestrator } from './unit.orchestrator.js';

import {
  CreateUnitDto,
  UpdateUnitDto,
  ListUnitsQueryDto,
} from '@mini-pms/contracts';

@Controller()
export class UnitRpcController {
  private readonly logger = new Logger(UnitRpcController.name);

  constructor(
    private readonly unitService: UnitService,
    private readonly unitOrchestrator: UnitOrchestrator,
  ) {}

  // Ortak RPC işlem yönetimi
  private async handleRpc<T>(
    pattern: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    console.log('RPC HANDLER CALLED:', pattern);

    try {
      this.logger.log(`RPC received: ${pattern}`);

      const result = await operation();

      this.logger.log(`RPC completed: ${pattern}`);

      return result;
    } catch (error) {
      this.logger.error(
        `RPC failed: ${pattern}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  // 1. Tek bir Unit getir
  @MessagePattern('unit.findOne')
  async findOne(@Payload() payload: { id: string }) {
    return this.handleRpc(
      'unit.findOne',
      () => this.unitService.findOne(payload.id),
    );
  }

  // 2. Unit listesini getir
  @MessagePattern('unit.findAll')
  async listUnits(@Payload() query: ListUnitsQueryDto) {
    return this.handleRpc(
      'unit.findAll',
      async () => {
        const filters: FindOptionsWhere<UnitEntity> = {};

        if (query.is_active !== undefined) {
          filters.is_active = query.is_active;
        }

        if (query.organization_unit_type_id !== undefined) {
          filters.organization_unit_type_id =
            query.organization_unit_type_id;
        }

        return await this.unitService.getList(
          query.page,
          query.limit,
          query.sortBy,
          query.sortOrder,
          filters,
        );
      },
    );
  }

  // 3. Yeni Unit oluştur
  @MessagePattern('unit.create')
  async createUnit(
    @Payload() payload: {
      dto: CreateUnitDto;
      username: string;
    },
  ) {
    return this.handleRpc(
      'unit.create',
      async () => {
        const unit = await this.unitOrchestrator.create(
          payload.dto,
          payload.username,
        );

        return {
          success: true,
          data: unit,
          message: 'Record created successfully',
        };
      },
    );
  }

  // 4. Unit güncelle
  @MessagePattern('unit.update')
  async updateUnit(
    @Payload() payload: {
      id: string;
      dto: UpdateUnitDto;
      username: string;
    },
  ) {
    return this.handleRpc(
      'unit.update',
      async () => {
        const unit = await this.unitOrchestrator.update(
          payload.id,
          payload.dto,
          payload.username,
        );

        return {
          success: true,
          data: unit,
          message: 'Record updated successfully',
        };
      },
    );
  }

  // 5. Unit sil (soft delete)
  @MessagePattern('unit.delete')
  async deleteUnit(
    @Payload() payload: {
      id: string;
      username: string;
    },
  ) {
    return this.handleRpc(
      'unit.delete',
      async () => {
        await this.unitOrchestrator.softDelete(
          payload.id,
          payload.username,
        );

        return {
          success: true,
          message: 'Record deleted successfully',
        };
      },
    );
  }
}
