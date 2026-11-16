'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { mapFieldErrors } from '@/lib/form-errors';
import { can } from '@/lib/permissions';
import type { AppRole } from '@/types/auth';
import type { PaginatedResult, ReactiveLimit, Unit } from '@/types/resources';
import { Pagination } from './pagination';

const PAGE_SIZE = 10;
type LimitForm = {
  organization_unit_id: string;
  limit_type: string;
  limit_value: string;
  valid_from: string;
  valid_to: string;
};
const emptyForm: LimitForm = {
  organization_unit_id: '',
  limit_type: 'INDUCTIVE',
  limit_value: '',
  valid_from: '',
  valid_to: '',
};

export function ReactiveLimitsManager({ roles }: { roles: AppRole[] }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState('');
  const [result, setResult] = useState<PaginatedResult<ReactiveLimit>>({
    data: [],
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReactiveLimit | null>(null);
  const [form, setForm] = useState<LimitForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof LimitForm, string>>
  >({});

  // Limit endpoint'i birim kimliği ister. İlk açılışta ilk aktif birimi seçer,
  // sonraki çağrılarda kullanıcının seçimini ve sayfa numarasını koruruz.
  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const unitResult = await apiClient<PaginatedResult<Unit>>(
        '/units?page=1&limit=100&is_active=true',
      );
      setUnits(unitResult.data);
      const selected = unitId || unitResult.data[0]?.id || '';
      if (!unitId && selected) setUnitId(selected);
      if (selected)
        setResult(
          await apiClient<PaginatedResult<ReactiveLimit>>(
            `/reactive-limits?organization_unit_id=${encodeURIComponent(selected)}&page=${page}&limit=${PAGE_SIZE}`,
          ),
        );
      else setResult({ data: [], total: 0 });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Limitler yüklenemedi.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, organization_unit_id: unitId });
    setFieldErrors({});
    setMessage('');
    setFormOpen(true);
  }
  function openEdit(limit: ReactiveLimit) {
    setEditing(limit);
    setForm({
      organization_unit_id: limit.organization_unit_id,
      limit_type: limit.limit_type,
      limit_value: limit.limit_value,
      valid_from: '',
      valid_to: '',
    });
    setFieldErrors({});
    setMessage('');
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setMessage('');
    try {
      // Tarih input'u yerel bir değer üretir; API sözleşmesi ise ISO tarih bekler.
      // Dönüşümü burada yaparak backend DTO'suna tek ve öngörülebilir format yollarız.
      const body = editing
        ? { limit_value: form.limit_value }
        : {
            organization_unit_id: form.organization_unit_id,
            limit_type: form.limit_type,
            limit_value: form.limit_value,
            valid_from: new Date(form.valid_from).toISOString(),
            valid_to: form.valid_to
              ? new Date(form.valid_to).toISOString()
              : null,
          };
      await apiClient(
        editing ? `/reactive-limits/${editing.id}` : '/reactive-limits',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      setUnitId(form.organization_unit_id);
      setFormOpen(false);
      await load();
    } catch (error) {
      // Ortak eşleyici sayesinde backend doğrulama metni doğru form alanına yazılır.
      const mapped = mapFieldErrors(error, [
        'organization_unit_id',
        'limit_type',
        'limit_value',
        'valid_from',
        'valid_to',
      ] as const);
      setFieldErrors(mapped.fields);
      setMessage(mapped.form ?? 'Form alanlarını kontrol edin.');
    }
  }

  return (
    <section className="resource-page">
      <div className="resource-page-header">
        <div>
          <p className="eyebrow">
            {can(roles, 'resource:create') ? 'Yönetim' : 'İzleme'}
          </p>
          <h1 className="page-title">Reaktif Limitler</h1>
          <p className="muted">
            Birime göre filtrelenen limit ve değişim geçmişini görüntüleyin.
          </p>
        </div>
        {/* Viewer bu kontrol nedeniyle butonu görmez; API guard'ı da yazmayı reddeder. */}
        {can(roles, 'resource:create') && (
          <button
            className="primary-action"
            disabled={!unitId}
            onClick={openCreate}
            type="button"
          >
            Yeni limit
          </button>
        )}
      </div>
      <div className="toolbar">
        <label>
          Birim
          <select
            value={unitId}
            onChange={(event) => {
              setPage(1);
              setUnitId(event.target.value);
            }}
          >
            <option value="">Birim seçin</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} — {unit.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message && <p className="form-alert">{message}</p>}
      <div className="table-card">
        {loading ? (
          <p className="empty-state">Limitler yükleniyor…</p>
        ) : result.data.length === 0 ? (
          <p className="empty-state">Bu birim için limit bulunamadı.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tür</th>
                  <th>Değer</th>
                  <th>Başlangıç</th>
                  <th>Bitiş</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((limit) => (
                  <tr key={limit.id}>
                    <td>{limit.limit_type}</td>
                    <td>{limit.limit_value}</td>
                    <td>
                      {new Date(limit.valid_from).toLocaleString('tr-TR')}
                    </td>
                    <td>
                      {limit.valid_to
                        ? new Date(limit.valid_to).toLocaleString('tr-TR')
                        : 'Süresiz'}
                    </td>
                    <td>
                      {can(roles, 'resource:update') && (
                        <button
                          className="table-button"
                          onClick={() => openEdit(limit)}
                          type="button"
                        >
                          Düzenle
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={result.total}
          onPageChange={setPage}
        />
      </div>
      {formOpen && (
        <div className="form-panel">
          <div className="form-panel-heading">
            <h2>{editing ? 'Limiti düzenle' : 'Yeni limit'}</h2>
            <button
              className="icon-button"
              onClick={() => setFormOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <form onSubmit={(event) => void submit(event)}>
            {!editing && (
              <>
                <label>
                  Birim
                  <select
                    required
                    value={form.organization_unit_id}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        organization_unit_id: event.target.value,
                      })
                    }
                  >
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.code} — {unit.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.organization_unit_id && (
                    <small className="field-error">
                      {fieldErrors.organization_unit_id}
                    </small>
                  )}
                </label>
                <label>
                  Limit türü
                  <input
                    required
                    value={form.limit_type}
                    onChange={(event) =>
                      setForm({ ...form, limit_type: event.target.value })
                    }
                  />
                  {fieldErrors.limit_type && (
                    <small className="field-error">
                      {fieldErrors.limit_type}
                    </small>
                  )}
                </label>
              </>
            )}
            <label>
              Limit değeri
              <input
                min="0"
                required
                step="any"
                type="number"
                value={form.limit_value}
                onChange={(event) =>
                  setForm({ ...form, limit_value: event.target.value })
                }
              />
              {fieldErrors.limit_value && (
                <small className="field-error">{fieldErrors.limit_value}</small>
              )}
            </label>
            {!editing && (
              <>
                <label>
                  Başlangıç
                  <input
                    required
                    type="datetime-local"
                    value={form.valid_from}
                    onChange={(event) =>
                      setForm({ ...form, valid_from: event.target.value })
                    }
                  />
                  {fieldErrors.valid_from && (
                    <small className="field-error">
                      {fieldErrors.valid_from}
                    </small>
                  )}
                </label>
                <label>
                  Bitiş
                  <input
                    type="datetime-local"
                    value={form.valid_to}
                    onChange={(event) =>
                      setForm({ ...form, valid_to: event.target.value })
                    }
                  />
                  {fieldErrors.valid_to && (
                    <small className="field-error">
                      {fieldErrors.valid_to}
                    </small>
                  )}
                </label>
              </>
            )}
            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                Vazgeç
              </button>
              <button className="primary-action" type="submit">
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
