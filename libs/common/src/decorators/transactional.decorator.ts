import {
  BaseOrchestrator,
} from '../orchestrators/base.orchestrator.js';

/**
 * Transaction tamamlandıktan sonra çalıştırılacak orchestrator metodunun
 * adını belirtir.
 */
export interface TransactionalOptions {
  afterCommit?: string;
}


type TransactionalMethod = (
  this: BaseOrchestrator,
  ...args: unknown[]
) => Promise<unknown>;


export function Transactional(
  options: TransactionalOptions = {},
): MethodDecorator {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value as TransactionalMethod;

    if (typeof originalMethod !== 'function') {
      throw new TypeError(
        `@Transactional can only be used on methods: ${String(propertyKey)}`,
      );
    }

    descriptor.value = async function (
      this: BaseOrchestrator,
      ...args: unknown[]
    ): Promise<unknown> {
      /**
       * executeInTransaction Promise'i resolve olduğunda TypeORM transaction
       * callback'i tamamlanmış ve PostgreSQL commit edilmiş olur.
       */
      const result = await this.executeInTransaction(
        async (transactionManager) =>
          Reflect.apply(
            originalMethod,
            this,
            [
              ...args,
              transactionManager,
            ],
          ),
      );

      /**
       * Hook transaction Promise'inden sonra çalıştığı için artık PostgreSQL
       * commit tamamlanmıştır.
       */
      if (options.afterCommit) {
        /**
         * Hook adı decorator seçeneğinden geldiği için instance üzerindeki
         * metodu çalışma zamanında buluyoruz.
         */
        const instance = this as unknown as Record<string, unknown>;
        const afterCommitHook = instance[options.afterCommit];

        if (typeof afterCommitHook !== 'function') {
          throw new TypeError(
            `After-commit hook "${options.afterCommit}" was not found`,
          );
        }

        /**
         * Hook'a önce transaction sonucu, ardından public metoda gönderilen
         * orijinal argümanları aktarıyoruz.
         */
        await Reflect.apply(
          afterCommitHook,
          this,
          [
            result,
            ...args,
          ],
        );
      }

      return result;
    };

    return descriptor;
  };
}