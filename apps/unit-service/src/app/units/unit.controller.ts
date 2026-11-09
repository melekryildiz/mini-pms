import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';

import { BaseController } from '@mini-pms/common';
import { UnitEntity } from './entities/unit.entity.js';
import { UnitService } from './unit.service.js';
import {
  CreateUnitDto,
  UpdateUnitDto,
  ListUnitsQueryDto,
} from '@mini-pms/contracts';

import { Query } from '@nestjs/common';

import type { FindOptionsWhere } from 'typeorm';
import { UnitOrchestrator } from './unit.orchestrator.js';

@Controller('units')
export class UnitController extends BaseController<UnitEntity> {
  constructor(
    unitService: UnitService,
    private readonly unitOrchestrator: UnitOrchestrator,
  ) {
    super(unitService);
  }

  @Get(':id')
  override async findOne(@Param('id') id: string) {
    return super.findOne(id);
  }

  @Post()
  async createUnit(@Body() dto: CreateUnitDto) {
    const unit = await this.unitOrchestrator.create(
      dto,
    ' system',
  );

    return {
      success: true,
      data: unit,
      message: 'Record created successfully',
    };
  }

  @Patch(':id')
  async updateUnit(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    const unit = await this.unitOrchestrator.update(
      id,
      dto,
      'system',
    );

    return {
      success: true,
      data: unit,
      message: 'Record updated successfully',
    };
  }

  @Delete(':id')
    async deleteUnit(@Param('id') id: string) {

      await this.unitOrchestrator.softDelete(
        id,
        'system',
      );

      return {
        success: true,
        message: 'Record deleted successfully',
      };
    }
 @Get()
    async listUnits(@Query() query: ListUnitsQueryDto) {
    const filters: FindOptionsWhere<UnitEntity> = {};

    if (query.is_active !== undefined) {
        filters.is_active = query.is_active;
    }

    if (query.organization_unit_type_id !== undefined) {
        filters.organization_unit_type_id =
        query.organization_unit_type_id;
    }

    return super.getList(
        query.page,
        query.limit,
        query.sortBy,
        query.sortOrder,
        filters,
    );
  }

}