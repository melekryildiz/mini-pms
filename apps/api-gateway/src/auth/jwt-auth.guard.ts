
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import {
  createRemoteJWKSet,
  jwtVerify,
} from 'jose';

import type { Request } from 'express';

import { IS_PUBLIC_KEY } from './decorators/public.decorator';

// Keycloak'un JWT'leri hangi realm üzerinden ürettiği.
const issuer = process.env.KEYCLOAK_ISSUER;

if (!issuer) {
  throw new Error(
    'KEYCLOAK_ISSUER environment variable is required',
  );
}

// JWT'nin hangi API için kullanılabileceğini kontrol eder.
const audience = 'mini-pms-api';

// Keycloak'un public key adresi.
const jwksUri = new URL(
  `${issuer}/protocol/openid-connect/certs`,
);

// Public key'leri gerektiğinde getirir ve cache'ler.
const JWKS = createRemoteJWKSet(jwksUri);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {

    // 1. Endpoint @Public() olarak işaretlenmiş mi?
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [
        context.getHandler(),
        context.getClass(),
      ],
    );

    // Public endpoint'lerde JWT zorunlu değildir.
    if (isPublic) {
      return true;
    }

    // 2. HTTP request nesnesini al.
    const request = context
      .switchToHttp()
      .getRequest<Request>();

    // 3. Authorization header'ını kontrol et.
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Bearer token is required',
      );
    }

    // "Bearer " kısmını çıkar ve JWT'yi al.
    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException(
        'Access token is missing',
      );
    }

    try {
      // 4. Token imzasını, issuer, audience ve
      // geçerlilik süresini doğrula.
      const { payload } = await jwtVerify(
        token,
        JWKS,
        {
          issuer,
          audience,
          algorithms: ['RS256'],
        },
      );

      // 5. Doğrulanmış kullanıcı bilgilerini
      // request.user içine ekle.
      Object.assign(request, {
        user: payload,
      });

      // 6. İsteğin controller'a ulaşmasına izin ver.
      return true;

    } catch {
      throw new UnauthorizedException(
        'Invalid or expired access token',
      );
    }
  }
}
