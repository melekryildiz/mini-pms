import { Injectable } from '@nestjs/common';

import type { MeasurementEvent } from '@mini-pms/contracts';

import { MeasurementDlqService } from './measurement-dlq.service.js';
import type {
  DlqInput,
  MeasurementErrorCode,
  MeasurementMessage,
} from './measurement-dlq.service.js';

import { MeasurementLatestService } from './measurement-latest.service.js';
import { MeasurementStoreService } from './measurement-store.service.js';
import { validateMeasurement } from './measurement-validator.js';

export type MeasurementResult =
  | {
      status: 'inserted' | 'duplicate';
      measurement: MeasurementEvent;
    }
  | {
      status: 'sent-to-dlq';
      code: MeasurementErrorCode;
      reason: string;
    };

@Injectable()
export class MeasurementOrchestrator {
  constructor(
    private readonly storeService: MeasurementStoreService,
    private readonly dlqService: MeasurementDlqService,
    private readonly latestService: MeasurementLatestService,
  ) {}

  async process(message: MeasurementMessage): Promise<MeasurementResult> {
    // 1. Mesajın içeriğini doğrula.raw, key, kaynak topic ...
    const validation = validateMeasurement(message.raw, message.key);

    if (!validation.valid) {
      // Geçersiz mesaj veritabanına ve Redis'e ulaşmaz.
      return this.sendToDlq(message, 'INVALID_MEASUREMENT', validation.reason);
    }

    const measurement = validation.data;

    // 2. Kaydet; yeni kayıt, duplicate veya conflict sonucunu al.
    const result = await this.storeService.store(measurement);

    if (result.status === 'rejected') {
      // Veritabanının reddettiği ölçüm Redis'e ulaşmaz.
      return this.sendToDlq(message, 'MEASUREMENT_REJECTED', result.reason);
    }

    if (result.status === 'conflict') {
      // Eski kaydı değiştirmeden gelen mesajı DLQ'ya gönder.
      return this.sendToDlq(message, 'MEASUREMENT_CONFLICT', result.reason);
    }

    // 3. Yeni kayıt ve duplicate için son değeri kontrol et.
    // Aynı veya eski dönem Redis'teki değeri değiştirmez.
    const normalized = result.measurement ?? measurement;
    await this.latestService.updateIfNewer(normalized);

    return {
      status: result.status,
      measurement: normalized,
    };
  }

  private async sendToDlq(
    message: MeasurementMessage,
    code: MeasurementErrorCode,
    reason: string,
  ): Promise<MeasurementResult> {
    // Kafka gönderimi onaylanmadan başarılı sonuç dönmez.
    await this.dlqService.publish({
      message,
      code,
      reason,
    });

    return {
      status: 'sent-to-dlq',
      code,
      reason,
    };
  }

  async processBatch(
    messages: MeasurementMessage[],
  ): Promise<MeasurementResult[]> {
    // Her orijinal mesajın sonucunu kendi sıra numarasıyla tutuyoruz.
    const results = new Map<number, MeasurementResult>();
    const accepted: MeasurementEvent[] = [];
    const rejected: Array<{ index: number; input: DlqInput }> = [];

    // Geçerli mesajların hem ölçümünü hem kaynak bilgisini koruyoruz.
    const valid: Array<{
      index: number;
      message: MeasurementMessage;
      measurement: MeasurementEvent;
    }> = [];

    // 1. Bütün mesajları doğrula.
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];

      const validation = validateMeasurement(message.raw, message.key);

      if (!validation.valid) {
        rejected.push({
          index,
          input: {
            message,
            code: 'INVALID_MEASUREMENT',
            reason: validation.reason,
          },
        });
        continue;
      }

      valid.push({
        index,
        message,
        measurement: validation.data,
      });
    }

    // 2. Geçerli ölçümleri birlikte veritabanına gönder.
    if (valid.length > 0) {
      const stored = await this.storeService.storeBatch(
        valid.map((item) => item.measurement),
      );

      // Her geçerli ölçümün bir sonucu olmalı.
      if (stored.length !== valid.length) {
        throw new Error('Toplu kayıt sonuç sayısı ölçüm sayısıyla eşleşmiyor.');
      }

      // 3. Kayıt sonuçlarına göre DLQ veya Redis adımına geç.
      for (let position = 0; position < valid.length; position += 1) {
        const item = valid[position];
        const result = stored[position];

        if (result.status === 'rejected' || result.status === 'conflict') {
          rejected.push({
            index: item.index,
            input: {
              message: item.message,
              code:
                result.status === 'conflict'
                  ? 'MEASUREMENT_CONFLICT'
                  : 'MEASUREMENT_REJECTED',
              reason: result.reason,
            },
          });
          continue;
        }

        // Şimdilik listeye al; bütün sonuçlar değerlendirildikten sonra gönder.
        const normalized = result.measurement ?? item.measurement;
        accepted.push(normalized);

        results.set(item.index, {
          status: result.status,
          measurement: normalized,
        });
      }
    }
    // Hatalı mesajlar tek Kafka isteğinde, her birinin kendi kaynağı/nedeniyle gider.
    await this.dlqService.publishMany(rejected.map((item) => item.input));
    for (const { index, input } of rejected) {
      results.set(index, {
        status: 'sent-to-dlq',
        code: input.code,
        reason: input.reason,
      });
    }

    // Bütün kabul edilen ölçümlerin son değer adımını birlikte tamamla.
    // Hata olursa sonuç dönmez; consumer offset'i ilerletmeyecek.
    await this.latestService.updateManyIfNewer(accepted);

    // Doğrulamada elenenlerle kayıt sonuçlarını orijinal sırada birleştir.
    return messages.map((_, index) => {
      const result = results.get(index);

      if (!result) {
        throw new Error(`Mesajın işlem sonucu bulunamadı: ${index}`);
      }

      return result;
    });
  }
}
