import type { AppRole } from '@/types/auth';

// Arayüzde kontrol edeceğimiz iş yetkileri. Backend yine son güvenlik kararıdır;
// bu liste sadece kullanıcıya kullanamayacağı butonları göstermemek içindir.
export type Permission =
  | 'resource:read'
  | 'resource:create'
  | 'resource:update'
  | 'resource:delete';

const permissionRoles: Record<Permission, readonly AppRole[]> = {
  'resource:read': ['admin', 'operator', 'viewer'],
  'resource:create': ['admin', 'operator'],
  'resource:update': ['admin', 'operator'],
  'resource:delete': ['admin'],
};

/** Kullanıcının verilen rollerden en az birine sahip olup olmadığını söyler. */
export function hasAnyRole(
  userRoles: readonly AppRole[],
  requiredRoles: readonly AppRole[],
): boolean {
  return requiredRoles.some((role) => userRoles.includes(role));
}

/** Menü ve aksiyon butonlarında kullanılacak ortak izin kontrolü. */
export function can(
  userRoles: readonly AppRole[],
  permission: Permission,
): boolean {
  return hasAnyRole(userRoles, permissionRoles[permission]);
}
