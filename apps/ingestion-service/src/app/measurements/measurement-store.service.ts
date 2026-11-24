import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import type { MeasurementEvent } from '@mini-pms/contracts';

import { IntervalEntity } from './entities/interval.entity.js';
import { MEASUREMENT_BATCH_SIZE } from './measurement.constants.js';

/** Consumer'ın hangi adımı izleyeceğini belirleyen sonuç. */
export type StoreResult =
  | { status: 'inserted'; measurement?: MeasurementEvent }
  | { status: 'duplicate'; measurement?: MeasurementEvent }
  | {
      status: 'conflict';
      reason: string;
    }
  | {
      status: 'rejected';
      reason: string;
    };
/** INSERT gerçekten hangi cihaz/dönemleri ekler */
interface InsertedInterval {
  device_id: string;
  period_start: Date;
}

/** Her gelen ölçümün veritabanındaki enerjiyle karşılaştırılması
 * Buradaki ordinal, ölçümün gruptaki sıra numarası.
 *  Sonuçları aynı sırayla orchestrator’a döndürmemizi sağlayacak.
 */
interface StoredEnergies {
  active_import_kwh?: string;
  active_export_kwh?: string;
  inductive_kvarh?: string;
  capacitive_kvarh?: string;
}
interface ComparedInterval extends StoredEnergies {
  ordinal: number;
  same_values: boolean;
}

@Injectable()
export class MeasurementStoreService {
  constructor(
    @InjectRepository(IntervalEntity)
    private readonly repository: Repository<IntervalEntity>,
  ) {}

  /**
   * Buraya doğrulaması tamamlanmış ölçüm gelecek.
   */
  private async persist(event: MeasurementEvent): Promise<StoreResult> {
    // Parametreler SQL metnine birleştirilmez.
    // $1, $2 gibi yer tutucularla veritabanına gönderilir.
    const parameters = [
      event.deviceId,
      event.periodStart,
      String(event.activeImportKwh),
      String(event.activeExportKwh),
      String(event.inductiveKvarh),
      String(event.capacitiveKvarh),
    ];

    const inserted = await this.repository.query<
      Array<{ id: string } & StoredEnergies>
    >(
      `
        WITH factor AS (
          SELECT COALESCE((SELECT multiplier FROM mini_pms.device WHERE id = $1), 1) AS value
        )
        INSERT INTO mini_pms.interval (
          device_id, period_start, active_import_kwh, active_export_kwh,
          inductive_kvarh, capacitive_kvarh, multiplier_applied
        )
        SELECT $1, $2, $3::numeric * value, $4::numeric * value,
          $5::numeric * value, $6::numeric * value, value FROM factor
        ON CONFLICT (device_id, period_start) DO NOTHING
        RETURNING id, active_import_kwh, active_export_kwh, inductive_kvarh, capacitive_kvarh
      `,
      parameters,
    );

    // RETURNING yalnızca gerçekten eklenen kaydı döndürür.
    if (inserted.length > 0) {
      return { status: 'inserted', ...this.normalized(event, inserted[0]) };
    }

    // Aynı cihaz/dönem zaten var.
    // Enerjileri PostgreSQL NUMERIC karşılaştırmasıyla kontrol ediyoruz.
    const existing = await this.repository.query<
      Array<{ same_values: boolean } & StoredEnergies>
    >(
      `
        SELECT (
          active_import_kwh = $3::numeric * multiplier_applied
          AND active_export_kwh = $4::numeric * multiplier_applied
          AND inductive_kvarh = $5::numeric * multiplier_applied
          AND capacitive_kvarh = $6::numeric * multiplier_applied
        ) AS same_values, active_import_kwh, active_export_kwh, inductive_kvarh, capacitive_kvarh

        FROM mini_pms.interval
        WHERE device_id = $1
          AND period_start = $2
      `,
      parameters,
    );

    // Örneğin kayıt iki sorgu arasında silinmiş olabilir.
    // Bu durumu veri çakışması sayıp DLQ'ya göndermiyoruz.
    if (existing.length === 0) {
      throw new Error(
        'Çakışan ölçüm kaydı bulunamadı; işlem tekrar denenmeli.',
      );
    }

    if (existing[0].same_values) {
      return { status: 'duplicate', ...this.normalized(event, existing[0]) };
    }

    return {
      status: 'conflict',
      reason: 'Aynı cihaz ve dönem için farklı enerji değerleri geldi.',
    };
  }

  async store(event: MeasurementEvent): Promise<StoreResult> {
    try {
      return await this.persist(event);
    } catch (error: unknown) {
      if (error instanceof QueryFailedError) {
        const details: unknown = error.driverError;

        if (details !== null && typeof details === 'object') {
          const databaseError = details as Record<string, unknown>;

          // Yalnızca tanıdığımız constraint'i sınıflandırıyoruz.
          if (
            databaseError.code === '23503' &&
            databaseError.constraint === 'fk_interval_device'
          ) {
            return {
              status: 'rejected',
              reason: 'Ölçümün ait olduğu cihaz veritabanında bulunamadı.',
            };
          }

          if (
            databaseError.code === '23514' &&
            databaseError.constraint === 'chk_interval_values'
          ) {
            return {
              status: 'rejected',
              reason: 'Enerji değerleri veritabanı kontrolünü geçemedi.',
            };
          }
        }
      }

      // Tanımadığımız hatayı bozuk veri saymıyoruz.
      // Consumer offset'i ilerletmeden tekrar deneyecek.
      throw error;
    }
  }
  /**
   * Doğrulanmış ölçümleri küçük bir grup olarak kaydeder.
   * Dönen sonuçların sırası, gelen ölçümlerin sırasıyla aynıdır.
   */
  async storeBatch(measurements: MeasurementEvent[]): Promise<StoreResult[]> {
    if (measurements.length === 0) {
      return [];
    }

    if (measurements.length > MEASUREMENT_BATCH_SIZE) {
      throw new Error('Ölçüm grubu ayarlanan batch boyutunu aşıyor.');
    }

    // Tek eleman için mevcut kayıt ve hata yönetimini kullan.
    if (measurements.length === 1) {
      return [await this.store(measurements[0])];
    }

    const parameters: Array<string | number> = [];

    const valueRows = measurements.map((measurement, ordinal) => {
      const start = parameters.length;

      parameters.push(
        ordinal,
        measurement.deviceId,
        measurement.periodStart,
        String(measurement.activeImportKwh),
        String(measurement.activeExportKwh),
        String(measurement.inductiveKvarh),
        String(measurement.capacitiveKvarh),
      );

      // SQL metnine yalnızca bizim ürettiğimiz parametre numaraları girer.
      // Mesaj değerleri parameters dizisinde ayrı taşınır.
      return `(
      $${start + 1}::integer,
      $${start + 2}::bigint,
      $${start + 3}::timestamptz,
      $${start + 4}::numeric,
      $${start + 5}::numeric,
      $${start + 6}::numeric,
      $${start + 7}::numeric
    )`;
    });

    // Aynı giriş listesini INSERT ve karşılaştırma sorgusunda kullanacağız.
    const inputSql = `
    WITH input (
      ordinal,
      device_id,
      period_start,
      active_import_kwh,
      active_export_kwh,
      inductive_kvarh,
      capacitive_kvarh
    ) AS (
      VALUES ${valueRows.join(',')}
    )
  `;

    try {
      return await this.repository.manager.transaction(
        'READ COMMITTED',
        async (manager): Promise<StoreResult[]> => {
          const inserted = await manager.query<InsertedInterval[]>(
            `
            ${inputSql}

            INSERT INTO mini_pms.interval (
              device_id, period_start, active_import_kwh, active_export_kwh,
              inductive_kvarh, capacitive_kvarh, multiplier_applied
            )
            SELECT DISTINCT ON (input.device_id, input.period_start)
              input.device_id, input.period_start,
              input.active_import_kwh * COALESCE(device.multiplier, 1),
              input.active_export_kwh * COALESCE(device.multiplier, 1),
              input.inductive_kvarh * COALESCE(device.multiplier, 1),
              input.capacitive_kvarh * COALESCE(device.multiplier, 1),
              COALESCE(device.multiplier, 1)
            FROM input
            LEFT JOIN mini_pms.device AS device ON device.id = input.device_id
            ORDER BY input.device_id, input.period_start, input.ordinal
            ON CONFLICT (device_id, period_start) DO NOTHING
            RETURNING device_id, period_start
          `,
            parameters,
          );

          // Her gelen ölçümü, artık veritabanında bulunan kayıtla karşılaştır.
          // Duplicate/conflict için ölçüm başına ayrı SELECT yapmıyoruz.
          const compared = await manager.query<ComparedInterval[]>(
            `
            ${inputSql}

            SELECT
              input.ordinal,
              (
                stored.active_import_kwh = input.active_import_kwh * stored.multiplier_applied
                AND stored.active_export_kwh = input.active_export_kwh * stored.multiplier_applied
                AND stored.inductive_kvarh = input.inductive_kvarh * stored.multiplier_applied
                AND stored.capacitive_kvarh = input.capacitive_kvarh * stored.multiplier_applied
              ) AS same_values, stored.active_import_kwh, stored.active_export_kwh, stored.inductive_kvarh, stored.capacitive_kvarh

            FROM input
            JOIN mini_pms.interval AS stored
              ON stored.device_id = input.device_id
              AND stored.period_start = input.period_start

            ORDER BY input.ordinal
          `,
            parameters,
          );

          // Beklenen kayıtlardan biri eksikse başarılı sayma.
          // Transaction rollback olur, consumer daha sonra tekrar deneyebilir.
          if (compared.length !== measurements.length) {
            throw new Error(
              'Toplu kayıt sonuçları eksik; işlem tekrar denenmeli.',
            );
          }

          const insertedKeys = new Set(
            inserted.map(
              (row) => `${row.device_id}:${row.period_start.toISOString()}`,
            ),
          );

          const comparisons = new Map(
            compared.map((row) => [row.ordinal, row.same_values]),
          );

          const seenKeys = new Set<string>();

          return measurements.map((measurement, ordinal): StoreResult => {
            const key =
              `${measurement.deviceId}:` +
              new Date(measurement.periodStart).toISOString();

            const firstOccurrence = !seenKeys.has(key);
            seenKeys.add(key);

            if (!comparisons.has(ordinal)) {
              throw new Error('Ölçüm karşılaştırma sonucu bulunamadı.');
            }

            if (!comparisons.get(ordinal)) {
              return {
                status: 'conflict',
                reason:
                  'Aynı cihaz ve dönem için farklı enerji değerleri geldi.',
              };
            }

            // Yeni eklenen anahtarın yalnızca ilk mesajı inserted olur.
            if (insertedKeys.has(key) && firstOccurrence) {
              return {
                status: 'inserted',
                ...this.normalized(measurement, compared[ordinal]),
              };
            }

            return {
              status: 'duplicate',
              ...this.normalized(measurement, compared[ordinal]),
            };
          });
        },
      );
    } catch (error: unknown) {
      if (this.isKnownDataError(error)) {
        // Tek hatalı cihaz/ölçüm bütün grubu engellemesin.
        // Başarısız transaction burada zaten rollback olmuştur.
        const middle = Math.floor(measurements.length / 2);

        // Sırayı koruyarak iki küçük grupta tekrar deniyoruz.
        const left = await this.storeBatch(measurements.slice(0, middle));

        const right = await this.storeBatch(measurements.slice(middle));

        return [...left, ...right];
      }

      // Bağlantı, timeout veya tanımadığımız hatalarda parçalamıyoruz.
      // Hata consumer'a gider; offset ilerlemez.
      throw error;
    }
  }
  /** Enerjiler SQL NUMERIC ile çarpılır. Redis'e de DB'deki aynı değerler gider. */
  private normalized(
    event: MeasurementEvent,
    stored: StoredEnergies,
  ): { measurement?: MeasurementEvent } {
    if (stored.active_import_kwh === undefined) return {};
    const measurement = {
      ...event,
      activeImportKwh: Number(stored.active_import_kwh),
      activeExportKwh: Number(stored.active_export_kwh),
      inductiveKvarh: Number(stored.inductive_kvarh),
      capacitiveKvarh: Number(stored.capacitive_kvarh),
    };
    if (
      ![
        measurement.activeImportKwh,
        measurement.activeExportKwh,
        measurement.inductiveKvarh,
        measurement.capacitiveKvarh,
      ].every(Number.isFinite)
    ) {
      throw new Error('Çarpan uygulanmış enerji sonlu bir sayı olmalı.');
    }
    return { measurement };
  }
  private isKnownDataError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const details: unknown = error.driverError;

    if (details === null || typeof details !== 'object') {
      return false;
    }

    const databaseError = details as Record<string, unknown>;

    return (
      (databaseError.code === '23503' &&
        databaseError.constraint === 'fk_interval_device') ||
      (databaseError.code === '23514' &&
        databaseError.constraint === 'chk_interval_values')
    );
  }
}
