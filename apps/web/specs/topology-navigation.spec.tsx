import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}));

import { UnitDetail } from '../src/components/resources/unit-detail';
import { TopologyBrowser } from '../src/components/topology/topology-browser';

const root = {
  id: '1',
  parentId: null,
  organizationUnitTypeId: '1',
  code: 'SUB-1',
  name: 'Main substation',
  isActive: true,
  hasChildren: true,
};

const child = {
  id: '2',
  parentId: '1',
  organizationUnitTypeId: '2',
  code: 'TR-2',
  name: 'Transformer 2',
  isActive: true,
  hasChildren: false,
};

describe('F2-T6 lazy topology navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('100 birimlik senaryoda ilk açılışta yalnız roots endpointini çağırır', async () => {
    mocks.apiClient.mockResolvedValue({ data: [root] });

    render(<TopologyBrowser />);

    expect(await screen.findByText('SUB-1')).toBeTruthy();
    expect(mocks.apiClient).toHaveBeenCalledTimes(1);
    expect(mocks.apiClient).toHaveBeenCalledWith('/units/navigation/roots');

    const requestedPaths = mocks.apiClient.mock.calls.map(([path]) => path);
    expect(requestedPaths).not.toContain('/units/1/navigation-children');
    expect(requestedPaths.some((path) => String(path).endsWith('/tree'))).toBe(
      false,
    );
  });

  it('children endpointini yalnız düğüm ilk kez açıldığında çağırır', async () => {
    mocks.apiClient.mockImplementation(async (path: string) => {
      if (path === '/units/navigation/roots') {
        return { data: [root] };
      }

      if (path === '/units/1/navigation-children') {
        return { parentId: '1', data: [child] };
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    render(<TopologyBrowser />);

    const toggle = await screen.findByRole('button', {
      name: 'Main substation alt birimlerini aç',
    });

    fireEvent.click(toggle);
    expect(await screen.findByText('TR-2')).toBeTruthy();

    // Kapatıp yeniden açınca daha önce yüklenen lokal children state'i
    // kullanılır; ikinci HTTP isteği yapılmaz.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Main substation alt birimlerini kapat',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Main substation alt birimlerini aç',
      }),
    );

    const childCalls = mocks.apiClient.mock.calls.filter(
      ([path]) => path === '/units/1/navigation-children',
    );
    expect(childCalls).toHaveLength(1);
  });

  it('kod aramasını URL query parametreleriyle gönderir', async () => {
    mocks.apiClient.mockImplementation(async (path: string) => {
      if (path === '/units/navigation/roots') {
        return { data: [root] };
      }

      if (path === '/units/navigation/search?code=TR-2&limit=20') {
        return { query: 'TR-2', data: [child] };
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    render(<TopologyBrowser />);
    await screen.findByText('SUB-1');

    fireEvent.change(screen.getByLabelText('Birim kodu'), {
      target: { value: 'TR-2' },
    });
    const searchForm = screen
      .getByRole('button', { name: 'Ara' })
      .closest('form');

    expect(searchForm).not.toBeNull();

    if (searchForm) {
      fireEvent.submit(searchForm);
    }

    await waitFor(() => {
      expect(mocks.apiClient).toHaveBeenCalledWith(
        '/units/navigation/search?code=TR-2&limit=20',
      );
    });
  });
});

describe('F2-T6 unit breadcrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.apiClient.mockImplementation(async (path: string) => {
      if (path === '/units/7') {
        return {
          id: '7',
          parent_id: '6',
          organization_unit_type_id: '3',
          code: 'FD-7',
          name: 'Feeder 7',
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
          created_by: 'system',
          updated_at: null,
          updated_by: null,
        };
      }

      if (path === '/units/7/history?page=1&limit=50') {
        return { data: [], total: 0 };
      }

      if (path === '/units/7/path') {
        return {
          data: [
            { ...root, hasChildren: undefined },
            {
              ...child,
              hasChildren: undefined,
            },
            {
              id: '7',
              parentId: '2',
              organizationUnitTypeId: '3',
              code: 'FD-7',
              name: 'Feeder 7',
              isActive: true,
            },
          ],
          comparison: {
            resultsMatch: true,
            neo4jDurationMs: 1,
            postgresDurationMs: 1,
          },
        };
      }

      throw new Error(`Unexpected request: ${path}`);
    });
  });

  afterEach(cleanup);

  it('breadcrumb zincirini tek path isteğiyle gösterir', async () => {
    render(<UnitDetail id="7" />);

    expect(await screen.findByText('FD-7')).toBeTruthy();
    expect(screen.getByText('SUB-1')).toBeTruthy();
    expect(screen.getByText('TR-2')).toBeTruthy();

    const pathCalls = mocks.apiClient.mock.calls.filter(
      ([path]) => path === '/units/7/path',
    );
    expect(pathCalls).toHaveLength(1);
  });
});
