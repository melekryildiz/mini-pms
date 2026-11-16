type KeycloakLogoutOptions = {
  issuer: string;
  clientId: string;
  appUrl: string;
  idToken?: string;
};

/**
 * Keycloak RP-Initiated Logout URL'sini yalnızca güvenilir sunucu
 * yapılandırmasından üretir. Access/refresh token bu URL'ye hiçbir zaman girmez.
 */
export function buildKeycloakLogoutUrl({
  issuer,
  clientId,
  appUrl,
  idToken,
}: KeycloakLogoutOptions): URL {
  const logoutUrl = new URL(
    'protocol/openid-connect/logout',
    `${issuer.replace(/\/$/, '')}/`,
  );
  const loginUrl = new URL('/login', appUrl);

  logoutUrl.searchParams.set('client_id', clientId);
  logoutUrl.searchParams.set('post_logout_redirect_uri', loginUrl.toString());

  // id_token_hint Keycloak'a hangi tarayıcı SSO oturumunun sonlandırılacağını
  // söyler. Bu bir access/refresh token değildir ve yalnızca Keycloak'a gider.
  if (idToken) logoutUrl.searchParams.set('id_token_hint', idToken);

  return logoutUrl;
}
