import { Test, type TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';

import {
  REDIS_CLIENT,
} from './redis.constants.js';

import {
  createRedisClient,
} from './redis-client.factory.js';

import {
  RedisModule,
} from './redis.module.js';

import type {
  RedisModuleOptions,
} from './redis.interfaces.js';

/**
 * Bu testte gerçek Redis bağlantısı açmak istemiyoruz.
 *
 * RedisModule'ün createRedisClient fonksiyonunu kaç kere çağırdığını
 * doğrulamak istediğimiz için factory modülünü mockluyoruz.
 *
 * Jest bu çağrıyı dosyanın başına taşır. Böylece RedisModule import edilirken
 * gerçek factory yerine mock factory kullanılır.
 */
jest.mock('./redis-client.factory.js', () => ({
  createRedisClient: jest.fn(),
}));

/**
 * Gerçek Redis client'ın bu testlerde ihtiyacımız olan minimum davranışları.
 *
 * RedisService uygulama kapanırken status ve quit alanlarını kullanır.
 * Health servisi ise bu testte PING çağırmayacak fakat nesnenin Redis
 * biçimine yakın kalması için ping de eklenmiştir.
 */
type MockRedisClient = {
  status: string;
  ping: jest.MockedFunction<() => Promise<string>>;
  quit: jest.MockedFunction<() => Promise<'OK'>>;
};

describe('RedisModule', () => {
  let testingModule: TestingModule | undefined;
  let client: MockRedisClient;

  /**
   * jest.mocked, normal TypeScript fonksiyonunu Jest mock fonksiyonu olarak
   * tipli biçimde kullanmamızı sağlar.
   *
   * `as jest.Mock` gibi geniş ve kontrolsüz cast kullanmaktan daha güvenlidir.
   */
  const mockedCreateRedisClient =
    jest.mocked(createRedisClient);

  beforeEach(() => {
    jest.clearAllMocks();

    /**
     * Her testte yeni bir sahte client oluşturuyoruz.
     * Böylece quit çağrıları testler arasında taşınmaz.
     */
    client = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    /**
     * RedisModule factory çağırdığında gerçek ioredis bağlantısı yerine
     * bu sahte nesneyi döndürecek.
     */
    mockedCreateRedisClient.mockReturnValue(
      client as unknown as Redis,
    );
  });

  afterEach(async () => {
    /**
     * Test başarısız olsa bile oluşturulan NestJS container'ı kapatılır.
     *
     * Bu cleanup yapılmazsa lifecycle hook'ları veya açık handle'lar sonraki
     * testleri etkileyebilir.
     */
    if (testingModule) {
      await testingModule.close();
      testingModule = undefined;
    }
  });

  it('uygulama container içinde yalnızca bir Redis client oluşturur', async () => {
    const options: RedisModuleOptions = {
      options: {
        host: 'localhost',
        port: 6379,

        /**
         * Bu testte gerçek bağlantı kurulmayacak ama seçenek örneğinin
         * production kullanımına benzemesini istiyoruz.
         */
        lazyConnect: true,
      },
    };

    testingModule = await Test.createTestingModule({
      imports: [
        RedisModule.forRoot(options),
      ],
    }).compile();

    /**
     * Aynı DI token'ını container'dan iki kere istiyoruz.
     */
    const firstClient =
      testingModule.get<Redis>(REDIS_CLIENT);

    const secondClient =
      testingModule.get<Redis>(REDIS_CLIENT);

    /**
     * toBe referans eşitliğini kontrol eder.
     *
     * toEqual yalnızca nesnelerin içeriğini karşılaştırırdı. Burada aynı
     * nesne olduğunu kanıtlamak istediğimiz için toBe kullanıyoruz.
     */
    expect(firstClient).toBe(secondClient);

    /**
     * Factory yalnızca bir kere çağrılmış olmalıdır.
     *
     * İki kere çağrılsaydı provider singleton davranmıyor veya modül yanlış
     * yapılandırılmış demekti.
     */
    expect(mockedCreateRedisClient).toHaveBeenCalledTimes(1);

    expect(mockedCreateRedisClient).toHaveBeenCalledWith(
      options,
    );
  });

  it('module kapanırken Redis bağlantısını kapatır', async () => {
    testingModule = await Test.createTestingModule({
      imports: [
        RedisModule.forRoot({
          options: {
            lazyConnect: true,
          },
        }),
      ],
    }).compile();

    /**
     * TestingModule.close(), NestJS lifecycle hook'larını çalıştırır.
     *
     * RedisService.onApplicationShutdown() çağrılır ve ortak Redis client
     * üzerinde quit() çalışır.
     */
    await testingModule.close();
    testingModule = undefined;

    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('forRootAsync seçenek factorysini yalnızca bir kere çalıştırır', async () => {
    const asyncOptionsFactory = jest.fn(
      async (): Promise<RedisModuleOptions> => ({
        options: {
          host: 'localhost',
          port: 6379,
          lazyConnect: true,
        },
      }),
    );

    testingModule = await Test.createTestingModule({
      imports: [
        RedisModule.forRootAsync({
          useFactory: asyncOptionsFactory,
        }),
      ],
    }).compile();

    /**
     * Asenkron options factory bir kere çalışır.
     */
    expect(asyncOptionsFactory).toHaveBeenCalledTimes(1);

    /**
     * Options üretildikten sonra Redis client factory de yalnızca bir kere
     * çalışmalıdır.
     */
    expect(mockedCreateRedisClient).toHaveBeenCalledTimes(1);

    expect(mockedCreateRedisClient).toHaveBeenCalledWith({
      options: {
        host: 'localhost',
        port: 6379,
        lazyConnect: true,
      },
    });
  });
});