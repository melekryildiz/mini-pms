import 'next-auth';

declare module 'next-auth' {
  interface Session {
    error?: 'RefreshTokenError';
    accessToken?: string;
    /** Yalnızca server-side gatewayAuth/logout akışında kullanılır. */
    idToken?: string;
  }
}
