import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators/roles.decorator';

// JWT payload'ındaki rol bilgilerini temsil eder.
interface JwtUser {
  realm_access?: {
    roles?: string[];
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Controller veya endpoint üzerinde tanımlanan rolleri okur.
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Rol kısıtlaması yoksa erişime izin verir.
    // JWT doğrulamasını JwtAuthGuard zaten yapıyor.
    if (!requiredRoles?.length) {
      return true;
    }

    // JwtAuthGuard tarafından doğrulanan kullanıcı bilgilerini alır.
    const request = context.switchToHttp().getRequest<{
      user?: JwtUser;
    }>();

    const userRoles = request.user?.realm_access?.roles ?? [];

    // Kullanıcının izin verilen rollerden en az birine sahip olması gerekir.
    const hasPermission = requiredRoles.some((role) =>
      userRoles.includes(role),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}