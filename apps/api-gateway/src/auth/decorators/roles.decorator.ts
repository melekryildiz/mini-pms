import { SetMetadata } from '@nestjs/common';

// RolesGuard'ın okuyacağı metadata anahtarı.
export const ROLES_KEY = 'roles';

// Endpoint'e erişebilecek rolleri tanımlar.
// Örnek: @Roles('admin', 'operator')
export const Roles = (...roles: string[]) =>
  SetMetadata(ROLES_KEY, roles);