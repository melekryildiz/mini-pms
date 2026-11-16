import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { gatewayAuth } from '@/auth';
import { gatewayRequest } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import type { AppRole, AuthenticatedUser } from '@/types/auth';

const appRoles = new Set<AppRole>(['admin', 'operator', 'viewer']);

type GatewayUser = Omit<AuthenticatedUser, 'roles'> & {
  roles?: unknown;
};

/**
 * Korumalı layout'ların kullanacağı tek oturum kontrolü.
 *
 * 1. Auth.js cookie'sini sunucuda doğrular.
 * 2. Refresh işlemi başarısızsa kullanıcıyı tekrar girişe yollar.
 * 3. Access token ile backend'e sorup kullanıcıyı ve rollerini doğrulatır.
 *
 * Böylece rol bilgisi için tarayıcıda JWT decode etmeyiz; güvenilir kaynak
 * JWT'yi zaten doğrulayan API Gateway olur.
 */
export const requireUser = cache(async (): Promise<AuthenticatedUser> => {
  const session = await gatewayAuth();

  if (
    !session ||
    session.error === 'RefreshTokenError' ||
    !session.accessToken
  ) {
    redirect('/login');
  }

  let user: GatewayUser;

  try {
    user = await gatewayRequest<GatewayUser>('/auth/me', {
      accessToken: session.accessToken,
    });
  } catch (error) {
    // Auth.js cookie'si bulunsa bile Gateway token'ı reddedebilir. Bu durumda
    // kullanıcıyı bozuk oturumla uygulamada tutmak yerine yeniden giriş isteriz.
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    // 502 veya ağ hatası kimlik doğrulama hatası değildir. Onu yukarı taşıyıp
    // gerçek servis problemine yanlışlıkla "oturum bitti" dememiş oluruz.
    throw error;
  }

  return {
    ...user,
    // Keycloak'un kendi dahili rolleri de token'da bulunabilir. Arayüz yalnızca
    // Mini-PMS'in bildiği üç uygulama rolünü kullanır.
    roles: Array.isArray(user.roles)
      ? user.roles.filter(
          (role): role is AppRole =>
            typeof role === 'string' && appRoles.has(role as AppRole),
        )
      : [],
  };
});
