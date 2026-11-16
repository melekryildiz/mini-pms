import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../src/components/layout/sidebar';
import { can } from '../src/lib/permissions';
import type { AppRole } from '../src/types/auth';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

afterEach(cleanup);

describe('role menus and operation permissions', () => {
  const menuLabels = [
    'Genel Bakış',
    'Birimler',
    'Topoloji',
    'Cihazlar',
    'Reaktif Limitler',
  ];

  it.each<AppRole>(['admin', 'operator', 'viewer'])(
    'shows all read menus to the %s role',
    (role) => {
      render(<Sidebar roles={[role]} />);

      for (const label of menuLabels) {
        expect(screen.getByText(label)).toBeTruthy();
      }
    },
  );

  it('enforces the admin/operator/viewer action matrix', () => {
    expect(can(['admin'], 'resource:delete')).toBe(true);
    expect(can(['operator'], 'resource:create')).toBe(true);
    expect(can(['operator'], 'resource:update')).toBe(true);
    expect(can(['operator'], 'resource:delete')).toBe(false);
    expect(can(['viewer'], 'resource:read')).toBe(true);
    expect(can(['viewer'], 'resource:create')).toBe(false);
    expect(can(['viewer'], 'resource:update')).toBe(false);
    expect(can(['viewer'], 'resource:delete')).toBe(false);
  });

  it('hides an empty management section from the viewer', () => {
    render(<Sidebar roles={['viewer']} />);

    expect(screen.getByText('İzleme')).toBeTruthy();
    expect(screen.queryByText('Yönetim')).toBeNull();
  });
});
