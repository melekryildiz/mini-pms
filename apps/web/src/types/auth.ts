// Uygulamanın tanıdığı Keycloak realm rolleri.
// `string` yerine union type kullanmak, rol adındaki yazım hatalarını derleme
// aşamasında yakalamamızı sağlar.
export type AppRole = 'admin' | 'operator' | 'viewer';

// API Gateway'deki GET /api/auth/me endpoint'inin döndürdüğü kullanıcı modeli.
// Access token bu modelin parçası değildir; token yalnızca sunucuda kalır.
export type AuthenticatedUser = {
  id: string;
  username: string;
  email?: string;
  roles: AppRole[];
};
