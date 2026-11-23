'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Unit } from '@/types/resources';
import { Pagination } from '@/components/resources/pagination';

const PAGE_SIZE = 20;

export function InstantUnitSelector({
  selectedUnitId,
  onSelect,
}: {
  selectedUnitId: string | null;
  onSelect: (unit: Unit | null) => void;
}) {
  const [page, setPage] = useState(1);
  const unitsQuery = useQuery({
    queryKey: ['instant-unit-options', page],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        is_active: 'true',
        sortBy: 'id',
        sortOrder: 'ASC',
      });
      return apiClient<PaginatedResult<Unit>>(`/units?${query}`, { signal });
    },
    staleTime: 60_000,
  });

  return (
    <section className="info-panel">
      <h2>İzlenecek birim</h2>
      <p className="muted">
        Seçtiğin birimin ve alt birimlerinin sayaçları gösterilir.
      </p>
      {unitsQuery.isPending && <p>Birimler yükleniyor...</p>}
      {unitsQuery.error && (
        <div role="alert">
          <p>Birim listesi alınamadı: {unitsQuery.error.message}</p>
          <button
            type="button"
            className="table-button"
            onClick={() => void unitsQuery.refetch()}
            disabled={unitsQuery.isFetching}
          >
            Tekrar dene
          </button>
        </div>
      )}
      {unitsQuery.data && (
        <>
          <div className="toolbar">
            <label>
              Birim
              <select
                value={
                  unitsQuery.data.data.some(
                    (unit) => unit.id === selectedUnitId,
                  )
                    ? (selectedUnitId ?? '')
                    : ''
                }
                onChange={(event) => {
                  const unit = unitsQuery.data.data.find(
                    (item) => item.id === event.target.value,
                  );
                  onSelect(unit ?? null);
                }}
              >
                <option value="">Birim seç</option>
                {unitsQuery.data.data.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code} · {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="table-button"
              onClick={() => onSelect(null)}
              disabled={selectedUnitId === null}
            >
              Seçimi temizle
            </button>
          </div>
          {unitsQuery.data.total === 0 && (
            <p>İzlenebilecek aktif birim bulunamadı.</p>
          )}
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={unitsQuery.data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
