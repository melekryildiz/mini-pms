import type { ReactNode } from 'react';
import type { AuthenticatedUser } from '@/types/auth';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Sidebar } from './sidebar';

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AuthenticatedUser;
}) {
  const primaryRole = user.roles.includes('admin')
    ? 'Yönetici'
    : user.roles.includes('operator')
      ? 'Operatör'
      : 'Görüntüleyici';

  return (
    <div className="app-shell">
      <Sidebar roles={user.roles} />

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-heading">
            <p>Operasyon merkezi</p>
            <span>Enerji sistemlerini tek noktadan takip edin</span>
          </div>

          <div className="topbar-actions">
            <div aria-hidden="true" className="user-avatar">
              {user.username.slice(0, 1).toLocaleUpperCase('tr-TR')}
            </div>
            <div className="user-summary">
              <strong>{user.username}</strong>
              <span className="role-badge">{primaryRole}</span>
            </div>
            <SignOutButton />
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
