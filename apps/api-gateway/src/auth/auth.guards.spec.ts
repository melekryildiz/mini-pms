import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

// JwtAuthGuard modül yüklenirken issuer'ı doğrular. Test sahte bir URL kullanır;
// eksik Bearer testi JWKS'e veya ağa hiçbir zaman ulaşmaz.
process.env.KEYCLOAK_ISSUER = 'http://keycloak.test/realms/mini-pms';

// jose v6 ESM paketidir; bu CommonJS Jest projesinde ağ gerektirmeyen guard
// dallarını test ederken modülü küçük bir sahteyle değiştiriyoruz.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => jest.fn()),
  jwtVerify: jest.fn(),
}));

// require, yukarıdaki güvenli test issuer'ı atandıktan sonra modülü yükler.
const { JwtAuthGuard } =
  require('./jwt-auth.guard') as typeof import('./jwt-auth.guard');
const { RolesGuard } =
  require('./roles.guard') as typeof import('./roles.guard');

function executionContext(request: object): ExecutionContext {
  return {
    getHandler: () =>
      function handler() {
        return undefined;
      },
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
  } as unknown as ExecutionContext;
}

describe('API Gateway authentication and authorization guards', () => {
  it('returns the 401 exception used by protected endpoints without Bearer token', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const context = executionContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns the 403 exception when viewer calls an admin endpoint', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['admin']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = executionContext({
      user: { realm_access: { roles: ['viewer'] } },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows an operator through an operator endpoint', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['admin', 'operator']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = executionContext({
      user: { realm_access: { roles: ['operator'] } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
