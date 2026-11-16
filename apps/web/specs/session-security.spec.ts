import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type SessionCallback = (input: {
  session: Record<string, unknown>;
  token: Record<string, unknown>;
}) => Promise<Record<string, unknown>>;

type JwtCallback = (input: {
  token: Record<string, unknown>;
  account?: Record<string, unknown> | null;
}) => Promise<Record<string, unknown>>;

type CapturedConfig = {
  callbacks: { session: SessionCallback; jwt: JwtCallback };
};

const capturedConfigs = vi.hoisted(() => [] as CapturedConfig[]);
const keycloakConfigs = vi.hoisted(
  () => [] as Array<Record<string, unknown> | undefined>,
);

vi.mock('next-auth/providers/keycloak', () => ({
  default: vi.fn((config?: Record<string, unknown>) => {
    keycloakConfigs.push(config);
    return { id: 'keycloak' };
  }),
}));
vi.mock('next-auth', () => ({
  default: vi.fn((config: CapturedConfig) => {
    capturedConfigs.push(config);
    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }),
}));

describe('Auth.js session exposure', () => {
  beforeAll(async () => {
    await import('../src/auth');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forces Keycloak to show authentication UI on a new login', () => {
    expect(keycloakConfigs[0]).toMatchObject({
      authorization: { params: { prompt: 'login' } },
    });
  });

  it('keeps access and refresh tokens out of the public session callback', async () => {
    const publicSession = capturedConfigs[0].callbacks.session;
    const session = { user: { name: 'Viewer' }, expires: '2099-01-01' };

    const result = await publicSession({
      session,
      token: {
        accessToken: 'must-not-leak',
        refreshToken: 'must-not-leak',
        idToken: 'must-not-leak',
      },
    });

    expect(result).toEqual(session);
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('idToken');
  });

  it('exposes only the refresh error on the public session', async () => {
    const publicSession = capturedConfigs[0].callbacks.session;
    const result = await publicSession({
      session: { user: {}, expires: '2099-01-01' },
      token: {
        accessToken: 'must-not-leak',
        refreshToken: 'must-not-leak',
        idToken: 'must-not-leak',
        error: 'RefreshTokenError',
      },
    });

    expect(result.error).toBe('RefreshTokenError');
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('idToken');
  });

  it('exposes the ID token only through the private server auth instance', async () => {
    const privateSession = capturedConfigs[1].callbacks.session;
    const result = await privateSession({
      session: { user: {}, expires: '2099-01-01' },
      token: {
        accessToken: 'server-access-token',
        refreshToken: 'must-not-leak',
        idToken: 'server-id-token',
      },
    });

    expect(result.accessToken).toBe('server-access-token');
    expect(result.idToken).toBe('server-id-token');
    expect(result).not.toHaveProperty('refreshToken');
  });

  it('shares one Keycloak refresh request between parallel callbacks', async () => {
    const previousIssuer = process.env.AUTH_KEYCLOAK_ISSUER;
    const previousClientId = process.env.AUTH_KEYCLOAK_ID;
    process.env.AUTH_KEYCLOAK_ISSUER = 'http://keycloak.test/realms/mini-pms';
    process.env.AUTH_KEYCLOAK_ID = 'mini-pms-web';

    const fetchMock = vi.fn(async () =>
      Response.json({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 300,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const jwt = capturedConfigs[0].callbacks.jwt;
      const expiredToken = {
        accessToken: 'expired-access-token',
        refreshToken: 'parallel-refresh-token',
        expiresAt: 1,
      };

      const [first, second] = await Promise.all([
        jwt({ token: { ...expiredToken } }),
        jwt({ token: { ...expiredToken } }),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(first.accessToken).toBe('new-access-token');
      expect(second.accessToken).toBe('new-access-token');
    } finally {
      process.env.AUTH_KEYCLOAK_ISSUER = previousIssuer;
      process.env.AUTH_KEYCLOAK_ID = previousClientId;
    }
  });
});
