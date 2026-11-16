'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  GetUnitPathResponse,
  PaginatedResult,
  Unit,
  UnitHistory,
  UnitTopologyNode,
} from '@/types/resources';

export function UnitDetail({ id }: { id: string }) {
  const [unit, setUnit] = useState<Unit | null>(null);
  const [history, setHistory] = useState<PaginatedResult<UnitHistory>>({
    data: [],
    total: 0,
  });
  /** Root Unit'ten mevcut Unit'e kadar olan sıralı breadcrumb yolu. */
  const [breadcrumb, setBreadcrumb] = useState<UnitTopologyNode[]>([]);
  const [breadcrumbLoading, setBreadcrumbLoading] = useState(true);
  const [breadcrumbError, setBreadcrumbError] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setBreadcrumbError('');
    setBreadcrumbLoading(true);

    /**
     * Detay/audit ve breadcrumb birbirinden bağımsızdır. allSettled sayesinde
     * path geçici olarak başarısız olsa bile Unit detayını göstermeye devam
     * ederiz. Breadcrumb için yalnız bir `/units/:id/path` isteği yapılır.
     */
    const [contentResult, breadcrumbResult] = await Promise.allSettled([
      Promise.all([
        apiClient<Unit>(`/units/${id}`),
        apiClient<PaginatedResult<UnitHistory>>(
          `/units/${id}/history?page=1&limit=50`,
        ),
      ]),
      apiClient<GetUnitPathResponse>(`/units/${id}/path`),
    ]);

    if (contentResult.status === 'fulfilled') {
      const [unitResult, historyResult] = contentResult.value;
      setUnit(unitResult);
      setHistory(historyResult);
    } else {
      const loadError: unknown = contentResult.reason;

      setError(
        loadError instanceof Error ? loadError.message : 'Birim yüklenemedi.',
      );
    }

    if (breadcrumbResult.status === 'fulfilled') {
      setBreadcrumb(breadcrumbResult.value.data);
    } else {
      const pathError: unknown = breadcrumbResult.reason;

      // Breadcrumb hatası detay ve audit alanlarını kullanılamaz hale getirmez.
      setBreadcrumbError(
        pathError instanceof Error
          ? pathError.message
          : 'Birim yolu yüklenemedi.',
      );
    }

    setBreadcrumbLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="resource-page">
      <Link className="back-link" href="/units">
        ← Birimlere dön
      </Link>
      <nav aria-label="Birim hiyerarşisi" className="unit-breadcrumb">
        {breadcrumbLoading ? (
          <span className="unit-breadcrumb-message">
            Birim yolu yükleniyor…
          </span>
        ) : breadcrumbError ? (
          <span className="unit-breadcrumb-error" role="status">
            Breadcrumb gösterilemedi.
          </span>
        ) : (
          <ol>
            {breadcrumb.map((item, index) => {
              const isCurrent = index === breadcrumb.length - 1;

              return (
                <li key={item.id}>
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="unit-breadcrumb-separator"
                    >
                      /
                    </span>
                  )}

                  {isCurrent ? (
                    <span
                      aria-current="page"
                      className="unit-breadcrumb-current"
                    >
                      {item.code}
                    </span>
                  ) : (
                    <Link href={`/units/${item.id}`}>{item.code}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </nav>
      {error ? (
        <p className="form-alert">{error}</p>
      ) : !unit ? (
        <p className="empty-state">Birim yükleniyor…</p>
      ) : (
        <>
          <div className="resource-page-header">
            <div>
              <p className="eyebrow">Birim Detayı</p>
              <h1 className="page-title">{unit.name}</h1>
              <p className="muted">
                {unit.code} · {unit.is_active ? 'Aktif' : 'Pasif'}
              </p>
            </div>
          </div>
          <div className="detail-grid">
            <div>
              <span>Tür ID</span>
              <strong>{unit.organization_unit_type_id}</strong>
            </div>
            <div>
              <span>Üst birim</span>
              <strong>{unit.parent_id ?? 'Yok'}</strong>
            </div>
            <div>
              <span>Oluşturan</span>
              <strong>{unit.created_by}</strong>
            </div>
            <div>
              <span>Güncelleyen</span>
              <strong>{unit.updated_by ?? '—'}</strong>
            </div>
          </div>
          <div className="history-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Audit Log</p>
                <h2>Değişiklik geçmişi</h2>
              </div>
              <span className="read-only-note">{history.total} kayıt</span>
            </div>
            {history.data.length === 0 ? (
              <p className="empty-state">Değişiklik kaydı yok.</p>
            ) : (
              <ol className="timeline">
                {history.data.map((entry) => (
                  <li key={entry.id}>
                    <span className="timeline-dot" />
                    <div>
                      <div className="timeline-heading">
                        <strong>{entry.action}</strong>
                        <time>
                          {new Date(entry.created_at).toLocaleString('tr-TR')}
                        </time>
                      </div>
                      <p>{entry.created_by}</p>
                      <details>
                        <summary>Değişiklikleri göster</summary>
                        <pre>{JSON.stringify(entry.changes, null, 2)}</pre>
                      </details>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
