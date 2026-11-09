
'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';

type GatewayResult = {
  authenticated?: boolean;
  user?: unknown;
  error?: string;
};

export default function HomePage() {
  const [result, setResult] = useState<GatewayResult | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    setLoading(true);

    try {
      const response = await fetch('/api/gateway/me', {
        cache: 'no-store',
      });

      const data: GatewayResult = await response.json();

      setResult(
        response.ok
          ? data
          : { error: data.error ?? 'Request failed' }
      );
    } catch {
      setResult({ error: 'Server unavailable' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUser();
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Mini PMS</h1>

      {loading ? (
        <p>Oturum kontrol ediliyor...</p>
      ) : result?.authenticated ? (
        <>
          <h2>Hoş geldin!</h2>

          <h3>API Gateway kullanıcı bilgileri</h3>

          <pre>{JSON.stringify(result.user, null, 2)}</pre>

          <button onClick={() => void loadUser()}>
            Yeniden Kontrol Et
          </button>

          {' '}

          <button onClick={() => void signOut({ callbackUrl: '/' })}>
            Çıkış Yap
          </button>
        </>
      ) : (
        <>
          <p>{result?.error ?? 'Giriş yapmalısın.'}</p>

          <button onClick={() => void signIn('keycloak')}>
            Keycloak ile Giriş Yap
          </button>
        </>
      )}
    </main>
  );
}
