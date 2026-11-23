import { validateMeasurement } from './measurement-validator';

// Testler çalıştırıldığı gün ve saatten bağımsız olmalı.
const NOW = Date.parse('2026-11-18T10:30:00.000Z');

function createMessage() {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    deviceId: '3',
    serialNo: 'METER-003',
    organizationUnitId: '1',
    periodStart: '2026-11-18T10:00:00.000Z',
    intervalMinutes: 15,
    producedAt: '2026-11-18T10:15:00.000Z',
    source: 'simulator',
    simulationMode: 'normal',
    activeImportKwh: 10,
    activeExportKwh: 0,
    inductiveKvarh: 2,
    capacitiveKvarh: 0.5,
  };
}

describe('validateMeasurement', () => {
  it('geçerli ölçümü kabul eder', () => {
    const message = createMessage();
    expect(validateMeasurement(JSON.stringify(message), '3', NOW)).toEqual({
      valid: true,
      data: message,
    });
  });

  it.each([null, '', '{bozuk', 'null', '[]', '42', '"text"'])(
    'boş, bozuk veya nesne olmayan mesajı reddeder: %s',
    (raw) => {
      const result = validateMeasurement(raw, '3', NOW);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason.length).toBeGreaterThan(0);
    },
  );

  it.each([null, '', '99'])('uyuşmayan Kafka key değerini reddeder: %s', (key) => {
    expect(validateMeasurement(JSON.stringify(createMessage()), key, NOW)).toEqual({
      valid: false,
      reason: 'Kafka key ile deviceId eşleşmiyor.',
    });
  });

  it('corrupt modunun negatif enerjisini hata nedeni ile reddeder', () => {
    const message = {
      ...createMessage(),
      simulationMode: 'corrupt',
      activeImportKwh: -10,
    };
    expect(validateMeasurement(JSON.stringify(message), '3', NOW)).toEqual({
      valid: false,
      reason: 'Enerji değerleri sonlu ve negatif olmayan sayılar olmalı.',
    });
  });

  it.each([
    'activeImportKwh', 'activeExportKwh', 'inductiveKvarh', 'capacitiveKvarh',
  ])('geçersiz enerji değerlerini reddeder: %s', (field) => {
    for (const value of [-1, '10', null, undefined, true]) {
      const message = { ...createMessage(), [field]: value };
      expect(validateMeasurement(JSON.stringify(message), '3', NOW).valid).toBe(false);
    }
    // JSON'da geçerli bir sayı literal'i olsa da JS'te Infinity'ye dönüşür.
    const raw = JSON.stringify({ ...createMessage(), [field]: '__overflow__' })
      .replace('"__overflow__"', '1e999');
    expect(validateMeasurement(raw, '3', NOW).valid).toBe(false);
  });

  it('sıfır enerjileri ve üretim enerjisini kabul eder', () => {
    const message = { ...createMessage(), activeImportKwh: 0,
      activeExportKwh: 5, inductiveKvarh: 0, capacitiveKvarh: 0 };
    expect(validateMeasurement(JSON.stringify(message), '3', NOW).valid).toBe(true);
  });

  it.each([
    { schemaVersion: 2 }, { eventId: 'invalid' }, { serialNo: '   ' },
    { source: 'unknown' }, { simulationMode: 'unknown' }, { intervalMinutes: 30 },
    { deviceId: '0' }, { organizationUnitId: '-1' },
    { organizationUnitId: '9223372036854775808' },
  ])('geçersiz sözleşme alanını reddeder: %j', (patch) => {
    expect(validateMeasurement(JSON.stringify({ ...createMessage(), ...patch }), '3', NOW).valid)
      .toBe(false);
  });

  it('PostgreSQL BIGINT sınırındaki kimliği kayıpsız kabul eder', () => {
    const message = { ...createMessage(), deviceId: '9223372036854775807' };
    const result = validateMeasurement(JSON.stringify(message), message.deviceId, NOW);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.deviceId).toBe(message.deviceId);
  });

  it.each([
    { periodStart: '2026-02-30T10:00:00.000Z' },
    { producedAt: '2026-02-30T10:00:00.000Z' },
    { periodStart: '2026-11-18T10:01:00.000Z' },
    { periodStart: '2026-11-18T10:00:00' },
    { periodStart: '2026-11-18T10:30:00.000Z', producedAt: '2026-11-18T10:45:00.000Z' },
    { producedAt: '2026-11-18T10:14:59.999Z' },
  ])('geçersiz tarih veya dönem ilişkisini reddeder: %j', (patch) => {
    expect(validateMeasurement(JSON.stringify({ ...createMessage(), ...patch }), '3', NOW).valid)
      .toBe(false);
  });

  it('tam bitiş anında dönemi kabul eder', () => {
    const message = createMessage();
    expect(validateMeasurement(JSON.stringify(message), '3', Date.parse(message.producedAt)).valid)
      .toBe(true);
  });

  it('geçerli backfill mesajını kabul eder', () => {
    const message = { ...createMessage(), simulationMode: 'backfill',
      periodStart: '2026-11-01T10:00:00.000Z' };
    expect(validateMeasurement(JSON.stringify(message), '3', NOW).valid).toBe(true);
  });

  it('mesajdaki fazladan alanları kayıt verisine taşımaz', () => {
    const message = createMessage();
    expect(validateMeasurement(JSON.stringify({ ...message, extra: 'ignored' }), '3', NOW))
      .toEqual({ valid: true, data: message });
  });
});
