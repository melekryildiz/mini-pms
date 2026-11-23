/**
 * NestJS Dependency Injection içinde Unit Service RabbitMQ client'ını
 * tanımlamak için kullanılan benzersiz provider token'ı.
 */
export const UNIT_SERVICE_CLIENT = Symbol('UNIT_SERVICE_CLIENT');
/** Ham 15 dakikalık enerji ölçümlerinin gönderileceği topic. */
export const MEASUREMENT_RAW_TOPIC = 'mpms.measurement.raw';