import type { UnitInstantMeasurement } from '@mini-pms/contracts';

// Son tamamlanan ölçümün üzerinden 30 dakika geçtiyse
// sayacı haberleşme yok durumunda göstereceğiz.
const COMMUNICATION_TIMEOUT_MS = 30 * 60 * 1000;

type MeasurementStatus =
  | {
      kind: 'missing';
      label: string;
      ageMinutes: null;
    }
  | {
      kind: 'fresh' | 'stale';
      label: string;
      ageMinutes: number;
    };

export function getMeasurementStatus(
  measurement: UnitInstantMeasurement | null,
  nowMs: number,
): MeasurementStatus {
  // Ölçüm bulunmaması, sıfır tüketim anlamına gelmez.
  if (measurement === null) {
    return {
      kind: 'missing',
      label: 'Ölçüm yok',
      ageMinutes: null,
    };
  }

  const periodEndMs = Date.parse(measurement.periodEnd);

  // Küçük saat farklarında negatif yaş göstermeyelim.
  const ageMs = Math.max(0, nowMs - periodEndMs);
  const ageMinutes = Math.floor(ageMs / 60_000);

  if (ageMs >= COMMUNICATION_TIMEOUT_MS) {
    return {
      kind: 'stale',
      label: 'Haberleşme yok',
      ageMinutes,
    };
  }

  return {
    kind: 'fresh',
    label: 'Güncel',
    ageMinutes,
  };
}