import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnitsManager } from '../src/components/resources/units-manager';

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient }));

beforeEach(() => {
  apiClient.mockResolvedValue({ data: [], total: 0 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CRUD action visibility', () => {
  it('shows create to admin and operator', async () => {
    const { rerender } = render(<UnitsManager roles={['admin']} />);
    await screen.findByText('Birim bulunamadı.');
    expect(screen.getByRole('button', { name: 'Yeni birim' })).toBeTruthy();

    rerender(<UnitsManager roles={['operator']} />);
    expect(screen.getByRole('button', { name: 'Yeni birim' })).toBeTruthy();
  });

  it('keeps every write action out of the viewer DOM', async () => {
    render(<UnitsManager roles={['viewer']} />);
    await screen.findByText('Birim bulunamadı.');

    expect(screen.queryByRole('button', { name: 'Yeni birim' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
    expect(screen.getByText('İzleme')).toBeTruthy();
  });
});
