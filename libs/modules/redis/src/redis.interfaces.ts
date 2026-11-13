import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import type { RedisOptions } from 'ioredis';

export interface RedisModuleOptions {
  url?: string;
  options?: RedisOptions;
}

export type RedisModuleOptionsFactory = (
  ...dependencies: unknown[]
) => RedisModuleOptions | Promise<RedisModuleOptions>;

export interface RedisModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /**
   * useFactory fonksiyonuna aktarılacak dependency token'larıdır.
   */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;

  /**
   * Redis seçeneklerini üreten factory fonksiyonudur.
   */
  useFactory: RedisModuleOptionsFactory;
}