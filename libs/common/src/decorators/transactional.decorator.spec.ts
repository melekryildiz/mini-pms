import type {
  EntityManager,
} from 'typeorm';

import {
  BaseOrchestrator,
} from '../orchestrators/base.orchestrator.js';

import {
  Transactional,
} from './transactional.decorator.js';

type MockEntityManager = {
  transaction: jest.MockedFunction<(
    operation: (manager: EntityManager) => Promise<unknown>,
  ) => Promise<unknown>>;
};

describe('@Transactional', () => {
  let events: string[];
  let transactionManager: EntityManager;
  let entityManager: MockEntityManager;

  beforeEach(() => {
    events = [];
    transactionManager = {
      getRepository: jest.fn(),
    } as unknown as EntityManager;

    entityManager = {
      transaction: jest.fn(async (operation) => {
        events.push('transaction:start');

        const result = await operation(transactionManager);

        /**
         * Gerçek TypeORM transaction Promise'i callback başarılı olduktan
         * ve commit tamamlandıktan sonra resolve olur. Mock'taki bu event
         * commit sınırını temsil eder.
         */
        events.push('transaction:commit');

        return result;
      }),
    };
  });

  it('orijinal metoda transaction managerı son argüman olarak verir', async () => {
    class TestOrchestrator extends BaseOrchestrator {
      receivedManager: EntityManager | undefined;

      @Transactional()
      async execute(
        value: string,
        manager?: EntityManager,
      ): Promise<string> {
        this.receivedManager = manager;
        events.push('method');

        return value;
      }
    }

    const orchestrator = new TestOrchestrator(
      entityManager as unknown as EntityManager,
    );

    await expect(orchestrator.execute('result')).resolves.toBe('result');
    expect(orchestrator.receivedManager).toBe(transactionManager);
    expect(events).toEqual([
      'transaction:start',
      'method',
      'transaction:commit',
    ]);
  });

  it('afterCommit hookunu transaction commit edildikten sonra çalıştırır', async () => {
    class TestOrchestrator extends BaseOrchestrator {
      hookArguments: unknown[] = [];

      @Transactional({
        afterCommit: 'afterCommit',
      })
      async execute(
        id: string,
        manager?: EntityManager,
      ): Promise<{ id: string }> {
        expect(manager).toBe(transactionManager);
        events.push('method');

        return { id };
      }

      protected async afterCommit(
        result: { id: string },
        originalId: string,
      ): Promise<void> {
        events.push('hook');
        this.hookArguments = [result, originalId];
      }
    }

    const orchestrator = new TestOrchestrator(
      entityManager as unknown as EntityManager,
    );

    const result = await orchestrator.execute('unit-15');

    expect(result).toEqual({ id: 'unit-15' });
    expect(events).toEqual([
      'transaction:start',
      'method',
      'transaction:commit',
      'hook',
    ]);
    expect(orchestrator.hookArguments).toEqual([
      { id: 'unit-15' },
      'unit-15',
    ]);
  });

  it('transaction metodu hata atarsa afterCommit hookunu çalıştırmaz', async () => {
    class TestOrchestrator extends BaseOrchestrator {
      hookCalled = false;

      @Transactional({
        afterCommit: 'afterCommit',
      })
      async execute(): Promise<void> {
        events.push('method:error');
        throw new Error('Database write failed');
      }

      protected async afterCommit(): Promise<void> {
        this.hookCalled = true;
      }
    }

    const orchestrator = new TestOrchestrator(
      entityManager as unknown as EntityManager,
    );

    await expect(orchestrator.execute()).rejects.toThrow(
      'Database write failed',
    );

    expect(orchestrator.hookCalled).toBe(false);
    expect(events).toEqual([
      'transaction:start',
      'method:error',
    ]);
  });

  it('afterCommit metodu bulunamazsa açık hata verir', async () => {
    class TestOrchestrator extends BaseOrchestrator {
      @Transactional({
        afterCommit: 'missingHook',
      })
      async execute(): Promise<boolean> {
        return true;
      }
    }

    const orchestrator = new TestOrchestrator(
      entityManager as unknown as EntityManager,
    );

    await expect(orchestrator.execute()).rejects.toThrow(
      'After-commit hook "missingHook" was not found',
    );

    /**
     * Hook bulunamadığında hata commit sonrasında oluşur. Bu nedenle veri
     * tabanı işlemi artık rollback edilemez; hata mesajının açık olması
     * operasyonel teşhis için önemlidir.
     */
    expect(events).toEqual([
      'transaction:start',
      'transaction:commit',
    ]);
  });
});
