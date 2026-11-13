import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';

import type {
    ManagedTransaction,
  Config as Neo4jDriverConfig,
} from 'neo4j-driver';
/**
 * Uygulama açılırken oluşturulacak tek bir Neo4j constraint'ini tanımlar.
 */
export interface Neo4jConstraintDefinition {
  /**
   * Log ve hata mesajlarında constraint'i güvenli biçimde tanımlayan isim.
  
   */
  name: string;

  /**
   * Çalıştırılacak idempotent Cypher komutu.
   */
  statement: string;
}

/**
 * Uygulama başlangıcındaki bağlantı ve constraint retry davranışı.
 */
export interface Neo4jStartupRetryOptions {
  /**
   * İlk deneme dahil toplam deneme sayısı.
   */
  maxAttempts?: number;

  /**
   * İlk başarısız denemeden sonra beklenecek süre.
   */
  initialDelayMs?: number;

  /**
   * Exponential backoff büyürken aşılmayacak üst sınır.
   */
  maxDelayMs?: number;
}

/**
 * Neo4j bağlantısı için gerekli ayarları tanımlar.
 *
 * Parola veya URI hiçbir zaman loglanmamalıdır.
 */
export interface Neo4jModuleOptions {
  /**
   * Neo4j Bolt bağlantı adresidir.
   *
   * Yerel geliştirme örneği:
   * bolt://localhost:7687
   *
   * neo4j:// protokolü cluster/routing desteği için kullanılabilir.
   */
  uri: string;

  /**
   * Neo4j kullanıcı adı.
   */
  username: string;

  /**
   * Neo4j parolası.
   *
   * Bu değer yalnızca driver oluşturulurken kullanılmalı;
   * response veya loglara eklenmemelidir.
   */
  password: string;

  /**
   * Session açılırken kullanılacak varsayılan database adıdır.
   *
   * Belirtilmezse Neo4j server kullanıcının varsayılan database'ini seçer.
   * Yerel geliştirmede genellikle "neo4j" değeridir.
   */
  database?: string;

  /**
   * Neo4j driver'ın bağlantı havuzu, timeout ve retry gibi gelişmiş
   * seçeneklerini değiştirmek için kullanılır.
   */
  driverConfig?: Neo4jDriverConfig;
    /**
   * Uygulama açılırken oluşturulacak constraint listesi.
   *
   * Boş bırakılırsa bağlantı kontrol edilir fakat constraint çalıştırılmaz.
   */
  constraints?: readonly Neo4jConstraintDefinition[];

  /**
   * Başlangıç bağlantısı ve constraint oluşturma retry ayarları.
   */
  startupRetry?: Neo4jStartupRetryOptions;
}

/**
 * Environment veya ConfigService üzerinden asenkron Neo4j ayarı üretir.
 */
export type Neo4jModuleOptionsFactory = (
  ...dependencies: unknown[]
) => Neo4jModuleOptions | Promise<Neo4jModuleOptions>;

/**
 * Neo4jModule.forRootAsync metodunun kabul edeceği seçenekler.
 */
export interface Neo4jModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /**
   * useFactory fonksiyonuna aktarılacak NestJS dependency token'ları.
   */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;

  /**
   * Neo4j bağlantı seçeneklerini üreten factory.
   */
  useFactory: Neo4jModuleOptionsFactory;
}
/**
 * executeRead ve executeWrite içine verilecek işlem fonksiyonunun tipidir.
 *
 * Callback'e Neo4j ManagedTransaction verilir. Callback bu transaction
 * üzerinden bir veya birden fazla Cypher sorgusu çalıştırabilir.
 */
export type Neo4jTransactionWork<T> = (
  transaction: ManagedTransaction,
) => Promise<T>;