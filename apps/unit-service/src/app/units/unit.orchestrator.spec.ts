import type {
  EntityManager,
} from 'typeorm';

import {
  UnitOrchestrator,
} from './unit.orchestrator.js';

import {
  UnitEntity,
} from './entities/unit.entity.js';

import {
  OrganizationUnitLogEntity,
} from './entities/organization-unit-log.js';

import type {
  UnitService,
} from './unit.service.js';

import type {
  TopologyGraphService,
} from '../topology/topology-graph.service.js';

/**
 * Bu spec NestJS repository injection sistemini değil orchestrator akışını
 * ölçer. UnitService import edilirken kullanılan decorator'ı no-op yaparız.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

describe('UnitOrchestrator topology synchronization', () => {
  let events: string[];
  let unitRepository: {
    findOne: jest.MockedFunction<(options: unknown) => Promise<UnitEntity | null>>;
  };
  let logRepository: {
    save: jest.MockedFunction<(log: unknown) => Promise<unknown>>;
  };
  let transactionManager: EntityManager;
  let entityManager: EntityManager;
  let unitService: {
    create: jest.MockedFunction<(...args: unknown[]) => Promise<UnitEntity>>;
    update: jest.MockedFunction<(...args: unknown[]) => Promise<UnitEntity | null>>;
    softDelete: jest.MockedFunction<(...args: unknown[]) => Promise<boolean>>;
  };
  let topologyGraphService: {
    upsertUnit: jest.MockedFunction<(unit: UnitEntity) => Promise<void>>;
    deleteUnit: jest.MockedFunction<(id: string) => Promise<void>>;
  };
  let orchestrator: UnitOrchestrator;

  beforeEach(() => {
    events = [];

    unitRepository = {
      findOne: jest.fn(),
    };

    logRepository = {
      save: jest.fn(async (log: unknown) => {
        void log;
        return {};
      }),
    };

    transactionManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === UnitEntity) {
          return unitRepository;
        }

        if (entity === OrganizationUnitLogEntity) {
          return logRepository;
        }

        throw new Error('Unexpected repository token');
      }),
    } as unknown as EntityManager;

    entityManager = {
      transaction: jest.fn(async (operation) => {
        events.push('transaction:start');
        const result = await operation(transactionManager);
        events.push('transaction:commit');
        return result;
      }),
    } as unknown as EntityManager;

    unitService = {
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    topologyGraphService = {
      upsertUnit: jest.fn(async (unit: UnitEntity) => {
        void unit;
        events.push('graph:upsertUnit');
      }),
      deleteUnit: jest.fn(async (id: string) => {
        void id;
        events.push('graph:deleteUnit');
      }),
    };

    orchestrator = new UnitOrchestrator(
      entityManager,
      unitService as unknown as UnitService,
      topologyGraphService as unknown as TopologyGraphService,
    );

    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('create commit edildikten sonra Unit nodeunu upsert eder', async () => {
    const unit = createUnit();
    unitService.create.mockResolvedValue(unit);

    await expect(
      orchestrator.create(
        {
          code: unit.code,
          name: unit.name,
          organization_unit_type_id: unit.organization_unit_type_id,
        },
        'admin',
      ),
    ).resolves.toBe(unit);

    expect(topologyGraphService.upsertUnit).toHaveBeenCalledWith(unit);
    expect(events).toEqual([
      'transaction:start',
      'transaction:commit',
      'graph:upsertUnit',
    ]);
  });

  it('update commit edildikten sonra yeni parent bilgisiyle Unit nodeunu upsert eder', async () => {
    const existingUnit = createUnit({ parent_id: '10' });
    const updatedUnit = createUnit({ parent_id: '11', name: 'Moved unit' });

    unitRepository.findOne.mockResolvedValue(existingUnit);
    unitService.update.mockResolvedValue(updatedUnit);

    await orchestrator.update(
      updatedUnit.id,
      {
        parent_id: '11',
      },
      'admin',
    );

    expect(topologyGraphService.upsertUnit).toHaveBeenCalledWith(updatedUnit);
    expect(events).toEqual([
      'transaction:start',
      'transaction:commit',
      'graph:upsertUnit',
    ]);
  });

  it('soft delete commit edildikten sonra Unit nodeunu siler', async () => {
    const before = createUnit({ is_active: false });
    const after = createUnit({
      is_active: false,
      is_deleted: true,
      deleted_by: 'admin',
    });

    unitRepository.findOne
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    unitService.softDelete.mockResolvedValue(true);

    await expect(
      orchestrator.softDelete(before.id, 'admin'),
    ).resolves.toBe(true);

    expect(topologyGraphService.deleteUnit).toHaveBeenCalledWith(before.id);
    expect(events).toEqual([
      'transaction:start',
      'transaction:commit',
      'graph:deleteUnit',
    ]);
  });

  it('PostgreSQL transaction işlemi hata atarsa graph çağrısı yapmaz', async () => {
    unitService.create.mockRejectedValue(
      new Error('PostgreSQL write failed'),
    );

    await expect(
      orchestrator.create(
        {
          code: 'UNIT-FAIL',
          name: 'Failure',
          organization_unit_type_id: '1',
        },
        'admin',
      ),
    ).rejects.toThrow('PostgreSQL write failed');

    expect(topologyGraphService.upsertUnit).not.toHaveBeenCalled();
    expect(topologyGraphService.deleteUnit).not.toHaveBeenCalled();
    expect(events).toEqual(['transaction:start']);
  });
});

function createUnit(
  overrides: Partial<UnitEntity> = {},
): UnitEntity {
  return {
    id: '20',
    parent_id: null,
    organization_unit_type_id: '1',
    code: 'UNIT-20',
    name: 'Unit 20',
    is_active: true,
    is_deleted: false,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    created_by: 'test',
    deleted_at: null,
    deleted_by: null,
    updated_at: null,
    updated_by: null,
    ...overrides,
  };
}
