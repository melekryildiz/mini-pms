// Varsayılanlar uygulama topic'leridir; kabul testleri ayrı topic kullanabilir.
export const MEASUREMENT_RAW_TOPIC =
  process.env.MEASUREMENT_RAW_TOPIC ?? 'mpms.measurement.raw';
export const MEASUREMENT_DLQ_TOPIC =
  process.env.MEASUREMENT_DLQ_TOPIC ?? 'mpms.measurement.dlq';
/** Performans karşılaştırmasında iki yöntemi de çalıştırabileceğiz. */
export type MeasurementWriteMode = 'single' | 'batch';

function readWriteMode(): MeasurementWriteMode {
  // Tekli yol karşılaştırma için korunur; normal çalışma topludur.
  const value = process.env.MEASUREMENT_WRITE_MODE ?? 'batch';

  if (value !== 'single' && value !== 'batch') {
    throw new Error('MEASUREMENT_WRITE_MODE single veya batch olmalı.');
  }

  return value;
}

function readBatchSize(): number {
  const value = process.env.MEASUREMENT_BATCH_SIZE ?? '500';

  // Ondalıklı, negatif veya boş değerleri kabul etme.
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('MEASUREMENT_BATCH_SIZE pozitif bir tam sayı olmalı.');
  }

  const size = Number(value);

  // İlk sürümde kontrolsüz büyüklükte SQL oluşturmamak için sınır.
  // Bu uygulama tercihidir, PostgreSQL'in maksimum satır sayısı değildir.
  if (!Number.isSafeInteger(size) || size > 1_000) {
    throw new Error('MEASUREMENT_BATCH_SIZE 1 ile 1000 arasında olmalı.');
  }

  return size;
}

export const MEASUREMENT_WRITE_MODE = readWriteMode();

/**
 * Bir SQL yazımında işleyeceğimiz en fazla mesaj sayısı.
 * Bu sayıya ulaşana kadar mesaj bekletmeyeceğiz.
 */
export const MEASUREMENT_BATCH_SIZE = readBatchSize();

/** Unit Service'e RPC gönderen bağlantının Nest içindeki adı. */
export const UNIT_SERVICE_CLIENT = Symbol('UNIT_SERVICE_CLIENT');