'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navigationItems, navigationSections } from '@/config/navigation';
import { hasAnyRole } from '@/lib/permissions';
import type { AppRole } from '@/types/auth';

export function Sidebar({ roles }: { roles: AppRole[] }) {
  const pathname = usePathname();

  const visibleItems = navigationItems.filter(
    (item) => !item.roles || hasAnyRole(roles, item.roles),
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">MP</span>
        <div>
          <strong>Mini PMS</strong>
          <small>Power Management</small>
        </div>
      </div>

      <nav aria-label="Ana menü" className="navigation">
        {navigationSections.map((section) => {
          const sectionItems = visibleItems.filter(
            (item) => item.section === section.id,
          );

          // Kullanıcının erişebildiği kayıt yoksa bölüm başlığı da gösterilmez.
          // Viewer için admin yönetim başlığının gizlenmesini bu koşul sağlar.
          if (sectionItems.length === 0) return null;

          return (
            <div className="nav-section" key={section.id}>
              <p className="nav-section-title">{section.label}</p>

              <div className="nav-section-links">
                {sectionItems.map((item) => {
                  // Alt detay sayfalarında da üst menü kaydı aktif görünür.
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      aria-current={isActive ? 'page' : undefined}
                      className={isActive ? 'nav-link active' : 'nav-link'}
                      href={item.href}
                      key={item.href}
                    >
                      <span aria-hidden="true" className="nav-icon">
                        {item.icon}
                      </span>
                      <span className="nav-copy">
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="status-dot" />
        Güvenli oturum
      </div>
    </aside>
  );
}
