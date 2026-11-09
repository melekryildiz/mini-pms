
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOAuth2,
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

import {
  CreateDeviceDto,
  UpdateDeviceDto,
} from '@mini-pms/contracts';

import { Roles } from '../../auth/decorators/roles.decorator';
import { DevicesService } from './devices.service';

// Swagger'da endpoint'leri Devices başlığı altında gruplar.
@ApiTags('Devices')

// Manuel JWT Bearer token desteği.
@ApiBearerAuth('access-token')

// Keycloak OAuth2 Authorization Code + PKCE desteği.
@ApiOAuth2(['openid'], 'keycloak-oauth2')

// Bütün endpoint'ler /api/devices altında çalışır.
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
  ) {}

  /**
   * GET /api/devices
   * Sayaçları sayfalama desteğiyle listeler.
   * Admin, operator ve viewer erişebilir.
   */
  @Get()
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({ summary: 'List devices' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Devices returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  findAll(
    @Query('page', new ParseIntPipe({ optional: true }))
    page?: number,
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit?: number,
  ) {
    return this.devicesService.findAll({
      page: page ?? 1,
      limit: limit ?? 10,
    });
  }

  /**
   * GET /api/devices/:id
   * Belirtilen ID'ye sahip sayacı getirir.
   * Admin, operator ve viewer erişebilir.
   */
  @Get(':id')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get device by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Device ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Device returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  /**
   * POST /api/devices
   * Yeni bir sayaç oluşturur.
   * Admin ve operator erişebilir.
   * Viewer sayaç oluşturamaz.
   */
  @Post()
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Create device' })
  @ApiBody({ type: CreateDeviceDto })
  @ApiResponse({
    status: 201,
    description: 'Device created',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  /**
   * PATCH /api/devices/:id
   * Mevcut sayacın bilgilerini günceller.
   * Admin ve operator erişebilir.
   * Viewer güncelleme yapamaz.
   */
  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Update device' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Device ID',
  })
  @ApiBody({ type: UpdateDeviceDto })
  @ApiResponse({
    status: 200,
    description: 'Device updated',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.devicesService.update(id, dto);
  }

  /**
   * DELETE /api/devices/:id
   * Sayacı soft delete yöntemiyle siler.
   * Yalnızca admin erişebilir.
   */
  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Soft delete device' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Device ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Device deleted',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  delete(@Param('id') id: string) {
    return this.devicesService.delete(id);
  }
}
