import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnApplicationShutdown,
} from '@nestjs/common';

import type { ClientProxy } from '@nestjs/microservices';

import { UNIT_SERVICE_CLIENT } from './measurement.constants.js';

import type { MeasurementEvent,
  GetUnitInstantValuesResponse,
  UnitSubtreeMeter,
  UnitInstantMeasurement,
} from '@mini-pms/contracts';
import { RedisService } from '@mini-pms/redis';

import { firstValueFrom, timeout } from 'rxjs';

import { validateMeasurement } from './measurement-validator.js';

/**
 * Karşılaştırma ve yazma Redis'te tek işlem olarak çalışır.
 * İki mesaj aynı anda gelse bile eski dönem yeninin üzerine yazılmaz.
 */
const UPDATE_LATEST = `
  local current = redis.call('HGET', KEYS[1], 'periodStartMs')
  local incoming = tonumber(ARGV[1])

  if current and tonumber(current) >= incoming then
    return 0
  end

  redis.call(
    'HSET',
    KEYS[1],
    'periodStartMs', ARGV[1],
    'measurement', ARGV[2]
  )

  return 1
`;

@Injectable()
export class MeasurementLatestService implements OnApplicationShutdown {
  constructor(
    private readonly redisService: RedisService,
    @Inject(UNIT_SERVICE_CLIENT)
    private readonly unitClient: ClientProxy,
  ) {}

  /** Uygulama kapanırken Unit Service RPC bağlantısını kapatır. */
  async onApplicationShutdown(): Promise<void> {
    await this.unitClient.close();
  }

  /** true: güncellendi, false: aynı veya daha eski dönem geldi. */
  async updateIfNewer(measurement: MeasurementEvent): Promise<boolean> {
    const key = `mpms:measurement:latest:${measurement.deviceId}`;

    const result = await this.redisService.getClient().eval(
      UPDATE_LATEST,
      1, // Script'in kullanacağı key sayısı.
      key,
      String(Date.parse(measurement.periodStart)),
      JSON.stringify(measurement),
    );

    if (result !== 0 && result !== 1) {
      throw new Error('Redis güncellemesi beklenmeyen sonuç döndürdü.');
    }
    return result === 1;
  }
  /**
   * Her sayaç için gruptaki en yeni ölçümü seçer.
   * Redis komutlarını pipeline ile birlikte gönderir.
   *
   * Dönen sayı: gerçekten güncellenen sayaç sayısı.
   */
  async updateManyIfNewer(measurements: MeasurementEvent[]): Promise<number> {
    if (measurements.length === 0) {
      return 0;
    }

    const latestByDevice = new Map<string, MeasurementEvent>();

    for (const measurement of measurements) {
      const current = latestByDevice.get(measurement.deviceId);

      if (
        !current ||
        Date.parse(measurement.periodStart) > Date.parse(current.periodStart)
      ) {
        latestByDevice.set(measurement.deviceId, measurement);
      }
    }

    const pipeline = this.redisService.getClient().pipeline();

    for (const measurement of latestByDevice.values()) {
      const key = `mpms:measurement:latest:${measurement.deviceId}`;

      // Mevcut atomik tarih kontrolümüzü koruyoruz.
      pipeline.eval(
        UPDATE_LATEST,
        1,
        key,
        String(Date.parse(measurement.periodStart)),
        JSON.stringify(measurement),
      );
    }

    // Yukarıdaki komutları birlikte gönder.
    const results = await pipeline.exec();

    if (results === null || results.length !== latestByDevice.size) {
      throw new Error('Redis pipeline sonuçları eksik.');
    }

    let updated = 0;

    for (const [error, result] of results) {
      // Pipeline tamamlanmış olsa da içindeki bir komut hata verebilir.
      if (error) {
        throw error;
      }

      if (result !== 0 && result !== 1) {
        throw new Error('Redis güncellemesi beklenmeyen sonuç döndürdü.');
      }

      if (result === 1) {
        updated += 1;
      }
    }

    return updated;
  }

  async getUnitInstantValues(
    unitId: string,
  ): Promise<GetUnitInstantValuesResponse> {
    // 1. Bu birimin kendisine ve alt birimlerine bağlı sayaçları al.
    const meters = await firstValueFrom(
      this.unitClient
        .send<UnitSubtreeMeter[]>(
          'unit.getSubtreeMeters',
          { unitId },
        )
        .pipe(timeout(5_000)),
    );

    // Sayaç yoksa Redis'e gereksiz istek gönderme.
    if (meters.length === 0) {
      return {
        unitId,
        generatedAt: new Date().toISOString(),
        meters: [],
      };
    }

    // 2. Her sayaç için okuma komutunu hazırla.
    const pipeline = this.redisService.getClient().pipeline();

    for (const meter of meters) {
      pipeline.hgetall(
        `mpms:measurement:latest:${meter.deviceId}`,
      );
    }

    // 100 sayaç olsa da her komutu ayrı ayrı await etmiyoruz.
    // Hazırlanan bütün okumaları birlikte gönderiyoruz.
    const responses = await pipeline.exec();

    if (
      responses === null ||
      responses.length !== meters.length
    ) {
      throw new ServiceUnavailableException(
        'Redis ölçüm sonuçları eksik.',
      );
    }

    // 3. Pipeline sonuçlarının sırası, komutların eklenme sırasıdır.
    const values = meters.map((meter, index) => {
      const [error, hash] = responses[index];

      // Redis hatasını "bu sayaçta veri yok" diye göstermiyoruz.
      if (error) {
        throw new ServiceUnavailableException(
          'Son ölçümler Redis üzerinden okunamadı.',
        );
      }

      return {
        ...meter,
        measurement: this.readInstantMeasurement(
          hash,
          meter.deviceId,
        ),
      };
    });

    return {
      unitId,
      generatedAt: new Date().toISOString(),
      meters: values,
    };
  }

  private readInstantMeasurement(
    value: unknown,
    deviceId: string,
  ): UnitInstantMeasurement | null {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new ServiceUnavailableException(
        'Redis ölçüm kaydı beklenen biçimde değil.',
      );
    }

    const hash = value as Record<string, unknown>;

    // HGETALL, bulunmayan key için boş nesne döndürür.
    // Sayaç listede kalır; yalnızca ölçümü null olur.
    if (Object.keys(hash).length === 0) {
      return null;
    }

    if (typeof hash.measurement !== 'string') {
      throw new ServiceUnavailableException(
        'Redis kaydında ölçüm içeriği bulunamadı.',
      );
    }

    // Cache içeriğine de doğrudan güvenmiyoruz.
    // Mevcut ölçüm doğrulamasını tekrar kullanıyoruz.
    const validation = validateMeasurement(
      hash.measurement,
      deviceId,
    );

    if (!validation.valid) {
      throw new ServiceUnavailableException(
        'Redis içindeki son ölçüm geçersiz.',
      );
    }

    const measurement = validation.data;
    const periodStartMs = Date.parse(measurement.periodStart);

    // Hash'teki sıralama zamanı ile ölçümün zamanı tutarlı olmalı.
    if (hash.periodStartMs !== String(periodStartMs)) {
      throw new ServiceUnavailableException(
        'Redis ölçüm zamanı tutarsız.',
      );
    }

    return {
      periodStart: measurement.periodStart,
      intervalMinutes: measurement.intervalMinutes,

      periodEnd: new Date(
        periodStartMs + measurement.intervalMinutes * 60_000,
      ).toISOString(),

      activeImportKwh: measurement.activeImportKwh,
      activeExportKwh: measurement.activeExportKwh,
      inductiveKvarh: measurement.inductiveKvarh,
      capacitiveKvarh: measurement.capacitiveKvarh,
    };
  }
}
