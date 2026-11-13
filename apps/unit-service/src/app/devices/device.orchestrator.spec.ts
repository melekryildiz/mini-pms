import type {
  EntityManager,
} from 'typeorm';

import {
  DeviceOrchestrator,
} from './device.orchestrator.js';

import {
  DeviceEntity,
} from './entities/device.entity.js';

import {
  DeviceLogEntity,
} from './entities/device-log.entity.js';

import type {
  DeviceService,
} from './device.service.js';

import type {
  TopologyGraphService,
} from '../topology/topology-graph.service.js';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

describe('DeviceOrchestrator topology synchronization', () => {
  let events: string[];
  let deviceRepository: {
    findOne: jest.MockedFunction<(options: unknown) => Promise<DeviceEntity | null>>;
  };
  let logRepository: {
    save: jest.MockedFunction<(log: unknown) => Promise<unknown>>;
  };
  let transactionManager: EntityManager;
  let entityManager: EntityManager;
  let deviceService: {
    create: jest.MockedFunction<(...args: unknown[]) => Promise<DeviceEntity>>;
    update: jest.MockedFunction<(...args: unknown[]) => Promise<DeviceEntity>>;
    softDelete: jest.MockedFunction<(...args: unknown[]) => Promise<boolean>>;
  };
  let topologyGraphService: {
    upsertDevice: jest.MockedFunction<(device: DeviceEntity) => Promise<void>>;
    deleteDevice: jest.MockedFunction<(id: string) => Promise<void>>;
  };
  let orchestrator: DeviceOrchestrator;

  beforeEach(() => {
    events = [];

    deviceRepository = {
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
        if (entity === DeviceEntity) {
          return deviceRepository;
        }

        if (entity === DeviceLogEntity) {
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

    deviceService = {
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    topologyGraphService = {
      upsertDevice: jest.fn(async (device: DeviceEntity) => {
        void device;
        events.push('graph:upsertDevice');
      }),
      deleteDevice: jest.fn(async (id: string) => {
        void id;
        events.push('graph:deleteDevice');
      }),
    };

    orchestrator = new DeviceOrchestrator(
      entityManager,
      deviceService as unknown as DeviceService,
      topologyGraphService as unknown as TopologyGraphService,
    );
  });

  it('create commit edildikten sonra Device nodeunu upsert eder', async () => {
    const device = createDevice();
    deviceService.create.mockResolvedValue(device);

    await expect(
      orchestrator.create(
        {
          organization_unit_id: device.organization_unit_id,
          serial_no: device.serial_no,
          role: device.role,
        },
        'admin',
      ),
    ).resolves.toBe(device);

    expect(topologyGraphService.upsertDevice).toHaveBeenCalledWith(device);
    expect(events).toEqual([
      'transaction:start',
      'transaction:commit',
      'graph:upsertDevice',
    ]);
  });

  it('update commit edildikten sonra aynı Unit bağlantısıyla Device nodeunu upsert eder', async () => {
    const existingDevice = createDevice({ role: 'METER' });
    const updatedDevice = createDevice({ role: 'GATEWAY' });

    deviceRepository.findOne.mockResolvedValue(existingDevice);
    deviceService.update.mockResolvedValue(updatedDevice);

    await orchestrator.update(
      updatedDevice.id,
      {
        role: 'GATEWAY',
      },
      'admin',
    );

    expect(updatedDevice.organization_unit_id).toBe(
      existingDevice.organization_unit_id,
    );
    expect(topologyGraphService.upsertDevice).toHaveBeenCalledWith(
      updatedDevice,
    );
    expect(events).toEqual([
      'transaction:start',
      'transaction:commit',
      'graph:upsertDevice',
    ]);
  });

  it('soft delete commit edildikten sonra Device nodeunu siler', async () => {
    const before = createDevice({ is_active: false });
    const after = createDevice({
      is_active: false,
      is_deleted: true,
      deleted_by: 'admin',
    });

    deviceRepository.findOne
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    deviceService.softDelete.mockResolvedValue(true);

    await expect(
      orchestrator.softDelete(before.id, 'admin'),
    ).resolves.toBe(true);

    expect(topologyGraphService.deleteDevice).toHaveBeenCalledWith(before.id);
    expect(events).toEqual([
      'transaction:start',
      'transaction:commit',
      'graph:deleteDevice',
    ]);
  });

  it('PostgreSQL transaction işlemi hata atarsa graph çağrısı yapmaz', async () => {
    deviceService.create.mockRejectedValue(
      new Error('PostgreSQL write failed'),
    );

    await expect(
      orchestrator.create(
        {
          organization_unit_id: '20',
          serial_no: 'SERIAL-FAIL',
          role: 'METER',
        },
        'admin',
      ),
    ).rejects.toThrow('PostgreSQL write failed');

    expect(topologyGraphService.upsertDevice).not.toHaveBeenCalled();
    expect(topologyGraphService.deleteDevice).not.toHaveBeenCalled();
    expect(events).toEqual(['transaction:start']);
  });
});

function createDevice(
  overrides: Partial<DeviceEntity> = {},
): DeviceEntity {
  return {
    id: '50',
    organization_unit_id: '20',
    serial_no: 'SERIAL-50',
    role: 'METER',
    metadata: {},
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
