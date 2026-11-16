import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SignInButton } from '@/components/auth/sign-in-button';

export default async function LoginPage() {
  const session = await auth();

  // Geçerli oturumu olan kullanıcı login ekranına geri gelirse uygulamaya al.
  if (session && session.error !== 'RefreshTokenError') {
    redirect('/dashboard');
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <span className="brand-mark large">MP</span>
        <p className="eyebrow">Mini PMS</p>
        <h1>Enerji yönetim paneli</h1>
        <p className="muted">
          Birimleri, cihazları ve reaktif limitleri yönetmek için kurumsal
          hesabınızla giriş yapın.
        </p>
        {session?.error === 'RefreshTokenError' && (
          <p className="error-message">
            Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.
          </p>
        )}
        <SignInButton />
      </section>
    </main>
  );
}
