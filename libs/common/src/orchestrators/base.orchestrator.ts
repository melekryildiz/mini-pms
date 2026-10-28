import { EntityManager } from 'typeorm';

export abstract class BaseOrchestrator {
    constructor(
        protected readonly entityManager: EntityManager,
    ) {}
    public async executeInTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
    ): Promise<T> {
        return this.entityManager.transaction(async (transactionManager) => {
            return operation(transactionManager);
        });
       }
}