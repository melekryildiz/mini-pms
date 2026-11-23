/** Simülatörün desteklediği senaryolar. */
export type SimulationMode =
  | 'normal'
  | 'high-inductive'
  | 'missing'
  | 'corrupt'
  | 'duplicate'
  | 'backfill';

export type MeasurementSource = 'simulator';

/**
 * Bir sayacın tamamlanmış 15 dakikalık dönemine ait enerjiler.
 *
 * Değerler kümülatif sayaç endeksi değildir.
 * Yalnızca ilgili dönemde oluşan enerji miktarlarıdır.
 */
export interface MeasurementEvent {
  /**
   * Mesajı takip etmek için kullanılır.
   * Duplicate modunda tekrar gönderilirken aynı kalır.
   *
   * Veritabanındaki mantıksal benzersizlik ise
   * (device_id, period_start) ile sağlanır.
   */
  eventId: string;

  /** Mesaj formatının sürümü. */
  schemaVersion: 1;

  /** Unit Service'teki cihaz kimliği; Kafka key'i de bu olacak. */
  deviceId: string;

  /** Sayaç ve bağlı birim bilgileri. */
  serialNo: string;
  organizationUnitId: string;


  periodStart: string;

  /** Bu sözleşmede bütün dönemler 15 dakikadır. */
  intervalMinutes: 15;

  /**
   * Mesajın hazırlandığı zaman.
   * Backfill'de periodStart geçmişte, producedAt güncel olur.
   */
  producedAt: string;

  source: MeasurementSource;
  simulationMode: SimulationMode;

  /** Dönemde şebekeden çekilen aktif enerji — kWh. */
  activeImportKwh: number;

  /** Dönemde şebekeye verilen aktif enerji — kWh. */
  activeExportKwh: number;

  /** Dönemde çekilen endüktif reaktif enerji — kVArh. */
  inductiveKvarh: number;

  /** Dönemde oluşan kapasitif reaktif enerji — kVArh. */
  capacitiveKvarh: number;
}
