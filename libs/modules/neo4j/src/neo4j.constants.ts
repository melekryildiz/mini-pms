/**
 * NestJS dependency injection container içerisindeki tek Neo4j Driver
 * instance'ını temsil eder.
 * driver nesnesini containerdaki etiketi.
 * String yerine Symbol kullanmamız başka bir modülün aynı provider ismini
 * kullanması halinde oluşabilecek çakışmaları engeller.
 */
export const NEO4J_DRIVER = Symbol('MINI_PMS_NEO4J_DRIVER');

/**
 * Neo4jModule.forRoot veya forRootAsync üzerinden verilen bağlantı
 * seçeneklerini NestJS container içerisinde taşır.
 */
export const NEO4J_MODULE_OPTIONS = Symbol(
  'MINI_PMS_NEO4J_MODULE_OPTIONS',
);