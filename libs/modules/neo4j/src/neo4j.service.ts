import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
} from '@nestjs/common';

import type {
  Driver,
  Session,
} from 'neo4j-driver';

import {
  NEO4J_DRIVER,
  NEO4J_MODULE_OPTIONS,
} from './neo4j.constants.js';

import type {
  Neo4jModuleOptions,
  Neo4jTransactionWork,
} from './neo4j.interfaces.js';

/**
 * Neo4j sorgularının ortak ve güvenli giriş noktasıdır.
 *
 * Uygulama servisleri doğrudan driver.session() çağırmak yerine
 * executeRead ve executeWrite yardımcılarını kullanmalıdır.
 *
 * Bunun temel amacı session kapatma sorumluluğunu tek yerde toplamaktır.
 */
@Injectable()
export class Neo4jService implements OnApplicationShutdown {
  /**
   * NestJS shutdown hook'u birden fazla kez tetiklense bile driver.close()
   * çağrısını yalnızca bir kez yapmak için kullandığımız durum bilgisi.
   */
  private driverClosed = false;

  constructor(
    /**
     * Uygulama başına tek Neo4j Driver instance'ı.
     *
     * Bu driver bağlantı havuzunu ve retry davranışını yönetir.
     */
    @Inject(NEO4J_DRIVER)
    private readonly driver: Driver,

    /**
     * Session açarken kullanılacak varsayılan database bilgisi için
     * module seçeneklerini de inject ediyoruz.
     */
    @Inject(NEO4J_MODULE_OPTIONS)
    private readonly options: Neo4jModuleOptions,
  ) {}

  /**
   * Salt-okunur bir Neo4j transaction çalıştırır.
   *
   * Örnek işlemler:
   * - MATCH
   * - RETURN
   * - Topoloji sorgulama
   * - Bağlantı/path bulma
   */
  async executeRead<T>(
    work: Neo4jTransactionWork<T>,
  ): Promise<T> {
    /**
     * Her mantıksal işlem için yeni session açılır.
     *
     * Session hafiftir; gerçek Bolt bağlantısını driver'ın bağlantı
     * havuzundan alır.
     */
    const session = this.createSession();

    try {
      /**
       * executeRead driver'a bu transaction'ın veri değiştirmeyeceğini söyler.
       *
       * Cluster ortamında okuma sorgusu read replica'ya yönlendirilebilir.
       * Geçici bağlantı/leader değişimi hatalarında driver kontrollü retry
       * uygulayabilir.
       */
      return await session.executeRead(work);
    } finally {
      /**
       * Callback başarılı olsa da hata atsa da session kapanır.
       *
       * F2-T1 kabul kriterindeki session sızıntısını engelleyen temel satır
       * burasıdır.
       */
      await session.close();
    }
  }

  /**
   * Veri değiştiren bir Neo4j transaction çalıştırır.
   *
   */
  async executeWrite<T>(
    work: Neo4jTransactionWork<T>,
  ): Promise<T> {
    const session = this.createSession();

    try {
      /**
       * executeWrite driver'a transaction'ın yazma yetkisi gerektirdiğini
       * bildirir.
       *
       * Cluster ortamında write leader'a yönlendirilir.
       */
      return await session.executeWrite(work);
    } finally {
      /**
       * Write başarısız olsa bile session bağlantısı havuza geri bırakılır.
       */
      await session.close();
    }
  }

  /**
   * Neo4j driver'ın server'a gerçekten ulaşabildiğini doğrular.
   *
   * Bu metot daha sonra Neo4jHealthService tarafından kullanılacak.
   */
  async verifyConnectivity(): Promise<void> {
    /**
     * verifyConnectivity server bilgisi döndürebilir fakat health endpoint'te
     * adres veya sürüm bilgisi yayınlamak istemiyoruz.
     */
    await this.driver.verifyConnectivity();
  }

  /**
   * Yeni ve kısa ömürlü bir session oluşturur.
   */
  private createSession(): Session {
    /**
     * Database açıkça verilmişse session o database üzerinde açılır.
     *
     * Database verilmediyse boş bir config göndermek yerine driver'ın
     * kullanıcının varsayılan database'ini seçmesine izin veriyoruz.
     */
    if (this.options.database) {
      return this.driver.session({
        database: this.options.database,
      });
    }

    return this.driver.session();
  }

  /**
   * NestJS uygulaması kontrollü biçimde kapanırken driver'ı kapatır.
   *
   * Driver kapatılınca:
   * - Bağlantı havuzu kapanır.
   * - Açık Bolt bağlantıları serbest bırakılır.
   * - Node.js process'inin açık handle nedeniyle beklemesi önlenir.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.driverClosed) {
      return;
    }

    /**
     * close() hata atsa bile ikinci shutdown çağrısında tekrar kapatmaya
     * çalışmamak için durumu çağrıdan önce değiştiriyoruz.
     */
    this.driverClosed = true;

    await this.driver.close();
  }
}