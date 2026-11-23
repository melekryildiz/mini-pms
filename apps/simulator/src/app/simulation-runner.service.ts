import { Injectable, Logger } from '@nestjs/common';

import { MeterCatalogService } from './meter-catalog.service.js';
import { MeasurementProducerService } from './measurement-producer.service.js';
import type { SingleRunMode } from './simulation-options.js';

import {
  generateMeasurement,
  getLastCompletedPeriodStart,
} from './measurement-generator.js';
import { setTimeout as sleep } from 'node:timers/promises';

@Injectable()
export class SimulationRunnerService {
  private readonly logger = new Logger(SimulationRunnerService.name);

  constructor(
    private readonly meterCatalog: MeterCatalogService,
    private readonly producer: MeasurementProducerService,
  ) {}

  /** Seçilen modda her aktif sayaç için tek dönem gönderir. */
  async runOnce(
    mode: SingleRunMode,
    periodStart: Date = getLastCompletedPeriodStart(),
  ): Promise<void> {
    const meters = await this.meterCatalog.getActiveMeters();

    if (meters.length === 0) {
      this.logger.warn('Aktif sayaç bulunamadı; mesaj gönderilmedi.');
      return;
    }

    let sent = 0;
    let skipped = 0;

    for (const meter of meters) {
      // Missing: yaklaşık %10 olasılıkla bu sayacın dönemini atla.
      // Eksik ölçüm için sıfır veya null değerli mesaj üretmiyoruz.
      if (mode === 'missing' && Math.random() < 0.1) {
        skipped += 1;
        continue;
      }

      // Generator yalnızca enerji mesajını hazırlar.
      const event = generateMeasurement(meter, periodStart, mode);

      // Gönderim başarısız olursa hata bootstrap() çağrısına taşınır.
      await this.producer.publish(event);
      sent += 1;

      if (mode === 'duplicate') {
        // Aynı nesneyi tekrar gönder: eventId, zamanlar ve enerjiler aynı.

        await this.producer.publish(event);
        sent += 1;
      }
    }

    this.logger.log(
      `${sent} mesaj gönderildi, ${skipped} ölçüm atlandı. Mod: ${mode}. Dönem: ${periodStart.toISOString()}`,
    );
  }
  /**
   * Her tamamlanan dönemi sırayla gönderir.
   * Backfill bu döngüyü kullanmaz.
   */
  async runLive(mode: SingleRunMode, signal: AbortSignal): Promise<void> {
    const periodMs = 15 * 60 * 1000;

    // Başlangıçta son tamamlanan dönemden başlıyoruz.
    let nextPeriodMs = getLastCompletedPeriodStart().getTime();

    while (!signal.aborted) {
      const latestCompletedMs = getLastCompletedPeriodStart().getTime();

      if (nextPeriodMs <= latestCompletedMs) {
        // Bekleme veya gönderim uzarsa aradaki dönemleri atlamıyoruz.
        await this.runOnce(mode, new Date(nextPeriodMs));

        nextPeriodMs += periodMs;
        continue;
      }

      // Sıradaki dönemin tamamlanacağı zaman
      const waitMs = Math.max(1, nextPeriodMs + periodMs - Date.now());

      try {
        // Ctrl+C gelirse 15 dakika dolmasını beklemeden uyanır.
        await sleep(waitMs, undefined, { signal });
      } catch (error: unknown) {
        // Kapanış nedeniyle kesilen bekleme beklenen davranıştır.
        if (!signal.aborted) throw error;
      }
    }
  }

  async runBackfill(from: Date, to: Date, signal: AbortSignal): Promise<void> {
    const periodMs = 15 * 60 * 1000;
    const fromMs = from.getTime();
    const toMs = to.getTime();

    // geçersiz aralıkla çalışmasını engelliyoruz.
    if (
      !Number.isFinite(fromMs) ||
      !Number.isFinite(toMs) ||
      fromMs >= toMs ||
      fromMs % periodMs !== 0 ||
      toMs % periodMs !== 0 ||
      toMs > Date.now()
    ) {
      throw new Error(
        'Backfill aralığı geçerli, 15 dakikaya hizalı ve tamamlanmış olmalı.',
      );
    }

    // Her dönem için tekrar RPC yapmak yerine listeyi bir kez alıyoruz.
    const meters = await this.meterCatalog.getActiveMeters();

    if (meters.length === 0) {
      this.logger.warn('Aktif sayaç bulunamadı; backfill yapılmadı.');
      return;
    }

    let sent = 0;

    // Ölçümün ait olduğu zamanı 15 dakika ilerletiyoruz.
    for (let time = fromMs; time < toMs && !signal.aborted; time += periodMs) {
      const periodStart = new Date(time);

      for (const meter of meters) {
        // Devam eden gönderim biter; kapanışta yeni gönderim başlatılmaz.
        if (signal.aborted) break;

        const event = generateMeasurement(meter, periodStart, 'backfill');

        await this.producer.publish(event);
        sent += 1;
      }
    }

    const status = signal.aborted
      ? 'Backfill durduruldu'
      : 'Backfill tamamlandı';

    this.logger.log(
      `${status}. ${sent} mesaj gönderildi. ` +
        `İstenen aralık: [${from.toISOString()}, ${to.toISOString()})`,
    );
  }
}
