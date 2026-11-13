import {
  Injectable,
} from '@nestjs/common';

import {
  Neo4jService,
} from './neo4j.service.js';

/**
 * Neo4j health kontrolünün güvenli sonuç tipi.
 */
export type Neo4jHealthResult =
  | {
      status: 'up';
      latencyMs: number;
    }
  | {
      status: 'down';
      latencyMs: number;
    };

/**
 * Neo4j bağlantısının kullanılabilir olup olmadığını kontrol eder.
 */
@Injectable()
export class Neo4jHealthService {
  /**
   * Health isteğinin Neo4j için bekleyeceği maksimum süre.
   */
  private static readonly HEALTH_TIMEOUT_MS = 2_000;

  constructor(
    private readonly neo4jService: Neo4jService,
  ) {}

  /**
   * Neo4j driver üzerinden gerçek bağlantı kontrolü yapar.
   */
  async check(): Promise<Neo4jHealthResult> {
    const startedAt = Date.now();

    try {
      await this.verifyConnectivityWithTimeout();

      return {
        status: 'up',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
      };
    }
  }


  private async verifyConnectivityWithTimeout(): Promise<void> {
    let timeoutHandle:
      ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error('Neo4j health check timed out'),
        );
      }, Neo4jHealthService.HEALTH_TIMEOUT_MS);
    });

    try {
      await Promise.race([
        this.neo4jService.verifyConnectivity(),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}