'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { mapFieldErrors } from '@/lib/form-errors';
import { can } from '@/lib/permissions';
import type { AppRole } from '@/types/auth';
import type { Device, PaginatedResult, Unit } from '@/types/resources';
import { Pagination } from './pagination';

const PAGE_SIZE = 10;
type DeviceForm = {
  organization_unit_id: string;
  serial_no: string;
  role: string;
  multiplier: string;
  metadata: string;
  is_active: boolean;
};
const emptyForm: DeviceForm = {
  organization_unit_id: '',
  serial_no: '',
  role: 'MAIN',
  multiplier: '1',
  metadata: '{}',
  is_active: true,
};

export function DevicesManager({ roles }: { roles: AppRole[] }) {
  const [result, setResult] = useState<PaginatedResult<Device>>({
    data: [],
    total: 0,
  });
  const [units, setUnits] = useState<Unit[]>([]);
  const [page, setPage] = useState(1);
  const [unitFilter, setUnitFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof DeviceForm, string>>
  >({});
  const [saving, setSaving] = useState(false);

  // Cihaz listesi ile seçim kutusunda kullanılan birimleri paralel istiyoruz.
  // Cihaz filtreleri API'ye gider; frontend yalnızca dönen sayfayı gösterir.
  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (unitFilter) query.set('organization_unit_id', unitFilter);
    if (activeFilter) query.set('is_active', activeFilter);
    try {
      const [devices, unitResult] = await Promise.all([
        apiClient<PaginatedResult<Device>>(`/devices?${query}`),
        apiClient<PaginatedResult<Unit>>(
          '/units?page=1&limit=100&is_active=true',
        ),
      ]);
      setResult(devices);
      setUnits(unitResult.data);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Cihazlar yüklenemedi.',
      );
    } finally {
      setLoading(false);
    }
  }, [activeFilter, page, unitFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setMessage('');
    setFormOpen(true);
  }
  function openEdit(device: Device) {
    setEditing(device);
    setForm({
      organization_unit_id: device.organization_unit_id,
      serial_no: device.serial_no,
      role: device.role,
      multiplier: device.multiplier ?? '1',
      metadata: JSON.stringify(device.metadata, null, 2),
      is_active: device.is_active,
    });
    setFieldErrors({});
    setMessage('');
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setMessage('');
    try {
      let metadata: Record<string, unknown>;
      try {
        // Textarea kullanıcıya JSON düzenleme esnekliği verir; bozuk JSON'u
        // backend'e göndermeden önce yakalayıp doğrudan alanın altında gösteririz.
        metadata = JSON.parse(form.metadata) as Record<string, unknown>;
      } catch {
        setFieldErrors({
          metadata: 'Metadata geçerli bir JSON nesnesi olmalıdır.',
        });
        return;
      }
      const body = editing
        ? {
            serial_no: form.serial_no,
            role: form.role,
            multiplier: form.multiplier,
            metadata,
            is_active: form.is_active,
          }
        : {
            organization_unit_id: form.organization_unit_id,
            serial_no: form.serial_no,
            role: form.role,
            multiplier: form.multiplier,
            metadata,
          };
      await apiClient(editing ? `/devices/${editing.id}` : '/devices', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setFormOpen(false);
      await load();
    } catch (error) {
      // API hata gövdesindeki class-validator mesajları alan adlarıyla eşleştirilir.
      const mapped = mapFieldErrors(error, [
        'organization_unit_id',
        'serial_no',
        'role',
        'multiplier',
        'metadata',
        'is_active',
      ] as const);
      setFieldErrors(mapped.fields);
      setMessage(mapped.form ?? 'Form alanlarını kontrol edin.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(device: Device) {
    if (!window.confirm(`${device.serial_no} cihazını silmek istiyor musunuz?`))
      return;
    try {
      await apiClient(`/devices/${device.id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cihaz silinemedi.');
    }
  }

  return (
    <section className="resource-page">
      <div className="resource-page-header">
        <div>
          <p className="eyebrow">
            {can(roles, 'resource:create') ? 'Yönetim' : 'İzleme'}
          </p>
          <h1 className="page-title">Cihazlar</h1>
          <p className="muted">
            Sayaçları sunucu tarafında filtreleyin ve yönetin.
          </p>
        </div>
        {/* UI kontrolü yanlışlıkla işlem denemesini önler; backend yine rolü doğrular. */}
        {can(roles, 'resource:create') && (
          <button className="primary-action" onClick={openCreate} type="button">
            Yeni cihaz
          </button>
        )}
      </div>
      <div className="toolbar">
        <label>
          Birim
          <select
            value={unitFilter}
            onChange={(event) => {
              setPage(1);
              setUnitFilter(event.target.value);
            }}
          >
            <option value="">Tümü</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} — {unit.name}
              </option>
            ))}
          </select>
        </label>
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
      {message && <p className="form-alert">{message}</p>}
      <div className="table-card">
        {loading ? (
          <p className="empty-state">Cihazlar yükleniyor…</p>
        ) : result.data.length === 0 ? (
          <p className="empty-state">Cihaz bulunamadı.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Seri no</th>
                  <th>Birim</th>
                  <th>Rol</th>
                  <th>Çarpan</th>
                  <th>Durum</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((device) => (
                  <tr key={device.id}>
                    <td>{device.serial_no}</td>
                    <td>{device.organization_unit_id}</td>
                    <td>{device.role}</td>
                    <td>{device.multiplier}</td>
                    <td>
                      <span
                        className={
                          device.is_active ? 'status active' : 'status'
                        }
                      >
                        {device.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {can(roles, 'resource:update') && (
                          <button
                            className="table-button"
                            onClick={() => openEdit(device)}
                            type="button"
                          >
                            Düzenle
                          </button>
                        )}
                        {can(roles, 'resource:delete') && (
                          <button
                            className="table-button danger"
                            onClick={() => void remove(device)}
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
            <h2>{editing ? 'Cihazı düzenle' : 'Yeni cihaz'}</h2>
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
                  <option value="">Birim seçin</option>
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
            )}
            <label>
              Seri numarası
              <input
                required
                value={form.serial_no}
                onChange={(event) =>
                  setForm({ ...form, serial_no: event.target.value })
                }
              />
              {fieldErrors.serial_no && (
                <small className="field-error">{fieldErrors.serial_no}</small>
              )}
            </label>
            <label>
              Cihaz rolü
              <select
                required
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
              >
                <option value="MAIN">MAIN — Ana sayaç</option>
                <option value="FEEDER">FEEDER — Fider sayacı</option>
              </select>
              {fieldErrors.role && (
                <small className="field-error">{fieldErrors.role}</small>
              )}
            </label>
            <label>
              Çarpan
              <input
                type="number"
                required
                min="0.000001"
                max="999999999999.999999"
                step="0.000001"
                value={form.multiplier}
                onChange={(event) =>
                  setForm({ ...form, multiplier: event.target.value })
                }
              />
              <small>
                Ham enerji bu değerle çarpılır. Çarpan yoksa 1 kullanılır.
              </small>
              {fieldErrors.multiplier && (
                <small className="field-error">{fieldErrors.multiplier}</small>
              )}
            </label>
            <label>
              Metadata
              <textarea
                rows={5}
                value={form.metadata}
                onChange={(event) =>
                  setForm({ ...form, metadata: event.target.value })
                }
              />
              {fieldErrors.metadata && (
                <small className="field-error">{fieldErrors.metadata}</small>
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
