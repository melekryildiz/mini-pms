import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';

import {
  NEO4J_MODULE_OPTIONS,
} from './neo4j.constants.js';

import type {
  Neo4jConstraintDefinition,
  Neo4jModuleOptions,
  Neo4jStartupRetryOptions,
} from './neo4j.interfaces.js';

import {
  Neo4jService,
} from './neo4j.service.js';

/**
 * Varsayılan başlangıç retry değerleri.
 *
 * Bunları sabit tutmamız hem davranışı görünür yapar hem de yanlışlıkla
 * sonsuz retry döngüsü oluşturulmasını engeller.
 */
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 8_000;

/**
 * Uygulama açılırken Neo4j bağlantısını kontrol eder ve yapılandırılmış
 * constraint'leri oluşturur.
 */
@Injectable()
export class Neo4jConstraintInitializer
  implements OnApplicationBootstrap {
/**
 * OnApplicationBootstrap metodu NestJS tarafından uygulama açılırken otomatik çağrılır.
 * bu sayede uygulama ayağa kaldırıldığında başlatılmadan constarintler oluşturulur.
 */
  private readonly logger = new Logger(
    Neo4jConstraintInitializer.name,
  );

  constructor(
    private readonly neo4jService: Neo4jService,

    @Inject(NEO4J_MODULE_OPTIONS)
    private readonly options: Neo4jModuleOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const retryOptions = this.resolveRetryOptions();

    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= retryOptions.maxAttempts;
      attempt += 1
    ) {
      try {
        await this.initializeConstraints();

        this.logger.log(
          'Neo4j connectivity and constraints are ready',
        );

        return;
      } catch (error: unknown) {
        lastError = error;

        if (attempt === retryOptions.maxAttempts) {
          break;
        }

        const delayMs = this.calculateDelay(
          attempt,
          retryOptions,
        );

        /**
         * Yalnızca deneme numarası ve tekrar beklenecek süre operasyonel
         * teşhis için yeterlidir.
         */
        this.logger.warn(
          `Neo4j initialization failed; retrying ` +
          `(attempt ${attempt}/${retryOptions.maxAttempts}, ` +
          `delay ${delayMs}ms)`,
        );

        await this.delay(delayMs);
      }
    }


    throw new Error(
      `Neo4j initialization failed after ` +
      `${retryOptions.maxAttempts} attempts`,
      {
        cause: lastError,
      },
    );
  }

  /**
   * Önce bağlantının kurulabildiğini doğrular, ardından constraint'leri
   * sırayla ve ayrı transaction'larda çalıştırır.
   */
  private async initializeConstraints(): Promise<void> {
    await this.neo4jService.verifyConnectivity();

    const constraints = this.options.constraints ?? [];

    for (const constraint of constraints) {
      this.assertIdempotentConstraint(constraint);

      /**
       * Her constraint'i ayrı transaction'da çalıştırıyoruz.
       *
       * Bir önceki constraint başarıyla oluşup sonraki başarısız olursa
       * retry sırasında IF NOT EXISTS sayesinde ilk constraint güvenle
       * tekrar kontrol edilir.
       */
      await this.neo4jService.executeWrite(
        async (transaction) => {
          await transaction.run(constraint.statement);
        },
      );
    }
  }

  /**
   * Constraint komutunun tekrar çalıştırılabilir olmasını zorunlu tutar.
   */
  private assertIdempotentConstraint(
    constraint: Neo4jConstraintDefinition,
  ): void {
    const hasIfNotExists = /\bIF\s+NOT\s+EXISTS\b/i.test(
      constraint.statement,
    );

    if (!hasIfNotExists) {
      throw new Error(
        `Neo4j constraint "${constraint.name}" must use IF NOT EXISTS`,
      );
    }
  }

  /**
   * Kullanıcı tarafından verilmemiş retry değerlerini güvenli varsayılanlarla
   * tamamlar.
   */
  private resolveRetryOptions(): Required<Neo4jStartupRetryOptions> {
    const configured = this.options.startupRetry ?? {};

    const resolved = {
      maxAttempts:
        configured.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,

      initialDelayMs:
        configured.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,

      maxDelayMs:
        configured.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    };

    /**
     * Yanlış ayarların sonsuz veya anlamsız retry davranışı üretmesini
     * engelliyoruz.
     */
    if (!Number.isInteger(resolved.maxAttempts) ||
        resolved.maxAttempts < 1) {
      throw new Error(
        'Neo4j startupRetry.maxAttempts must be a positive integer',
      );
    }

    if (resolved.initialDelayMs < 0) {
      throw new Error(
        'Neo4j startupRetry.initialDelayMs cannot be negative',
      );
    }

    if (resolved.maxDelayMs < resolved.initialDelayMs) {
      throw new Error(
        'Neo4j startupRetry.maxDelayMs cannot be smaller than ' +
        'initialDelayMs',
      );
    }

    return resolved;
  }

  /**
   * Exponential backoff hesaplar.
   *
   * initialDelayMs = 1000 ise:
   * - İlk retry: 1000 ms
   * - İkinci retry: 2000 ms
   * - Üçüncü retry: 4000 ms
   * - Sonrakiler maxDelayMs ile sınırlandırılır
   */
  private calculateDelay(
    failedAttempt: number,
    options: Required<Neo4jStartupRetryOptions>,
  ): number {
    const exponentialDelay =
      options.initialDelayMs * (2 ** (failedAttempt - 1));

    return Math.min(
      exponentialDelay,
      options.maxDelayMs,
    );
  }

  /**
   * Retry beklemesini Promise olarak gerçekleştirir.
   */
  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
