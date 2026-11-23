/**
 * Simülatörün Unit Service'ten alacağı sayaç bilgisidir.
 * Buna projection/özet model denir: tüketiciye yalnızca ihtiyacı olan alanlar
 * gönderilir.
 */
export interface SimulationDevice {
  /** Cihaz metadata.simulationProfile alanından gelir; varsayılan tüketici. */
  simulationProfile?: 'consumer' | 'solar';
  /**
   * DeviceEntity'nin PostgreSQL kimliğidir.
   *
   * Kafka partition key olarak kullanılacaktır.
   */
  id: string;

  /**
   * Sayacın saha seri numarasıdır.
   */
  serialNo: string;

  /**
   * Sayacın bağlı olduğu birimin kimliğidir.
   */
  organizationUnitId: string;
}
