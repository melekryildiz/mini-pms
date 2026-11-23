import type { MeasurementEvent } from './measurement-event.types.js';

/**
 * Unit Service'in graftan bulup Ingestion'a vereceği sayaç özeti.
 * Redis'te ölçümü bulunmasa bile sayaç bu listede yer alır.
 */
export interface UnitSubtreeMeter {
  deviceId: string;
  serialNo: string;

  // Sayaç seçilen kökün altında başka bir birime bağlı olabilir.
  organizationUnitId: string;
  unitCode: string;
  unitName: string;
}

/**
 * Ekrana göndereceğimiz son ölçüm.
 *
 * Kafka mesajındaki alanları yeniden tanımlamıyoruz.
 * İhtiyaç duyduklarımızı Pick ile seçiyoruz.
 */
export type UnitInstantMeasurement = Pick<
  MeasurementEvent,
  | 'periodStart'
  | 'intervalMinutes'
  | 'activeImportKwh'
  | 'activeExportKwh'
  | 'inductiveKvarh'
  | 'capacitiveKvarh'
> & {
  /**
   * Ölçümün kapsadığı dönemin bitiş zamanı.
   * Örnek: periodStart 10:00 ise periodEnd 10:15.
   *
   * Verinin yaşını bu zamandan itibaren hesaplayacağız.
   */
  periodEnd: string;
};

/** Bir sayaç kartı için gereken bilgiler. */
export interface UnitInstantMeter extends UnitSubtreeMeter {
  // null: Redis'te bu sayaca ait son ölçüm bulunamadı.
  // Sıfır tüketim ile ölçüm bulunmamasını karıştırmıyoruz.
  measurement: UnitInstantMeasurement | null;
}

/** Anlık değer ucunun döndüreceği cevap. */
export interface GetUnitInstantValuesResponse {
  // Kullanıcının seçtiği kök birim.
  unitId: string;

  // Yanıtın sunucuda hazırlandığı zaman; ölçüm zamanı değildir.
  generatedAt: string;

  // Kök birimin kendisine ve alt birimlerine bağlı sayaçlar.
  meters: UnitInstantMeter[];
}