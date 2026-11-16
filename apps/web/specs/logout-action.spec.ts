import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gatewayAuth: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/auth', () => ({
  gatewayAuth: mocks.gatewayAuth,
  signOut: mocks.signOut,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

import { logoutAction } from '../src/actions/logout';

describe('logoutAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_KEYCLOAK_ISSUER = 'http://localhost:8081/realms/mini-pms';
    process.env.AUTH_KEYCLOAK_ID = 'mini-pms-nextjs';
    process.env.AUTH_URL = 'http://localhost:3000';
    mocks.gatewayAuth.mockResolvedValue({ idToken: 'server-id-token' });
    mocks.signOut.mockResolvedValue(undefined);
  });

  it('deletes the Auth.js session before redirecting to Keycloak logout', async () => {
    await logoutAction();

    expect(mocks.gatewayAuth).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.redirect).toHaveBeenCalledTimes(1);

    const redirectUrl = new URL(mocks.redirect.mock.calls[0][0] as string);
    expect(redirectUrl.pathname).toBe(
      '/realms/mini-pms/protocol/openid-connect/logout',
    );
    expect(redirectUrl.searchParams.get('id_token_hint')).toBe(
      'server-id-token',
    );

    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    );
  });
});
