import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  NotFoundException,
} from '@nestjs/common';

import { DeviceService } from './device.service.js';
import { DeviceOrchestrator } from './device.orchestrator.js';
import { CreateDeviceDto, UpdateDeviceDto } from '@mini-pms/contracts';

@Controller('devices')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly deviceOrchestrator: DeviceOrchestrator,
  ) {}

  @Post()
  create(@Body() dto: CreateDeviceDto) {
    return this.deviceOrchestrator.create(dto, 'system');
  }

  @Get()
  getList(@Query('page') page = '1', @Query('limit') limit = '10') {
    return this.deviceService.getList(Number(page), Number(limit));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const device = await this.deviceService.findOne(id);

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.deviceOrchestrator.update(id, dto, 'system');
  }

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.deviceOrchestrator.softDelete(id, 'system');
  }
}
