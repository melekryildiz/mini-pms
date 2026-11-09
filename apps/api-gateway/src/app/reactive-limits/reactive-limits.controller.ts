
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOAuth2,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CreateReactiveLimitDto,
  UpdateReactiveLimitDto,
} from '@mini-pms/contracts';

import { Roles } from '../../auth/decorators/roles.decorator';
import { ReactiveLimitsService } from './reactive-limits.service.js';

// Swagger'da endpoint'leri Reactive Limits altında gruplar.
@ApiTags('Reactive Limits')

// Manuel JWT Bearer token desteği.
@ApiBearerAuth('access-token')

// Keycloak OAuth2 Authorization Code + PKCE desteği.
@ApiOAuth2(['openid'], 'keycloak-oauth2')

// Bütün endpoint'ler /api/reactive-limits altında çalışır.
@Controller('reactive-limits')
export class ReactiveLimitsController {
  constructor(
    private readonly reactiveLimitsService: ReactiveLimitsService,
  ) {}

  /**
   * POST /api/reactive-limits
   * Yeni bir reaktif limit oluşturur.
   * Admin ve operator erişebilir.
   */
  @Post()
  @Roles('admin', 'operator')
  @ApiOperation({
    summary: 'Create reactive limit',
  })
  @ApiBody({ type: CreateReactiveLimitDto })
  @ApiResponse({
    status: 201,
    description: 'Reactive limit created',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  create(@Body() dto: CreateReactiveLimitDto) {
    return this.reactiveLimitsService.create(dto);
  }

  /**
   * PATCH /api/reactive-limits/:id
   * Mevcut reaktif limiti günceller.
   * Admin ve operator erişebilir.
   */
  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOperation({
    summary: 'Update reactive limit',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Reactive limit ID',
  })
  @ApiBody({ type: UpdateReactiveLimitDto })
  @ApiResponse({
    status: 200,
    description: 'Reactive limit updated',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Reactive limit not found',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReactiveLimitDto,
  ) {
    return this.reactiveLimitsService.update(id, dto);
  }

  /**
   * GET /api/reactive-limits/unit/:unitId/active
   * Birimin aktif reaktif limitlerini getirir.
   * Admin, operator ve viewer erişebilir.
   */
  @Get('unit/:unitId/active')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary: 'Get active reactive limits by unit',
  })
  @ApiParam({
    name: 'unitId',
    type: String,
    description: 'Unit ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Active reactive limits returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  findActiveByUnitId(
    @Param('unitId') unitId: string,
  ) {
    return this.reactiveLimitsService.findActiveByUnitId(
      unitId,
    );
  }

  /**
   * GET /api/reactive-limits/unit/:unitId
   * Birimin bütün reaktif limitlerini getirir.
   * Admin, operator ve viewer erişebilir.
   */
  @Get('unit/:unitId')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary: 'Get reactive limits by unit',
  })
  @ApiParam({
    name: 'unitId',
    type: String,
    description: 'Unit ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Reactive limits returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  findByUnitId(
    @Param('unitId') unitId: string,
  ) {
    return this.reactiveLimitsService.findByUnitId(
      unitId,
    );
  }

  /**
   * GET /api/reactive-limits/:id
   * Reaktif limit kaydını ID ile getirir.
   * Admin, operator ve viewer erişebilir.
   */
  @Get(':id')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary: 'Get reactive limit by ID',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Reactive limit ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Reactive limit returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Reactive limit not found',
  })
  findById(@Param('id') id: string) {
    return this.reactiveLimitsService.findById(id);
  }
}
