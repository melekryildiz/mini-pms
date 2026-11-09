import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';

import { ReactiveLimitService } from './reactive-limit.service.js';
import { ReactiveLimitOrchestrator } from './reactive-limit.orchestrator.js';

import {
  CreateReactiveLimitDto,
  UpdateReactiveLimitDto,
} from '@mini-pms/contracts';

@Controller('reactive-limits')
export class ReactiveLimitController {
  constructor(
    private readonly reactiveLimitService: ReactiveLimitService,
    private readonly reactiveLimitOrchestrator: ReactiveLimitOrchestrator,
  ) {}

  @Post()
  async create(
    @Body() data: CreateReactiveLimitDto,
  ) {
    return this.reactiveLimitOrchestrator.create({
      organization_unit_id: data.organization_unit_id,
      limit_type: data.limit_type,
      limit_value: data.limit_value,
      valid_from: new Date(data.valid_from),
      valid_to: data.valid_to
        ? new Date(data.valid_to)
        : null,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateReactiveLimitDto,
  ) {
    return this.reactiveLimitOrchestrator.update(id, {
      limit_value: data.limit_value,
    });
  }

  @Get('unit/:unitId/active')
  async findActiveByUnitId(
    @Param('unitId') unitId: string,
  ) {
    return this.reactiveLimitService.findActiveByUnitId(unitId);
  }

  @Get('unit/:unitId')
  async findByUnitId(
    @Param('unitId') unitId: string,
  ) {
    return this.reactiveLimitService.findByUnitId(unitId);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
  ) {
    return this.reactiveLimitService.findById(id);
  }
}