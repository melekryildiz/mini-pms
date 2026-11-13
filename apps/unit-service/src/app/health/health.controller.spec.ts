import {
  HttpStatus,
} from '@nestjs/common';

import {
  HealthController,
} from './health.controller.js';

import type {
  HealthService,
  UnitServiceHealthResult,
} from './health.service.js';

describe('HealthController', () => {
  let checkHealth:
    jest.MockedFunction<HealthService['check']>;

  let setStatus: jest.MockedFunction<(code: number) => unknown>;
  let controller: HealthController;

  beforeEach(() => {
    checkHealth = jest.fn();
    setStatus = jest.fn();

    controller = new HealthController({
      check: checkHealth,
    } as unknown as HealthService);
  });

  it('sağlıklı sonuçta HTTP 200 ve güvenli response body döndürür', async () => {
    const healthResult: UnitServiceHealthResult = {
      status: 'ok',
      dependencies: {
        redis: {
          status: 'up',
          latencyMs: 2,
        },
        neo4j: {
          status: 'up',
          latencyMs: 4,
        },
      },
    };

    checkHealth.mockResolvedValue(healthResult);

    const result = await controller.check({
      status: setStatus,
    });

    expect(setStatus).toHaveBeenCalledWith(HttpStatus.OK);
    expect(result).toBe(healthResult);
  });

  it('degraded sonuçta HTTP 503 ve dependency durumlarını döndürür', async () => {
    const healthResult: UnitServiceHealthResult = {
      status: 'degraded',
      dependencies: {
        redis: {
          status: 'up',
          latencyMs: 2,
        },
        neo4j: {
          status: 'down',
          latencyMs: 2_000,
        },
      },
    };

    checkHealth.mockResolvedValue(healthResult);

    const result = await controller.check({
      status: setStatus,
    });

    expect(setStatus).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(result).toEqual(healthResult);
  });
});
