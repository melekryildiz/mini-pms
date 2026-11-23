import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstantMonitoring } from '../src/components/monitoring/instant-monitoring';
import { getMeasurementStatus } from '../src/lib/measurement-status';

const mocks = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }));

const unit = { id: '1', code: 'TM-1', name: 'Merkez' };
const measurement = {
  periodStart: '2026-11-23T09:45:00.000Z',
  periodEnd: '2026-11-23T10:00:00.000Z',
  intervalMinutes: 15 as const,
  activeImportKwh: 0,
  activeExportKwh: 2,
  inductiveKvarh: 3,
  capacitiveKvarh: 4,
};

const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <InstantMonitoring />
    </QueryClientProvider>,
  );
}

describe('F3-T6 anlık izleme', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.apiClient.mockImplementation(async (path: string) => {
      if (path.startsWith('/units?')) return { data: [unit], total: 1 };
      return {
        unitId: '1',
        generatedAt: new Date().toISOString(),
        meters: [
          {
            deviceId: '10',
            serialNo: 'SAYAC-10',
            organizationUnitId: '1',
            unitCode: 'TM-1',
            unitName: 'Merkez',
            measurement,
          },
        ],
      };
    });
  });
  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    vi.useRealTimers();
  });

  it('birim seçmeden ölçüm istemez; seçimden sonra sıfır enerji değerini gösterir', async () => {
    mount();
    await screen.findByRole('option', { name: 'TM-1 · Merkez' });
    expect(
      mocks.apiClient.mock.calls.some(([path]) =>
        path.includes('instant-values'),
      ),
    ).toBe(false);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    expect(await screen.findByText('SAYAC-10')).toBeTruthy();
    expect(screen.getByText('0 kWh')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Seçimi temizle' }));
    expect(screen.queryByText('SAYAC-10')).toBeNull();
  });

  it('30 saniyede yeniden alır; yeni ölçüm gelmezse yaş ilerler ve rozet amber olur', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:29:30Z'));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText('Güncel')).toBeTruthy();
    expect(
      mocks.apiClient.mock.calls.filter(([path]) =>
        path.includes('instant-values'),
      ),
    ).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(
      mocks.apiClient.mock.calls.filter(([path]) =>
        path.includes('instant-values'),
      ),
    ).toHaveLength(2);
    expect(screen.getByText('Haberleşme yok').className).toContain('--stale');
    expect(screen.getByText('Son ölçümün üzerinden 30 dakika geçti.')).toBeTruthy();
    expect(screen.getByText('23.11.2026 13:00')).toBeTruthy();
  });

  it('ölçüm bulunmamasını sıfır tüketimden ayırır', () => {
    expect(getMeasurementStatus(null, Date.now()).kind).toBe('missing');
    expect(
      getMeasurementStatus(measurement, Date.parse(measurement.periodEnd)).kind,
    ).toBe('fresh');
  });

  it('ikinci sayfadaki birimlere ulaşır', async () => {
    mocks.apiClient.mockImplementation(async (path: string) => ({
      data: path.includes('page=2')
        ? [{ ...unit, id: '21', code: 'TM-21' }]
        : [unit],
      total: 21,
    }));
    mount();
    await screen.findByRole('option', { name: 'TM-1 · Merkez' });
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    expect(
      await screen.findByRole('option', { name: 'TM-21 · Merkez' }),
    ).toBeTruthy();
  });

  it('istek hatasını sayaç haberleşme durumundan ayrı gösterir', async () => {
    mocks.apiClient.mockImplementation(async (path: string) => {
      if (path.startsWith('/units?')) return { data: [unit], total: 1 };
      throw new Error('Sunucuya erişilemiyor');
    });
    mount();
    await screen.findByRole('option', { name: 'TM-1 · Merkez' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    await waitFor(
      () =>
        expect(screen.getByRole('alert').textContent).toContain(
          'Sunucuya erişilemiyor',
        ),
      { timeout: 3000 },
    );
    expect(screen.queryByText('Haberleşme yok')).toBeNull();
  });
});
