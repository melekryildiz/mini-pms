/**
 * NestJS dependency injection container içinde gerçek ioredis client'ını
 * temsil eden token'dır.
 * driver nesnesini containerdaki etiketi.
 * Symbol kullanmamızın nedeni, başka bir kütüphanenin aynı isimde provider
 * tanımlaması halinde oluşabilecek string çakışmalarını engellemektir.
 */
export const REDIS_CLIENT = Symbol('MINI_PMS_REDIS_CLIENT');

/**
 * RedisModule.forRoot veya forRootAsync ile verilen bağlantı seçeneklerini
 * NestJS container içerisinde taşımak için kullanılan özel token'dır.
 */
export const REDIS_MODULE_OPTIONS = Symbol('MINI_PMS_REDIS_MODULE_OPTIONS');