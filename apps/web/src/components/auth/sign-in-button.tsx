'use client';

import { signIn } from 'next-auth/react';

export function SignInButton() {
  return (
    <button
      className="primary-button"
      onClick={() => void signIn('keycloak', { callbackUrl: '/dashboard' })}
      type="button"
    >
      Keycloak ile giriş yap
    </button>
  );
}
