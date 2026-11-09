
import NextAuth, {
  type NextAuthConfig,
  type NextAuthResult,
} from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';

const config = {
  providers: [Keycloak],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          error: undefined,
        };
      }

      if (token.error === 'RefreshTokenError') {
        return token;
      }

      if (
        typeof token.expiresAt === 'number' &&
        Date.now() < token.expiresAt * 1000 - 30_000
      ) {
        return token;
      }

      if (typeof token.refreshToken !== 'string') {
        return { ...token, error: 'RefreshTokenError' };
      }

      try {
        const response = await fetch(
          `${process.env.AUTH_KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: process.env.AUTH_KEYCLOAK_ID!,
              client_secret: process.env.AUTH_KEYCLOAK_SECRET!,
              refresh_token: token.refreshToken,
            }),
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const details =
            body && typeof body === 'object'
              ? (body as Record<string, unknown>)
              : {};

          console.error('[Auth] Refresh rejected', {
            status: response.status,
            code: details.error,
          });

          throw new Error('Keycloak refresh rejected');
        }

        const refreshed: unknown = await response.json();

        if (!refreshed || typeof refreshed !== 'object') {
          throw new Error('Invalid refresh response');
        }

        const data = refreshed as Record<string, unknown>;

        if (
          typeof data.access_token !== 'string' ||
          typeof data.expires_in !== 'number'
        ) {
          throw new Error('Missing access token or expiry');
        }

        console.log('[Auth] Refresh successful');

        return {
          ...token,
          accessToken: data.access_token,
          expiresAt:
            Math.floor(Date.now() / 1000) + data.expires_in,
          refreshToken:
            typeof data.refresh_token === 'string'
              ? data.refresh_token
              : token.refreshToken,
          error: undefined,
        };
      } catch (error) {
        console.error('[Auth] Refresh failed', error);

        return {
          ...token,
          error: 'RefreshTokenError',
        };
      }
    },

    async session({ session, token }) {
      if (token.error === 'RefreshTokenError') {
        session.error = 'RefreshTokenError';
      }

      return session;
    },
  },
} satisfies NextAuthConfig;

const authResult: NextAuthResult = NextAuth(config);

export const handlers: NextAuthResult['handlers'] =
  authResult.handlers;

export const auth: NextAuthResult['auth'] =
  authResult.auth;

export const signIn: NextAuthResult['signIn'] =
  authResult.signIn;

export const signOut: NextAuthResult['signOut'] =
  authResult.signOut;

// Only used inside our server-side Gateway route.
// This instance does NOT expose /api/auth/session.
const gatewayResult: NextAuthResult = NextAuth({
  ...config,
  callbacks: {
    ...config.callbacks,

    async session({ session, token }) {
      if (token.error === 'RefreshTokenError') {
        session.error = 'RefreshTokenError';
      }

      if (
        token.error !== 'RefreshTokenError' &&
        typeof token.accessToken === 'string'
      ) {
        session.accessToken = token.accessToken;
      }

      return session;
    },
  },
});

export const gatewayAuth: NextAuthResult['auth'] =
  gatewayResult.auth;
