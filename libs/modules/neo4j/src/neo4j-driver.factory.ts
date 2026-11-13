import {
  auth,
  driver,
  type Config as Neo4jDriverConfig,
  type Driver,
} from 'neo4j-driver';

import type {
  Neo4jModuleOptions,
} from './neo4j.interfaces.js';

/**
 * Uygulama başına tek Neo4j Driver oluşturur.
 *
 * Driver:
 * - Bağlantı havuzunu yönetir.
 * - Bağlantı koptuğunda yeni bağlantı kurabilir.
 * - Read/write transaction retry mekanizmasını yönetir.
 *
 * Bu fonksiyon session açmaz. Session'lar sorgu başına Neo4jService
 * tarafından açılacak.
 */
export function createNeo4jDriver(
  moduleOptions: Neo4jModuleOptions,
): Driver {
  /**
   * Varsayılan driver ayarları.
   *
   * Bu değerler health veya HTTP isteğinin bağlantı problemi nedeniyle
   * sonsuza kadar beklemesini engeller.
   */
  const defaultConfig: Neo4jDriverConfig = {
    /**
     * Yeni bir TCP/Bolt bağlantısı için en fazla 10 saniye beklenir.
     */
    connectionTimeout: 10_000,

    /**
     * Havuzdan bağlantı alınması için en fazla 15 saniye beklenir.
     */
    connectionAcquisitionTimeout: 15_000,

    /**
     * Geçici transaction hatalarında driver'ın toplam retry süresi.
     *
     * Örneğin Neo4j kısa süreli yeniden başlatılıyorsa write transaction
     * kontrollü şekilde tekrar denenebilir.
     */
    maxTransactionRetryTime: 15_000,

    /**
     * Bir service process'inin aynı anda kullanabileceği azami Bolt bağlantısı.
     *
     * Driver ihtiyaç oldukça bağlantı açar; başlarken 50 bağlantı oluşturmaz.
     */
    maxConnectionPoolSize: 50,
  };

  /**
   * Uygulamanın verdiği ayarlar varsayılanların üzerine yazılabilir.
   *
   * Test veya production ortamı farklı timeout/pool ayarı seçebilir.
   */
  const driverConfig: Neo4jDriverConfig = {
    ...defaultConfig,
    ...moduleOptions.driverConfig,
  };

  /**
   * auth.basic kullanıcı adı ve parolayı Neo4j AuthToken'a dönüştürür.
   *
   * Parolayı driver oluşturulduktan sonra saklayan başka bir değişken
   * oluşturmuyor veya loglamıyoruz.
   */
  const authToken = auth.basic(
    moduleOptions.username,
    moduleOptions.password,
  );

  return driver(
    moduleOptions.uri,
    authToken,
    driverConfig,
  );
}