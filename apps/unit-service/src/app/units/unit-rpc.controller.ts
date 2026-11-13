import { Controller, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
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

      // HTTP exception nesnesi RabbitMQ sınırından doğrudan geçmez. Status ve
      // mesajı sade bir RPC payload'una çevirerek Gateway'in 400/404/409 gibi
      // anlamlı cevapları frontend formuna ulaştırmasını sağlıyoruz.
      if (error instanceof HttpException) {
        throw new RpcException({
          statusCode: error.getStatus(),
          message: error.message,
        });
      }

      throw new RpcException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    }
  }

  // 1. Tek bir Unit getir
  @MessagePattern('unit.findOne')
  async findOne(@Payload() payload: { id: string }) {
    return this.handleRpc('unit.findOne', () =>
      this.unitService.findOne(payload.id),
    );
  }

  // 2. Unit listesini getir
  @MessagePattern('unit.findAll')
  async listUnits(@Payload() query: ListUnitsQueryDto) {
    return this.handleRpc('unit.findAll', async () => {
      const filters: FindOptionsWhere<UnitEntity> = {};

      if (query.is_active !== undefined) {
        filters.is_active = query.is_active === 'true';
      }

      if (query.organization_unit_type_id !== undefined) {
        filters.organization_unit_type_id = query.organization_unit_type_id;
      }

      return await this.unitService.getList(
        Number(query.page),
        Number(query.limit),
        query.sortBy,
        query.sortOrder,
        filters,
      );
    });
  }

  @MessagePattern('unit.history')
  history(@Payload() payload: { id: string; page?: number; limit?: number }) {
    return this.handleRpc('unit.history', () =>
      this.unitService.getHistory(
        payload.id,
        Number(payload.page ?? 1),
        Number(payload.limit ?? 20),
      ),
    );
  }

  // 3. Yeni Unit oluştur
  @MessagePattern('unit.create')
  async createUnit(
    @Payload() payload: { dto: CreateUnitDto; username: string },
  ) {
    return this.handleRpc('unit.create', async () => {
      const unit = await this.unitOrchestrator.create(
        payload.dto,
        payload.username,
      );

      return {
        success: true,
        data: unit,
        message: 'Record created successfully',
      };
    });
  }

  // 4. Unit güncelle
  @MessagePattern('unit.update')
  async updateUnit(
    @Payload() payload: { id: string; dto: UpdateUnitDto; username: string },
  ) {
    return this.handleRpc('unit.update', async () => {
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
    });
  }

  // 5. Unit sil (soft delete)
  @MessagePattern('unit.delete')
  async deleteUnit(@Payload() payload: { id: string; username: string }) {
    return this.handleRpc('unit.delete', async () => {
      await this.unitOrchestrator.softDelete(payload.id, payload.username);

      return {
        success: true,
        message: 'Record deleted successfully',
      };
    });
  }
}
