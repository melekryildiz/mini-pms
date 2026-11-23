import { parseArgs } from 'node:util';

export type SingleRunMode =
  | 'normal'
  | 'high-inductive'
  | 'corrupt'
  | 'missing'
  | 'duplicate';

/**
 * Backfill başlangıç ve bitiş tarihleri de zorunludur.
 */
export type SimulationOptions =
  | {
      mode: SingleRunMode;
    }
  | {
      mode: 'backfill';
      from: Date;
      to: Date;
    };

const PERIOD_MS = 15 * 60 * 1000;

function isSingleRunMode(value: string): value is SingleRunMode {
  return (
    value === 'normal' ||
    value === 'high-inductive' ||
    value === 'corrupt' ||
    value === 'missing' ||
    value === 'duplicate'
  );
}

/** Saat dilimi açık, geçerli ve döneme hizalı tarih bekliyoruz. */
function parsePeriodDate(
  value: string | undefined,
  flag: string,
): Date {
  if (!value) {
    throw new Error(`${flag} gereklidir.`);
  }

  // Saat dilimi belirsiz tarihleri kabul etmiyoruz.
  // Örnek: 2026-11-15T00:00:00+03:00
  const isoWithTimezone =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

  if (!isoWithTimezone.test(value)) {
    throw new Error(
      `${flag}: saat dilimi içeren ISO-8601 tarih kullan.`,
    );
  }

  // JavaScript bazı geçersiz günleri sonraki aya taşıyabilir.
  // Örneğin 30 Şubat gibi girişleri ayrıca reddediyoruz.
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1]
  ) {
    throw new Error(`${flag}: geçersiz takvim tarihi.`);
  }

  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));

  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`${flag}: geçersiz saat.`);
  }

  const date = new Date(value);
  const time = date.getTime();

  if (!Number.isFinite(time)) {
    throw new Error(`${flag}: geçersiz tarih.`);
  }

  // Generator ile aynı dönem sınırlarını kullanıyoruz.
  if (time % PERIOD_MS !== 0) {
    throw new Error(
      `${flag}: tarih 15 dakikalık dönem sınırına hizalanmalı.`,
    );
  }

  return date;
}

export function readSimulationOptions(): SimulationOptions {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,

    // --from ve --to artık tanınan seçenekler.
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
    },
  });

  if (positionals.length > 1) {
    throw new Error('Yalnızca bir çalışma modu seçebilirsin.');
  }

  const mode = positionals[0] ?? 'normal';

  if (mode === 'backfill') {
    const from = parsePeriodDate(values.from, '--from');
    const to = parsePeriodDate(values.to, '--to');

    if (from.getTime() >= to.getTime()) {
      throw new Error('--from, --to tarihinden önce olmalı.');
    }

    // Aralık [from, to) olacak.
    // Bitiş sınırı gelecekteyse tamamlanmamış dönemler oluşur.
    if (to.getTime() > Date.now()) {
      throw new Error('--to gelecekte olamaz.');
    }

    return { mode, from, to };
  }

  if (!isSingleRunMode(mode)) {
    throw new Error(
      'Geçerli modlar: normal, high-inductive, corrupt, missing, duplicate, backfill',
    );
  }

  if (values.from !== undefined || values.to !== undefined) {
    throw new Error(
      '--from ve --to yalnızca backfill modunda kullanılabilir.',
    );
  }

  return { mode };
}