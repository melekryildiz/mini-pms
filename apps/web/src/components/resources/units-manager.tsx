'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { mapFieldErrors } from '@/lib/form-errors';
import { can } from '@/lib/permissions';
import type { AppRole } from '@/types/auth';
import type { PaginatedResult, Unit } from '@/types/resources';
import { Pagination } from './pagination';

const PAGE_SIZE = 10;
type UnitForm = {
  organization_unit_type_id: string;
  parent_id: string;
  code: string;
  name: string;
  is_active: boolean;
};
const emptyForm: UnitForm = {
  organization_unit_type_id: '1',
  parent_id: '',
  code: '',
  name: '',
  is_active: true,
};

export function UnitsManager({ roles }: { roles: AppRole[] }) {
  const [result, setResult] = useState<PaginatedResult<Unit>>({
    data: [],
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState<UnitForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof UnitForm, string>>
  >({});
  const [formError, setFormError] = useState('');

  // Filtre ve sayfa bilgisini API'ye gönderiyoruz. Böylece tüm kayıtları
  // tarayıcıya indirip burada bölmek yerine gerçek sunucu taraflı sayfalama yapılır.
  const loadUnits = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (activeFilter) query.set('is_active', activeFilter);

    try {
      setResult(await apiClient<PaginatedResult<Unit>>(`/units?${query}`));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Birimler yüklenemedi.',
      );
    } finally {
      setLoading(false);
    }
  }, [activeFilter, page]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(unit: Unit) {
    setEditing(unit);
    setForm({
      organization_unit_type_id: unit.organization_unit_type_id,
      parent_id: unit.parent_id ?? '',
      code: unit.code,
      name: unit.name,
      is_active: unit.is_active,
    });
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError('');

    try {
      // Create ve update DTO'ları aynı alanlara sahip değil. Özellikle birimin
      // tipi/üst birimi yalnızca oluşturma sırasında gönderildiği için payload'ı ayırıyoruz.
      const body = editing
        ? { code: form.code, name: form.name, is_active: form.is_active }
        : {
            organization_unit_type_id: form.organization_unit_type_id,
            parent_id: form.parent_id || null,
            code: form.code,
            name: form.name,
          };
      await apiClient(editing ? `/units/${editing.id}` : '/units', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setFormOpen(false);
      await loadUnits();
    } catch (error) {
      // Backend class-validator mesajlarını ilgili input'un altına taşıyoruz.
      // Herhangi bir alana bağlanamayan iş kuralı hatası formun üstünde kalır.
      const mapped = mapFieldErrors(error, [
        'organization_unit_type_id',
        'parent_id',
        'code',
        'name',
        'is_active',
      ] as const);
      setFieldErrors(mapped.fields);
      setFormError(mapped.form ?? 'Form alanlarını kontrol edin.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(unit: Unit) {
    if (!window.confirm(`${unit.name} birimini silmek istiyor musunuz?`))
      return;
    try {
      await apiClient(`/units/${unit.id}`, { method: 'DELETE' });
      await loadUnits();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Birim silinemedi.',
      );
    }
  }

  return (
    <section className="resource-page">
      <div className="resource-page-header">
        <div>
          <p className="eyebrow">
            {can(roles, 'resource:create') ? 'Yönetim' : 'İzleme'}
          </p>
          <h1 className="page-title">Birimler</h1>
          <p className="muted">
            Organizasyon birimlerini filtreleyin ve yetkinize göre yönetin.
          </p>
        </div>
        {/* Butonu gizlemek kullanıcı deneyimidir; asıl güvenlik backend guard'ındadır. */}
        {can(roles, 'resource:create') && (
          <button className="primary-action" onClick={openCreate} type="button">
            Yeni birim
          </button>
        )}
      </div>

      <div className="toolbar">
        <label>
          Durum
          <select
            value={activeFilter}
            onChange={(event) => {
              setPage(1);
              setActiveFilter(event.target.value);
            }}
          >
            <option value="">Tümü</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
        </label>
      </div>
      {loadError && <p className="form-alert">{loadError}</p>}

      <div className="table-card">
        {loading ? (
          <p className="empty-state">Birimler yükleniyor…</p>
        ) : result.data.length === 0 ? (
          <p className="empty-state">Birim bulunamadı.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Ad</th>
                  <th>Tür</th>
                  <th>Durum</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((unit) => (
                  <tr key={unit.id}>
                    <td>
                      <Link className="detail-link" href={`/units/${unit.id}`}>
                        {unit.code}
                      </Link>
                    </td>
                    <td>{unit.name}</td>
                    <td>{unit.organization_unit_type_id}</td>
                    <td>
                      <span
                        className={unit.is_active ? 'status active' : 'status'}
                      >
                        {unit.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="table-button"
                          href={`/units/${unit.id}`}
                        >
                          Detay
                        </Link>
                        {can(roles, 'resource:update') && (
                          <button
                            className="table-button"
                            onClick={() => openEdit(unit)}
                            type="button"
                          >
                            Düzenle
                          </button>
                        )}
                        {can(roles, 'resource:delete') && (
                          <button
                            className="table-button danger"
                            onClick={() => void remove(unit)}
                            type="button"
                          >
                            Sil
                          </button>
                        )}
                      </div>
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
            <h2>{editing ? 'Birimi düzenle' : 'Yeni birim'}</h2>
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
                  Birim türü
                  <select
                    value={form.organization_unit_type_id}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        organization_unit_type_id: event.target.value,
                      })
                    }
                  >
                    <option value="1">Trafo merkezi</option>
                    <option value="2">Transformatör</option>
                    <option value="3">Fider</option>
                  </select>
                  {fieldErrors.organization_unit_type_id && (
                    <small className="field-error">
                      {fieldErrors.organization_unit_type_id}
                    </small>
                  )}
                </label>
                <label>
                  Üst birim ID
                  <input
                    value={form.parent_id}
                    onChange={(event) =>
                      setForm({ ...form, parent_id: event.target.value })
                    }
                  />
                  {fieldErrors.parent_id && (
                    <small className="field-error">
                      {fieldErrors.parent_id}
                    </small>
                  )}
                </label>
              </>
            )}
            <label>
              Kod
              <input
                required
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
              />
              {fieldErrors.code && (
                <small className="field-error">{fieldErrors.code}</small>
              )}
            </label>
            <label>
              Ad
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
              {fieldErrors.name && (
                <small className="field-error">{fieldErrors.name}</small>
              )}
            </label>
            {editing && (
              <label className="checkbox-label">
                <input
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm({ ...form, is_active: event.target.checked })
                  }
                  type="checkbox"
                />
                Aktif
              </label>
            )}
            {formError && <p className="form-alert">{formError}</p>}
            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                Vazgeç
              </button>
              <button
                className="primary-action"
                disabled={saving}
                type="submit"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
