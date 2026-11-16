import NextAuth, { type NextAuthConfig, type NextAuthResult } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';

type RefreshedToken = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  idToken?: string;
};

// Dashboard aynı anda birden fazla API isteği başlatabilir. Hepsi süresi dolmuş
// aynı cookie'yi okursa Keycloak'a aynı refresh token ile paralel istek gider.
// Refresh token rotation açıkken ilk istek token'ı yeniler, ikincisi invalid_grant
// alır. Bu map aynı token için tek ağ isteğini paylaşarak yarışı engeller.
const refreshRequests = new Map<string, Promise<RefreshedToken>>();

async function requestRefreshedToken(
  refreshToken: string,
): Promise<RefreshedToken> {
  const existing = refreshRequests.get(refreshToken);

  if (existing) return existing;

  const request = (async () => {
    const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
    const clientId = process.env.AUTH_KEYCLOAK_ID;

    if (!issuer || !clientId) {
      throw new Error('Keycloak issuer and client id are required');
    }

    const refreshBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    });

    // Public client secret kullanmaz. Confidential client seçilirse secret
    // yalnızca sunucu tarafındaki token isteğine eklenir ve session'a taşınmaz.
    if (process.env.AUTH_KEYCLOAK_SECRET) {
      refreshBody.set('client_secret', process.env.AUTH_KEYCLOAK_SECRET);
    }

    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: refreshBody,
      cache: 'no-store',
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const details =
        body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : {};

      // Status ve OAuth hata kodu teşhis için yeterlidir; token ve response
      // açıklamasını loglamayarak kimlik bilgilerini koruyoruz.
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

    return {
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      refreshToken:
        typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
      idToken: typeof data.id_token === 'string' ? data.id_token : undefined,
    };
  })();

  refreshRequests.set(refreshToken, request);

  // Kısa bekletme, ilk yanıt cookie'ye yazılırken eski cookie ile gelen yakın
  // zamanlı isteklerin de aynı sonucu kullanmasını sağlar. Token loglanmaz.
  setTimeout(() => refreshRequests.delete(refreshToken), 15_000);

  return request;
}

const config = {
  providers: [
    Keycloak({
      authorization: {
        // Kabul kriteri tekrar girişte kimlik bilgisi sorulmasıdır. Keycloak SSO
        // cookie'si beklenmedik biçimde kalsa bile authorization ekranını atlama.
        params: { prompt: 'login' },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // `account` yalnızca ilk girişte veya hesap yeniden bağlandığında gelir.
      // Keycloak token'larını Auth.js'in şifreli JWT cookie'sine bu anda koyarız.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          expiresAt: account.expires_at,
          error: undefined,
        };
      }

      if (token.error === 'RefreshTokenError') {
        // Başarısız refresh'i her istekte tekrar deneyerek Keycloak'u yormayız.
        // Session callback bu durumu login ekranına kadar taşır.
        return token;
      }

      // Token'ın bitmesine 30 saniyeden fazla varsa mevcut token hâlâ güvenli.
      // Küçük tampon, istek yoldayken token'ın süresinin dolmasını engeller.
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
        const refreshed = await requestRefreshedToken(token.refreshToken);

        console.log('[Auth] Refresh successful');

        return {
          ...token,
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
          refreshToken: refreshed.refreshToken ?? token.refreshToken,
          idToken: refreshed.idToken ?? token.idToken,
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
      // Normal /api/auth/session yanıtına access token eklemiyoruz. Böylece
      // Client Component'ler token'ı okuyamaz; yalnızca hata durumu görünür.
      if (token.error === 'RefreshTokenError') {
        session.error = 'RefreshTokenError';
      }

      return session;
    },
  },
} satisfies NextAuthConfig;

const authResult: NextAuthResult = NextAuth(config);

export const handlers: NextAuthResult['handlers'] = authResult.handlers;

export const auth: NextAuthResult['auth'] = authResult.auth;

export const signIn: NextAuthResult['signIn'] = authResult.signIn;

export const signOut: NextAuthResult['signOut'] = authResult.signOut;

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

      // Yalnızca server-side gatewayAuth örneğinde bulunur. Public
      // /api/auth/session callback'i bu alanı hiçbir zaman eklemez.
      if (typeof token.idToken === 'string') {
        session.idToken = token.idToken;
      }

      return session;
    },
  },
});

export const gatewayAuth: NextAuthResult['auth'] = gatewayResult.auth;
