import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/lib/auth/require-user';

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Bu layout altındaki bütün sayfalar render edilmeden önce aynı kontrol çalışır.
  // `(protected)` klasör adı URL'ye eklenmez; yalnızca dosya organizasyonudur.
  const user = await requireUser();

  return <AppShell user={user}>{children}</AppShell>;
}
