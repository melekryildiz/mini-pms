import { Logger } from '@nestjs/common';
import type {
  ManagedTransaction,
  Result,
} from 'neo4j-driver';

import {
  Neo4jConstraintInitializer,
} from './neo4j-constraint.initializer.js';

import type {
  Neo4jModuleOptions,
  Neo4jTransactionWork,
} from './neo4j.interfaces.js';

import type {
  Neo4jService,
} from './neo4j.service.js';

/**
 * Initializer'ın kullandığı Neo4jService yüzeyi.
 * Gerçek veritabanına bağlanmadan başlangıç davranışını izole test ederiz.
 */
type MockNeo4jService = {
  verifyConnectivity: jest.MockedFunction<() => Promise<void>>;
  executeWrite: jest.MockedFunction<(
    work: Neo4jTransactionWork<void>,
  ) => Promise<void>>;
};

describe('Neo4jConstraintInitializer', () => {
  let neo4jService: MockNeo4jService;
  let transactionRun: jest.MockedFunction<
    (statement: string) => Promise<Result>
  >;

  /**
   * Testlerin gerçek konsoluna NestJS başlangıç logları yazılmasını önler.
   * Aynı spy'lar sayesinde güvenli ve sınırlı log davranışını da ölçebiliriz.
   */
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  function createOptions(
    overrides: Partial<Neo4jModuleOptions> = {},
  ): Neo4jModuleOptions {
    return {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      // Gerçek secret değildir; test hiçbir environment değeri okumaz.
      password: 'test-password',
      ...overrides,
    };
  }

  function createInitializer(
    options: Neo4jModuleOptions,
  ): Neo4jConstraintInitializer {
    return new Neo4jConstraintInitializer(
      neo4jService as unknown as Neo4jService,
      options,
    );
  }

  beforeEach(() => {
    transactionRun = jest.fn().mockResolvedValue(
      {} as Result,
    );

    const transaction = {
      run: transactionRun,
    } as unknown as ManagedTransaction;

    neo4jService = {
      verifyConnectivity: jest.fn().mockResolvedValue(undefined),

      /**
       * Gerçek Neo4jService.executeWrite gibi callback'i transaction ile
       * çalıştırır. Böylece constraint statement'ının transaction.run'a
       * ulaştığını da test edebiliriz.
       */
      executeWrite: jest.fn(
        async (
          work: Neo4jTransactionWork<void>,
        ): Promise<void> => work(transaction),
      ),
    };

    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('constraint yoksa bağlantıyı kontrol eder ve yazma çalıştırmaz', async () => {
    const initializer = createInitializer(createOptions());

    await initializer.onApplicationBootstrap();

    expect(neo4jService.verifyConnectivity).toHaveBeenCalledTimes(1);
    expect(neo4jService.executeWrite).not.toHaveBeenCalled();
    expect(transactionRun).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      'Neo4j connectivity and constraints are ready',
    );
  });

  it('constraintleri sırayla ve ayrı write işlemlerinde çalıştırır', async () => {
    const firstStatement = `
      CREATE CONSTRAINT unit_id_unique IF NOT EXISTS
      FOR (unit:Unit)
      REQUIRE unit.id IS UNIQUE
    `;

    const secondStatement = `
      CREATE CONSTRAINT device_id_unique IF NOT EXISTS
      FOR (device:Device)
      REQUIRE device.id IS UNIQUE
    `;

    const initializer = createInitializer(createOptions({
      constraints: [
        {
          name: 'unit_id_unique',
          statement: firstStatement,
        },
        {
          name: 'device_id_unique',
          statement: secondStatement,
        },
      ],
    }));

    await initializer.onApplicationBootstrap();

    expect(neo4jService.verifyConnectivity).toHaveBeenCalledTimes(1);
    expect(neo4jService.executeWrite).toHaveBeenCalledTimes(2);
    expect(transactionRun).toHaveBeenNthCalledWith(1, firstStatement);
    expect(transactionRun).toHaveBeenNthCalledWith(2, secondStatement);
  });

  it('geçici bağlantı hatasından sonra bekleyip yeniden dener', async () => {
    jest.useFakeTimers();

    neo4jService.verifyConnectivity
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    const initializer = createInitializer(createOptions({
      startupRetry: {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 500,
      },
    }));

    const initialization = initializer.onApplicationBootstrap();

    // Async timer ilerletme, ilk başarısız Promise zincirini ve ardından
    // planlanan 100ms retry timer'ını birlikte güvenilir biçimde tamamlar.
    await jest.advanceTimersByTimeAsync(100);
    await initialization;

    expect(neo4jService.verifyConnectivity).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      'Neo4j initialization failed; retrying ' +
      '(attempt 1/3, delay 100ms)',
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Neo4j connectivity and constraints are ready',
    );
  });

  it('exponential backoff uygular, üst sınıra uyar ve son denemede hata verir', async () => {
    jest.useFakeTimers();

    neo4jService.verifyConnectivity.mockRejectedValue(
      new Error('Neo4j unavailable'),
    );

    const initializer = createInitializer(createOptions({
      startupRetry: {
        maxAttempts: 4,
        initialDelayMs: 100,
        maxDelayMs: 250,
      },
    }));

    const initialization = initializer.onApplicationBootstrap();

    // Reject beklentisini timerları ilerletmeden kurarak unhandled rejection
    // oluşmasını engelleriz.
    const rejection = expect(initialization).rejects.toThrow(
      'Neo4j initialization failed after 4 attempts',
    );

    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(200);
    await jest.advanceTimersByTimeAsync(250);
    await rejection;

    expect(neo4jService.verifyConnectivity).toHaveBeenCalledTimes(4);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      'Neo4j initialization failed; retrying ' +
      '(attempt 1/4, delay 100ms)',
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      'Neo4j initialization failed; retrying ' +
      '(attempt 2/4, delay 200ms)',
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      3,
      'Neo4j initialization failed; retrying ' +
      '(attempt 3/4, delay 250ms)',
    );
  });

  it('IF NOT EXISTS içermeyen constrainti çalıştırmadan reddeder', async () => {
    const initializer = createInitializer(createOptions({
      constraints: [
        {
          name: 'unsafe_constraint',
          statement: `
            CREATE CONSTRAINT unsafe_constraint
            FOR (unit:Unit)
            REQUIRE unit.id IS UNIQUE
          `,
        },
      ],
      // Testte retry beklemeden gerçek nedeni kontrol ederiz.
      startupRetry: {
        maxAttempts: 1,
      },
    }));

    let receivedError: unknown;

    try {
      await initializer.onApplicationBootstrap();
    } catch (error: unknown) {
      receivedError = error;
    }

    expect(receivedError).toBeInstanceOf(Error);
    expect((receivedError as Error).message).toBe(
      'Neo4j initialization failed after 1 attempts',
    );
    expect((receivedError as Error).cause).toEqual(
      new Error(
        'Neo4j constraint "unsafe_constraint" must use IF NOT EXISTS',
      ),
    );
    expect(neo4jService.executeWrite).not.toHaveBeenCalled();
  });

  it.each([
    [
      'maxAttempts sıfır olduğunda',
      {
        maxAttempts: 0,
        initialDelayMs: 100,
        maxDelayMs: 500,
      },
      'Neo4j startupRetry.maxAttempts must be a positive integer',
    ],
    [
      'initialDelayMs negatif olduğunda',
      {
        maxAttempts: 2,
        initialDelayMs: -1,
        maxDelayMs: 500,
      },
      'Neo4j startupRetry.initialDelayMs cannot be negative',
    ],
    [
      'maxDelayMs ilk gecikmeden küçük olduğunda',
      {
        maxAttempts: 2,
        initialDelayMs: 500,
        maxDelayMs: 100,
      },
      'Neo4j startupRetry.maxDelayMs cannot be smaller than initialDelayMs',
    ],
  ])(
    'geçersiz retry ayarını sorgu çalıştırmadan reddeder: %s',
    async (_description, startupRetry, expectedMessage) => {
      const initializer = createInitializer(createOptions({
        startupRetry,
      }));

      await expect(
        initializer.onApplicationBootstrap(),
      ).rejects.toThrow(expectedMessage);

      expect(neo4jService.verifyConnectivity).not.toHaveBeenCalled();
      expect(neo4jService.executeWrite).not.toHaveBeenCalled();
    },
  );
});
