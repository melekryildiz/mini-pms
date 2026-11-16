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
  SearchUnitsByCodeQueryDto,
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
  constructor(private readonly unitsService: UnitsService) {}

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
   * GET /api/units/navigation/roots
   */
  @Get('navigation/roots')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary: 'Get root units for lazy topology navigation',
  })
  @ApiResponse({
    status: 200,
    description: 'Root units returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  getNavigationRoots() {
    return this.unitsService.getNavigationRoots();
  }

  /**
   * GET /api/units/navigation/search?code=TR&limit=20
   */
  @Get('navigation/search')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary: 'Search topology units by code',
  })
  @ApiResponse({
    status: 200,
    description: 'Matching units returned',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid search query',
  })
  searchNavigationByCode(
    @Query() query: SearchUnitsByCodeQueryDto,
  ) {
    return this.unitsService.searchNavigationByCode(query);
  }

  /**
   * GET /api/units/:id/navigation-children
   *
   * Yalnız belirtilen Unit'in doğrudan çocuklarını döndürür.
   */
  @Get(':id/navigation-children')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary: 'Get direct children for lazy topology navigation',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Parent organization unit ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Direct child units returned',
  })
  getNavigationChildren(
    @Param('id') id: string,
  ) {
    return this.unitsService.getNavigationChildren(id);
  }
    /**
   * Verilen Unit'i ve bütün alt birimlerini recursive tree olarak döndürür.
   */
  @Get(':id/tree')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary:
      'Get unit subtree and compare Neo4j/PostgreSQL query performance',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description:
      'Root organization unit ID',
  })
  @ApiResponse({
    status: 200,
    description:
      'Unit tree and query comparison returned',
  })
  @ApiResponse({
    status: 401,
    description:
      'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description:
      'Unit not found',
  })
  @ApiResponse({
    status: 503,
    description:
      'Neo4j and PostgreSQL topology results do not match',
  })
  getTree(
    @Param('id') id: string,
  ) {
    return this.unitsService.getTree(id);
  }
    /**
   * Gerçek root Unit'ten hedef Unit'e kadar olan yolu döndürür
   */
  @Get(':id/path')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({
    summary:
      'Get root-to-unit path and compare Neo4j/PostgreSQL query performance',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description:
      'Target organization unit ID',
  })
  @ApiResponse({
    status: 200,
    description:
      'Unit path and query comparison returned',
  })
  @ApiResponse({
    status: 401,
    description:
      'Unauthorized - Missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description:
      'Unit not found',
  })
  @ApiResponse({
    status: 503,
    description:
      'Neo4j and PostgreSQL topology results do not match',
  })
  getPath(
    @Param('id') id: string,
  ) {
    return this.unitsService.getPath(id);
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

  /** Birim detayında audit zaman çizelgesini sayfalı döndürür. */
  @Get(':id/history')
  @Roles('admin', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get unit change history' })
  history(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.unitsService.history(id, Number(page), Number(limit));
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
  create(@Body() dto: CreateUnitDto, @User() user: JwtUser) {
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
  delete(@Param('id') id: string, @User() user: JwtUser) {
    const username = user.preferred_username ?? user.sub;

    return this.unitsService.delete(id, username);
  }
}
