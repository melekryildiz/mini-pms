import { describe, expect, it } from 'vitest';
import { buildKeycloakLogoutUrl } from '../src/lib/auth/keycloak-logout';

describe('Keycloak RP-Initiated Logout URL', () => {
  it('uses the realm end-session endpoint and returns to /login', () => {
    const url = buildKeycloakLogoutUrl({
      issuer: 'http://localhost:8081/realms/mini-pms',
      clientId: 'mini-pms-nextjs',
      appUrl: 'http://localhost:3000',
      idToken: 'id-token-hint',
    });

    expect(url.origin).toBe('http://localhost:8081');
    expect(url.pathname).toBe(
      '/realms/mini-pms/protocol/openid-connect/logout',
    );
    expect(url.searchParams.get('client_id')).toBe('mini-pms-nextjs');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:3000/login',
    );
    expect(url.searchParams.get('id_token_hint')).toBe('id-token-hint');
    expect(url.toString()).not.toContain('access_token');
    expect(url.toString()).not.toContain('refresh_token');
  });

  it('still creates a valid client logout URL without an ID token', () => {
    const url = buildKeycloakLogoutUrl({
      issuer: 'http://localhost:8081/realms/mini-pms/',
      clientId: 'mini-pms-nextjs',
      appUrl: 'http://localhost:3000',
    });

    expect(url.searchParams.has('id_token_hint')).toBe(false);
    expect(url.searchParams.get('client_id')).toBe('mini-pms-nextjs');
  });
});
