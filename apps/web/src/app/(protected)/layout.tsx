import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/lib/auth/require-user';
import { QueryProvider } from '@/components/providers/query-provider';
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Bu layout altındaki bütün sayfalar render edilmeden önce aynı kontrol çalışır.
  // `(protected)` klasör adı URL'ye eklenmez; yalnızca dosya organizasyonudur.
  const user = await requireUser();

 return (
  <QueryProvider>
    <AppShell user={user}>
      {children}
    </AppShell>
  </QueryProvider>
);
}
