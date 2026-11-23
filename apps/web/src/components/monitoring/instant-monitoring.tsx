'use client';

import { useEffect, useState } from 'react';
import { useUnitInstantValues } from '@/app/hooks/use-unit-instant-values';
import type { Unit } from '@/types/resources';
import { InstantUnitSelector } from './instant-unit-selector';
import { InstantMeterCard } from './instant-meter-card';

export function InstantMonitoring() {
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const valuesQuery = useUnitInstantValues(selectedUnit?.id ?? null);

  useEffect(() => {
    // Sayaç sayısından bağımsız tek timer. API hata verse de veri yaşlanır.
    const updateClock = () => setNowMs(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    // Askıya alınan sekmeye dönüldüğünde saati hemen düzelt.
    window.addEventListener('focus', updateClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateClock);
    };
  }, []);

  return (
    <section className="resource-page">
      <div className="resource-page-header">
        <div>
          <p className="eyebrow">İzleme</p>
          <h1 className="page-title">Anlık izleme</h1>
          <p className="muted">Son ölçümler 30 saniyede bir yenilenir.</p>
        </div>
      </div>

      <InstantUnitSelector
        selectedUnitId={selectedUnit?.id ?? null}
        onSelect={setSelectedUnit}
      />

      {!selectedUnit ? (
        <p>Ölçümleri görmek için bir birim seç.</p>
      ) : (
        <>
          <div className="instant-monitoring-summary">
            <div>
              <h2>
                {selectedUnit.code} · {selectedUnit.name}
              </h2>
              {valuesQuery.data && (
                <p>{valuesQuery.data.meters.length} sayaç</p>
              )}
            </div>
            <button
              type="button"
              className="table-button"
              onClick={() => void valuesQuery.refetch()}
              disabled={valuesQuery.isFetching}
            >
              {valuesQuery.isFetching ? 'Yenileniyor...' : 'Şimdi yenile'}
            </button>
          </div>

          {valuesQuery.isPending && !valuesQuery.error && (
            <p>Ölçümler yükleniyor...</p>
          )}
          {valuesQuery.error && (
            <p role="alert">
              Ölçümler yenilenemedi: {valuesQuery.error.message}.
              {valuesQuery.data && ' Son alınan değerler gösteriliyor.'}
            </p>
          )}
          {valuesQuery.data?.meters.length === 0 && (
            <p>Bu birimde ve alt birimlerinde aktif sayaç bulunamadı.</p>
          )}
          <div className="instant-meter-grid">
            {valuesQuery.data?.meters.map((meter) => (
              <InstantMeterCard
                key={meter.deviceId}
                meter={meter}
                nowMs={nowMs}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
