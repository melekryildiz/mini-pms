import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function HomePage() {
  const session = await auth();

  // Kök URL yalnızca bir giriş kapısıdır. Asıl uygulama sayfaları korumalı route
  // grubu altında, giriş ekranı ise herkese açık alanda yaşar.
  if (session && session.error !== 'RefreshTokenError') {
    redirect('/dashboard');
  }

  redirect('/login');
}
