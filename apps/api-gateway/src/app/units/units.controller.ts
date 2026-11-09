
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOAuth2,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';

import {
  CreateUnitDto,
  UpdateUnitDto,
  ListUnitsQueryDto,
} from '@mini-pms/contracts';

import { Roles } from '../../auth/decorators/roles.decorator';
import { User } from '../../auth/decorators/user.decorator';
import { UnitsService } from './units.service';

// JWT'den aldığımız kullanıcı bilgileri.
// Bu tip sadece bu controller'da kullanılıyor.
type JwtUser = {
  sub: string;
  preferred_username?: string;
};

@ApiTags('Units')
@ApiBearerAuth('access-token')
@ApiOAuth2(['openid'], 'keycloak-oauth2')
@Controller('units')
export class UnitsController {
  constructor(
    private readonly unitsService: UnitsService,
  ) {}

  /**
   * GET /api/units
   * Admin, operator ve viewer erişebilir.
   */
  @Get()
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({ summary: 'List units' })
  @ApiResponse({
    status: 200,
    description: 'Units returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  findAll(@Query() query: ListUnitsQueryDto) {
    return this.unitsService.findAll(query);
  }

  /**
   * GET /api/units/:id
   * Admin, operator ve viewer erişebilir.
   */
  @Get(':id')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get unit by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unit ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Unit returned',
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
    description: 'Unit not found',
  })
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  /**
   * POST /api/units
   * Admin ve operator erişebilir.
   * Kullanıcı bilgisi doğrulanmış JWT'den alınır.
   */
  @Post()
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Create unit' })
  @ApiBody({ type: CreateUnitDto })
  @ApiResponse({
    status: 201,
    description: 'Unit created',
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
  create(
    @Body() dto: CreateUnitDto,
    @User() user: JwtUser,
  ) {
    const username = user.preferred_username ?? user.sub;

    return this.unitsService.create(dto, username);
  }

  /**
   * PATCH /api/units/:id
   * Admin ve operator erişebilir.
   * Güncelleme yapan kullanıcı JWT'den alınır.
   */
  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Update unit' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unit ID',
  })
  @ApiBody({ type: UpdateUnitDto })
  @ApiResponse({
    status: 200,
    description: 'Unit updated',
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
    description: 'Unit not found',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @User() user: JwtUser,
  ) {
    const username = user.preferred_username ?? user.sub;

    return this.unitsService.update(id, dto, username);
  }

  /**
   * DELETE /api/units/:id
   * Yalnızca admin erişebilir.
   * Silme işlemini yapan kullanıcı JWT'den alınır.
   */
  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete unit' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unit ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Unit deleted',
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
    description: 'Unit not found',
  })
  delete(
    @Param('id') id: string,
    @User() user: JwtUser,
  ) {
    const username = user.preferred_username ?? user.sub;

    return this.unitsService.delete(id, username);
  }
}
