'use server';

import { redirect } from 'next/navigation';
import { gatewayAuth, signOut } from '@/auth';
import { buildKeycloakLogoutUrl } from '@/lib/auth/keycloak-logout';

/**
 * Auth.js ve Keycloak oturumlarını tek sunucu akışında kapatır.
 *
 * Sıra önemlidir:
 * 1. HttpOnly Auth.js cookie silinmeden önce şifreli JWT içindeki ID token okunur.
 * 2. Auth.js signOut cookie'yi response üzerinde siler.
 * 3. Tarayıcı Keycloak end-session endpoint'ine yönlendirilir.
 */
export async function logoutAction(): Promise<void> {
  const session = await gatewayAuth();
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const clientId = process.env.AUTH_KEYCLOAK_ID;
  const appUrl = process.env.AUTH_URL ?? 'http://localhost:3000';

  const logoutUrl =
    issuer && clientId
      ? buildKeycloakLogoutUrl({
          issuer,
          clientId,
          appUrl,
          idToken: session?.idToken,
        }).toString()
      : new URL('/login', appUrl).toString();

  // redirect:false sayesinde önce Auth.js cookie temizliği response'a yazılır;
  // dış yönlendirmeyi daha sonra Next.js'in güvenli redirect helper'ı yapar.
  await signOut({ redirect: false });
  redirect(logoutUrl);
}
