
import { Controller, Get } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOAuth2,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { User } from './decorators/user.decorator';
import { Public } from './decorators/public.decorator';

// JwtAuthGuard tarafından doğrulanan JWT payload'ının
// bu controller'da kullandığımız alanları.
type JwtUser = {
  sub: string;
  preferred_username?: string;
  email?: string;
  realm_access?: {
    roles: string[];
  };
};

// Swagger'da Auth başlığı altında gösterilir.
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  /**
   * GET /api/auth/me
   *
   * Giriş yapan kullanıcının bilgilerini döndürür.
   * Geçerli JWT gerektirir.
   */
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOAuth2(['openid'], 'keycloak-oauth2')
  @ApiOperation({
    summary: 'Get authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid JWT',
  })
  me(@User() user: JwtUser) {
    return {
      id: user.sub,
      username: user.preferred_username ?? user.sub,
      email: user.email,
      roles: user.realm_access?.roles ?? [],
    };
  }

  /**
   * GET /api/auth/health
   *
   * JWT olmadan erişilebilen test endpoint'i.
   */
  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Public auth health check',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  health() {
    return { status: 'ok' };
  }
}
