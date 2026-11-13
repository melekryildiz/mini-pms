import {
  Test,
  type TestingModule,
} from '@nestjs/testing';

import type {
  Driver,
  Session,
} from 'neo4j-driver';

import {
  NEO4J_DRIVER,
} from './neo4j.constants.js';

import {
  createNeo4jDriver,
} from './neo4j-driver.factory.js';

import {
  Neo4jHealthService,
} from './neo4j-health.service.js';

import type {
  Neo4jModuleOptions,
} from './neo4j.interfaces.js';

import {
  Neo4jModule,
} from './neo4j.module.js';

import {
  Neo4jService,
} from './neo4j.service.js';

/**
 * Modül testinde gerçek Bolt bağlantısı açmak istemiyoruz.
 * Factory'yi mocklayarak NestJS dependency injection ve singleton
 * davranışını altyapı servisinden bağımsız biçimde test ediyoruz.
 */
jest.mock('./neo4j-driver.factory.js', () => ({
  createNeo4jDriver: jest.fn(),
}));

/**
 * Neo4jService'in lifecycle sırasında kullanabileceği minimum Driver yüzeyi.
 * Session bu testlerde açılmaz; close ise module shutdown testinde izlenir.
 */
type MockNeo4jDriver = {
  session: jest.MockedFunction<() => Session>;
  verifyConnectivity: jest.MockedFunction<() => Promise<unknown>>;
  close: jest.MockedFunction<() => Promise<void>>;
};

describe('Neo4jModule', () => {
  let testingModule: TestingModule | undefined;
  let driver: MockNeo4jDriver;

  /**
   * Normal TypeScript fonksiyonunu tipli Jest mock'u olarak kullanırız.
   * Böylece factory çağrılarında options tip kontrolü korunur.
   */
  const mockedCreateNeo4jDriver =
    jest.mocked(createNeo4jDriver);

  beforeEach(() => {
    jest.clearAllMocks();

    driver = {
      session: jest.fn(),
      verifyConnectivity: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockedCreateNeo4jDriver.mockReturnValue(
      driver as unknown as Driver,
    );
  });

  afterEach(async () => {
    /**
     * Test başarısız olsa bile NestJS container'ını kapatırız.
     * Böylece lifecycle hook'ları testler arasında açık kalmaz.
     */
    if (testingModule) {
      await testingModule.close();
      testingModule = undefined;
    }
  });

  it('uygulama containerında yalnızca bir Neo4j Driver oluşturur', async () => {
    const options: Neo4jModuleOptions = {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      // Gerçek bağlantı kurulmadığı için yalnızca sahte test değeridir.
      password: 'test-password',
      database: 'neo4j',
    };

    testingModule = await Test.createTestingModule({
      imports: [
        Neo4jModule.forRoot(options),
      ],
    }).compile();

    // Aynı DI token'ını iki kere istediğimizde aynı referans gelmelidir.
    const firstDriver = testingModule.get<Driver>(NEO4J_DRIVER);
    const secondDriver = testingModule.get<Driver>(NEO4J_DRIVER);

    expect(firstDriver).toBe(secondDriver);
    expect(mockedCreateNeo4jDriver).toHaveBeenCalledTimes(1);
    expect(mockedCreateNeo4jDriver).toHaveBeenCalledWith(options);
  });

  it('Neo4jService ve Neo4jHealthService providerlarını dışarı sunar', async () => {
    testingModule = await Test.createTestingModule({
      imports: [
        Neo4jModule.forRoot({
          uri: 'bolt://localhost:7687',
          username: 'neo4j',
          password: 'test-password',
        }),
      ],
    }).compile();

    /**
     * get çağrıları başarısız olmadan gerçek sınıf instance'ı döndürüyorsa
     * provider'lar DynamicModule tarafından doğru tanımlanmış demektir.
     */
    expect(testingModule.get(Neo4jService)).toBeInstanceOf(
      Neo4jService,
    );

    expect(testingModule.get(Neo4jHealthService)).toBeInstanceOf(
      Neo4jHealthService,
    );
  });

  it('module kapanırken ortak Neo4j Driverı yalnızca bir kez kapatır', async () => {
    testingModule = await Test.createTestingModule({
      imports: [
        Neo4jModule.forRoot({
          uri: 'bolt://localhost:7687',
          username: 'neo4j',
          password: 'test-password',
        }),
      ],
    }).compile();

    await testingModule.close();
    testingModule = undefined;

    expect(driver.close).toHaveBeenCalledTimes(1);
  });

  it('forRootAsync options factorysini ve driver factorysini bir kez çalıştırır', async () => {
    const resolvedOptions: Neo4jModuleOptions = {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'test-password',
      database: 'neo4j',
    };

    const asyncOptionsFactory = jest.fn(
      async (): Promise<Neo4jModuleOptions> => resolvedOptions,
    );

    testingModule = await Test.createTestingModule({
      imports: [
        Neo4jModule.forRootAsync({
          useFactory: asyncOptionsFactory,
        }),
      ],
    }).compile();

    expect(asyncOptionsFactory).toHaveBeenCalledTimes(1);
    expect(mockedCreateNeo4jDriver).toHaveBeenCalledTimes(1);
    expect(mockedCreateNeo4jDriver).toHaveBeenCalledWith(
      resolvedOptions,
    );
  });
});
