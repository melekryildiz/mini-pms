import { createHash, randomUUID } from 'node:crypto';

import type {
  MeasurementEvent,
  SimulationDevice,
  SimulationMode,
} from '@mini-pms/contracts';

const PERIOD_MS = 15 * 60 * 1000;
const PERIOD_HOURS = 15 / 60;

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getLocalHour(date: Date): number {
  const parts = clock.formatToParts(date);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value);

  const minute = Number(parts.find((part) => part.type === 'minute')?.value);

  return hour + minute / 60;
}

/** Belirli bir saatin çevresinde yumuşak bir yük tepesi oluşturur. */
function peak(hour: number, center: number, width: number): number {
  return Math.exp(-0.5 * ((hour - center) / width) ** 2);
}

/** Enerji miktarlarını altı ondalık basamakla gönderiyoruz. */
function roundEnergy(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function getLastCompletedPeriodStart(now: Date = new Date()): Date {
  const time = now.getTime();

  if (!Number.isFinite(time)) {
    throw new Error('Geçersiz tarih.');
  }

  return new Date(Math.floor(time / PERIOD_MS) * PERIOD_MS - PERIOD_MS);
}

/**
 * Tek sayacın tamamlanmış bir dönemine ait enerji üretir.
 *
 * Veritabanına yazmaz, RPC yapmaz, Kafka'ya göndermez.
 * Yalnızca ortak sözleşmeye uygun bir mesaj hazırlar.
 */
export function generateMeasurement(
  meter: SimulationDevice,
  periodStart: Date,
  mode: SimulationMode,
): MeasurementEvent {
  const startMs = periodStart.getTime();
  const producedAt = new Date();

  if (!Number.isFinite(startMs)) {
    throw new Error('Geçersiz dönem başlangıcı.');
  }

  // Sessizce yuvarlamak yerine hatalı çağrıyı görünür kılıyoruz.
  if (startMs % PERIOD_MS !== 0) {
    throw new Error('Dönem başlangıcı 15 dakika sınırına hizalanmalı.');
  }

  if (startMs + PERIOD_MS > producedAt.getTime()) {
    throw new Error('Henüz tamamlanmamış dönem için ölçüm üretilemez.');
  }

  // Sayaç kimliğinden sabit bir kapasite türetiyoruz.
  // Böylece her sayaç farklı büyüklükte yük taşır.
  const meterHash = createHash('sha256').update(meter.id).digest();

  const capacityKw = 30 + (meterHash.readUInt32BE(0) % 171);

  // Gürültüyü sayaç + dönem üzerinden türetiyoruz.
  // Aynı dönem yeniden üretildiğinde enerji değerleri değişmez.
  const periodHash = createHash('sha256')
    .update(`${meter.id}:${periodStart.toISOString()}`)
    .digest();

  const variation = periodHash.readUInt32BE(0) / 0xffff_ffff;
  const noise = 0.96 + variation * 0.08;

  // Dönemin orta noktasını kullanarak ortalama yükü yaklaşık modelliyoruz.
  const midpoint = new Date(startMs + PERIOD_MS / 2);
  const hour = getLocalHour(midpoint);

  // Gece taban tüketimi, gündüz ve akşam yükselen yük.
  // Bu, saha verisinden kalibre edilmemiş sentetik bir tüketim profilidir.
  const loadFactor =
    0.2 + 0.35 * peak(hour, 10, 2.5) + 0.45 * peak(hour, 19, 2.5);

  const averageImportKw = capacityKw * loadFactor * noise;

  // Güneş profili: yaklaşık 06:00–18:00 üretim, öğlen tepe.
  // Kapasite sentetiktir; gerçek kurulu güçten kalibre edilmiş değildir.
  const averageGenerationKw =
    meter.simulationProfile === 'solar' && hour > 6 && hour < 18
      ? capacityKw * Math.sin(((hour - 6) / 12) * Math.PI) * noise
      : 0;

  // Sayaç net akışı ölçer: üretim tüketimi aşarsa şebekeye veriş olur.
  // Enerji = dönem ortalama gücü × süre.
  // Örneğin 40 kW × 0,25 saat = 10 kWh.
  const activeImportKwh = roundEnergy(
    Math.max(0, averageImportKw - averageGenerationKw) * PERIOD_HOURS,
  );

  const activeExportKwh = roundEnergy(
    Math.max(0, averageGenerationKw - averageImportKw) * PERIOD_HOURS,
  );

  // Yüksek endüktif modda reaktif enerji oranını artırıyoruz.
  // Alarmın oluşup oluşmaması, tanımlı limite bağlıdır.
  const inductiveRatio =
    mode === 'high-inductive'
      ? 0.55 + variation * 0.15
      : 0.08 + variation * 0.08;

  const capacitiveRatio = 0.01 + variation * 0.02;

  const inductiveKvarh = roundEnergy(activeImportKwh * inductiveRatio);

  const capacitiveKvarh = roundEnergy(activeImportKwh * capacitiveRatio);

  return {
    eventId: randomUUID(),
    schemaVersion: 1,

    deviceId: meter.id,
    serialNo: meter.serialNo,
    organizationUnitId: meter.organizationUnitId,

    periodStart: periodStart.toISOString(),
    intervalMinutes: 15,
    producedAt: producedAt.toISOString(),

    source: 'simulator',
    simulationMode: mode,

    // Corrupt modunda geçerli JSON içinde geçersiz enerji gönderiyoruz.
    // Negatif enerji mevcut interval CHECK constraint'ine de aykırıdır.
    activeImportKwh:
      mode === 'corrupt' ? -Math.max(activeImportKwh, 0.001) : activeImportKwh,

    activeExportKwh,
    inductiveKvarh,
    capacitiveKvarh,
  };
}
