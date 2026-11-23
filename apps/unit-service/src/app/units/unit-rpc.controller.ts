import {
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  UseFilters,
} from '@nestjs/common';
import {
  BaseRpcExceptionFilter,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import type { FindOptionsWhere } from 'typeorm';

import { UnitEntity } from './entities/unit.entity.js';
import { UnitService } from './unit.service.js';
import { UnitOrchestrator } from './unit.orchestrator.js';

import {
  CreateUnitDto,
  UpdateUnitDto,
  ListUnitsQueryDto,
  SearchUnitsByCodeQueryDto,
} from '@mini-pms/contracts';

import { UnitTopologyService } from '../topology/unit-topology.service.js';

@Controller()
// pnpm peer bağımlılıkları birden fazla SDK kopyası oluşturabilir.
// Hataları controller'ın RpcException sınıfıyla aynı SDK filtresi işler.
@UseFilters(new BaseRpcExceptionFilter())
export class UnitRpcController {
  private readonly logger = new Logger(UnitRpcController.name);

  constructor(
    private readonly unitService: UnitService,
    private readonly unitOrchestrator: UnitOrchestrator,
    private readonly unitTopologyService: UnitTopologyService,
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
  //  6. Unit ağacını getir
  @MessagePattern('unit.getTree')
  getUnitTree(@Payload() payload: { id: string }) {
    return this.handleRpc('unit.getTree', () =>
      this.unitTopologyService.getUnitTree(payload.id),
    );
  }
  //7. Unit yolunu getir
  @MessagePattern('unit.getPath')
  getUnitPath(@Payload() payload: { id: string }) {
    return this.handleRpc('unit.getPath', () =>
      this.unitTopologyService.getUnitPath(payload.id),
    );
  }
  /**
   * Topoloji ekranının ilk açılışında yalnız root Unit'leri döndürür.
   */
  @MessagePattern('unit.getNavigationRoots')
  getNavigationRoots() {
    return this.handleRpc('unit.getNavigationRoots', async () => {
      const roots = await this.unitService.getNavigationRoots();

      return {
        data: roots,
      };
    });
  }

  /**
   * Kullanıcının açtığı düğümün yalnızca doğrudan çocuklarını döndürür..
   */
  @MessagePattern('unit.getNavigationChildren')
  getNavigationChildren(@Payload() payload: { parentId: string }) {
    return this.handleRpc('unit.getNavigationChildren', async () => {
      const children = await this.unitService.getNavigationChildren(
        payload.parentId,
      );

      return {
        parentId: payload.parentId,
        data: children,
      };
    });
  }

  /**
   * Unit kodunun tamamı veya bir bölümüyle arama yapar.

   */
  @MessagePattern('unit.searchNavigationByCode')
  searchNavigationByCode(@Payload() query: SearchUnitsByCodeQueryDto) {
    return this.handleRpc('unit.searchNavigationByCode', async () => {
      const limit = Number(query.limit);
      const normalizedCode = query.code.trim();

      const units = await this.unitService.searchNavigationByCode(
        normalizedCode,
        limit,
      );

      return {
        query: normalizedCode,
        data: units,
      };
    });
  }
  /**
   * Ingestion'ın anlık değer akışı için sayaç listesini verir.
   * HTTP endpoint değil, RabbitMQ RPC handler'ıdır.
   */
  @MessagePattern('unit.getSubtreeMeters')
  async getSubtreeMeters(@Payload() payload: { unitId: string }) {
    return this.handleRpc('unit.getSubtreeMeters', () =>
      this.unitTopologyService.getUnitSubtreeMeters(payload?.unitId),
    );
  }
}
