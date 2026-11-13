import type {
  Driver,
  ManagedTransaction,
  Session,
  SessionConfig,
} from 'neo4j-driver';

import type {
  Neo4jModuleOptions,
  Neo4jTransactionWork,
} from './neo4j.interfaces.js';

import { Neo4jService } from './neo4j.service.js';

/**
 * Gerçek Neo4j Driver'ın yalnızca servisimizin kullandığı küçük yüzeyi.
 * Böylece test gerçek sunucuya veya parolaya ihtiyaç duymaz.
 */
type MockNeo4jDriver = {
  session: jest.MockedFunction<(config?: SessionConfig) => Session>;
  verifyConnectivity: jest.MockedFunction<() => Promise<unknown>>;
  close: jest.MockedFunction<() => Promise<void>>;
};

describe('Neo4jService', () => {
  let driver: MockNeo4jDriver;
  let options: Neo4jModuleOptions;
  let service: Neo4jService;

  // Test anında kapanmamış session sayısını tutar.
  let openSessionCount: number;

  // Her sorgunun yeni session açtığını ölçmek için toplam sayıyı tutar.
  let createdSessionCount: number;

  /**
   * Gerçek bağlantı açmadan, Session'ın testte ihtiyacımız olan davranışlarını
   * taklit eder. executeRead/executeWrite callback'i çalıştırır; close ise
   * açık session sayacını azaltır.
   */
  function createMockSession(): Session {
    openSessionCount += 1;
    createdSessionCount += 1;

    // Aynı session iki kez kapatılırsa sayacı iki kez azaltmayız.
    let closed = false;

    // Bu testlerde transaction.run kullanılmadığı için boş transaction yeterli.
    const transaction = {} as ManagedTransaction;

    const session = {
      executeRead: jest.fn(
        async <T>(work: Neo4jTransactionWork<T>): Promise<T> =>
          work(transaction),
      ),

      executeWrite: jest.fn(
        async <T>(work: Neo4jTransactionWork<T>): Promise<T> =>
          work(transaction),
      ),

      close: jest.fn(async (): Promise<void> => {
        if (closed) {
          return;
        }

        closed = true;
        openSessionCount -= 1;
      }),
    };

    // Eksik Driver alanlarını taklit etmeye gerek olmadığı için test sınırında
    // gerçek Session tipine dönüştürüyoruz.
    return session as unknown as Session;
  }

  beforeEach(() => {
    openSessionCount = 0;
    createdSessionCount = 0;

    options = {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      // Gerçek secret değildir ve hiçbir gerçek yapılandırmadan okunmaz.
      password: 'test-password',
      database: 'neo4j',
    };

    driver = {
      // Her çağrı için farklı session üretiriz.
      session: jest.fn(
        (): Session => createMockSession(),
      ),
      verifyConnectivity: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue(undefined),
    };

    service = new Neo4jService(
      driver as unknown as Driver,
      options,
    );
  });

  afterEach(() => {
    // F2-T1 kabul kriteri: her test sonunda açık session sayısı sıfırdır.
    expect(openSessionCount).toBe(0);
  });

  it('okuma işlemini yeni session içinde çalıştırır ve sonucu döndürür', async () => {
    const result = await service.executeRead(async () => ({
      id: 'unit-1',
      name: 'Main Unit',
    }));

    expect(result).toEqual({
      id: 'unit-1',
      name: 'Main Unit',
    });
    expect(driver.session).toHaveBeenCalledTimes(1);
    expect(createdSessionCount).toBe(1);
  });

  it('okuma callbacki hata atsa bile sessionı kapatır', async () => {
    const queryError = new Error('Read query failed');

    await expect(
      service.executeRead(async () => {
        throw queryError;
      }),
    ).rejects.toBe(queryError);

    expect(openSessionCount).toBe(0);
  });

  it('yazma işlemini yeni session içinde çalıştırır ve sonucu döndürür', async () => {
    const result = await service.executeWrite(async () => ({
      created: true,
    }));

    expect(result).toEqual({ created: true });
    expect(driver.session).toHaveBeenCalledTimes(1);
    expect(createdSessionCount).toBe(1);
  });

  it('yazma callbacki hata atsa bile sessionı kapatır', async () => {
    const queryError = new Error('Write query failed');

    await expect(
      service.executeWrite(async () => {
        throw queryError;
      }),
    ).rejects.toBe(queryError);

    expect(openSessionCount).toBe(0);
  });

  it('her sorgu için ayrı session oluşturur', async () => {
    await service.executeRead(async () => 'first-query');
    await service.executeRead(async () => 'second-query');

    // Driver aynı kalır ancak iki mantıksal işlem iki session kullanır.
    expect(driver.session).toHaveBeenCalledTimes(2);
    expect(createdSessionCount).toBe(2);
    expect(openSessionCount).toBe(0);
  });

  it('yapılandırılmış database adını session oluştururken kullanır', async () => {
    await service.executeRead(async () => 'result');

    expect(driver.session).toHaveBeenCalledWith({
      database: 'neo4j',
    });
  });

  it('database belirtilmediyse driver varsayılanıyla session açar', async () => {
    const serviceWithoutDatabase = new Neo4jService(
      driver as unknown as Driver,
      {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'test-password',
      },
    );

    await serviceWithoutDatabase.executeRead(async () => 'result');

    // Parametresiz session(), kullanıcının varsayılan database'ini seçer.
    expect(driver.session).toHaveBeenCalledWith();
  });

  it('bağlantı kontrolünü driver üzerinden gerçekleştirir', async () => {
    await service.verifyConnectivity();

    expect(driver.verifyConnectivity).toHaveBeenCalledTimes(1);
  });

  it('uygulama kapanırken driverı yalnızca bir kez kapatır', async () => {
    await service.onApplicationShutdown();
    await service.onApplicationShutdown();

    expect(driver.close).toHaveBeenCalledTimes(1);
  });
});
