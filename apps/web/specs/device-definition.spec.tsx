import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DevicesManager } from '../src/components/resources/devices-manager';

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient }));
beforeEach(() => {
  apiClient.mockReset();
  apiClient.mockImplementation(async (path: string) =>
    path.startsWith('/units')
      ? { data: [{ id: '1', code: 'TR-1', name: 'Trafo' }], total: 1 }
      : { data: [], total: 0 },
  );
});
afterEach(cleanup);

it('sayaç formu yalnız MAIN/FEEDER sunar ve çarpanı decimal string olarak gönderir', async () => {
  render(<DevicesManager roles={['admin']} />);
  await screen.findByText('Cihaz bulunamadı.');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni cihaz' }));
  const role = screen.getByLabelText('Cihaz rolü') as HTMLSelectElement;
  expect(Array.from(role.options, (option) => option.value)).toEqual([
    'MAIN',
    'FEEDER',
  ]);
  const multiplier = screen.getByLabelText(/^Çarpan/) as HTMLInputElement;
  expect(multiplier.value).toBe('1');
  fireEvent.change(role, { target: { value: 'FEEDER' } });
  fireEvent.change(multiplier, { target: { value: '2.5' } });
  const form = multiplier.closest('form')!;
  fireEvent.change(form.querySelector('select')!, { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Seri numarası'), {
    target: { value: 'S-1001' },
  });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(apiClient).toHaveBeenCalledWith(
      '/devices',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  const call = apiClient.mock.calls.find(
    ([path, init]) => path === '/devices' && init?.method === 'POST',
  )!;
  expect(JSON.parse(call[1].body)).toMatchObject({
    role: 'FEEDER',
    multiplier: '2.5',
    organization_unit_id: '1',
  });
});
