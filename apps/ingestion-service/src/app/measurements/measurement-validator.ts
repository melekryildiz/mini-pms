import type {
  MeasurementEvent,
  SimulationMode,
} from '@mini-pms/contracts';

export type ValidationResult =
  | { valid: true; data: MeasurementEvent }
  | { valid: false; reason: string };

const PERIOD_MS = 15 * 60 * 1000;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

/** PostgreSQL BIGINT kolonuna sığan pozitif kimlik. */
function isId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= MAX_BIGINT
  );
}

/** NaN, Infinity, negatif değer ve sayısal metinleri reddeder. */
function isEnergy(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isMode(value: unknown): value is SimulationMode {
  return (
    value === 'normal' ||
    value === 'high-inductive' ||
    value === 'missing' ||
    value === 'corrupt' ||
    value === 'duplicate' ||
    value === 'backfill'
  );
}

/**
 * Simulator tarihleri toISOString() ile bu biçimde gönderiyor:
 * 2026-11-18T10:00:00.000Z
 *
 * İlk sürümde bu UTC biçimini bekliyoruz.
 */
function isUtcDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }

  const date = new Date(value);

  // Geri çevirerek 30 Şubat gibi normalize edilen tarihleri de reddeder.
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString() === value
  );
}

export function validateMeasurement(
  raw: string | null,
  key: string | null,
  nowMs: number = Date.now(),
): ValidationResult {
  if (raw === null) {
    return { valid: false, reason: 'Mesaj içeriği boş.' };
  }

  let parsed: unknown;

  try {

    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: 'Mesaj geçerli JSON değil.' };
  }

  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    return { valid: false, reason: 'Mesaj bir JSON nesnesi olmalı.' };
  }

  const body = parsed as Record<string, unknown>;

  if (body.schemaVersion !== 1) {
    return { valid: false, reason: 'Desteklenmeyen schemaVersion.' };
  }

  // Simulator eventId için randomUUID() kullanıyor.
  if (
    typeof body.eventId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.eventId,
    )
  ) {
    return { valid: false, reason: 'eventId geçerli bir UUID v4 olmalı.' };
  }

  if (!isId(body.deviceId) || !isId(body.organizationUnitId)) {
    return {
      valid: false,
      reason: 'Cihaz ve birim kimlikleri pozitif BIGINT olmalı.',
    };
  }

  if (key !== body.deviceId) {
    return {
      valid: false,
      reason: 'Kafka key ile deviceId eşleşmiyor.',
    };
  }

  if (
    typeof body.serialNo !== 'string' ||
    body.serialNo.trim().length === 0
  ) {
    return { valid: false, reason: 'serialNo boş olamaz.' };
  }

  if (body.source !== 'simulator' || !isMode(body.simulationMode)) {
    return {
      valid: false,
      reason: 'Mesaj kaynağı veya simülasyon modu geçersiz.',
    };
  }

  if (body.intervalMinutes !== 15) {
    return { valid: false, reason: 'Ölçüm dönemi 15 dakika olmalı.' };
  }

  if (!isUtcDate(body.periodStart) || !isUtcDate(body.producedAt)) {
    return {
      valid: false,
      reason: 'Tarihler milisaniye içeren UTC ISO biçiminde olmalı.',
    };
  }

  const periodStartMs = Date.parse(body.periodStart);
  const periodEndMs = periodStartMs + PERIOD_MS;
  const producedAtMs = Date.parse(body.producedAt);

  if (periodStartMs % PERIOD_MS !== 0) {
    return {
      valid: false,
      reason: 'periodStart 15 dakika sınırına hizalanmalı.',
    };
  }

  if (periodEndMs > nowMs || producedAtMs < periodEndMs) {
    return {
      valid: false,
      reason: 'Ölçüm, ait olduğu dönem tamamlandıktan sonra üretilmeli.',
    };
  }

  if (
    !isEnergy(body.activeImportKwh) ||
    !isEnergy(body.activeExportKwh) ||
    !isEnergy(body.inductiveKvarh) ||
    !isEnergy(body.capacitiveKvarh)
  ) {
    return {
      valid: false,
      reason: 'Enerji değerleri sonlu ve negatif olmayan sayılar olmalı.',
    };
  }

  // Kontrollerden geçen alanlarla güvenilir nesneyi oluşturuyoruz.
  return {
    valid: true,
    data: {
      eventId: body.eventId,
      schemaVersion: body.schemaVersion,
      deviceId: body.deviceId,
      serialNo: body.serialNo,
      organizationUnitId: body.organizationUnitId,
      periodStart: body.periodStart,
      intervalMinutes: body.intervalMinutes,
      producedAt: body.producedAt,
      source: body.source,
      simulationMode: body.simulationMode,
      activeImportKwh: body.activeImportKwh,
      activeExportKwh: body.activeExportKwh,
      inductiveKvarh: body.inductiveKvarh,
      capacitiveKvarh: body.capacitiveKvarh,
    },
  };
}