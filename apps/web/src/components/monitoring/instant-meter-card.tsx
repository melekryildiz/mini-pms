'use client';

import type { UnitInstantMeter } from '@mini-pms/contracts';
import { getMeasurementStatus } from '@/lib/measurement-status';

type Props = {
  meter: UnitInstantMeter;
  // Bütün kartların kullanacağı zamanı üst bileşen verecek.
  nowMs: number;
};

const numberFormatter = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 3,
});

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export function InstantMeterCard({ meter, nowMs }: Props) {
  const { measurement } = meter;
  const status = getMeasurementStatus(measurement, nowMs);

  return (
    <article className="instant-meter-card">
      <header className="instant-meter-card-header">
        <div>
          <h2>{meter.serialNo}</h2>
          <p className="muted">
            {meter.unitCode} · {meter.unitName}
          </p>
        </div>

        <span
          className={`instant-meter-badge instant-meter-badge--${status.kind}`}
        >
          {status.label}
        </span>
      </header>

      {measurement ? (
        <>
          <dl className="instant-meter-values">
            <div>
              <dt>Aktif enerji çekiş</dt>
              <dd>
                {numberFormatter.format(measurement.activeImportKwh)} kWh
              </dd>
            </div>
            <div>
              <dt>Aktif enerji veriş</dt>
              <dd>
                {numberFormatter.format(measurement.activeExportKwh)} kWh
              </dd>
            </div>
            <div>
              <dt>Endüktif reaktif enerji</dt>
              <dd>
                {numberFormatter.format(measurement.inductiveKvarh)} kVArh
              </dd>
            </div>
            <div>
              <dt>Kapasitif reaktif enerji</dt>
              <dd>
                {numberFormatter.format(measurement.capacitiveKvarh)} kVArh
              </dd>
            </div>
          </dl>

          <footer className="instant-meter-footer">
            <span>
              Son ölçüm zamanı:{' '}
              <time dateTime={measurement.periodEnd}>
                {dateFormatter.format(new Date(measurement.periodEnd))}
              </time>{' '}
              (Türkiye saati)
            </span>
            <span>
              {status.ageMinutes === 0
                ? 'Son ölçümün üzerinden 1 dakikadan az geçti.'
                : `Son ölçümün üzerinden ${status.ageMinutes} dakika geçti.`}
            </span>
            <span>
              Değerler, bu saatte biten {measurement.intervalMinutes} dakikalık
              döneme aittir.
            </span>
          </footer>
        </>
      ) : (
        <p className="muted">Bu sayaç için henüz ölçüm bulunamadı.</p>
      )}
    </article>
  );
}
