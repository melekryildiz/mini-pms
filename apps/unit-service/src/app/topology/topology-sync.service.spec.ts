import type {
  Repository,
} from 'typeorm';

/**
 * Uygulama çalışırken gerçek InjectRepository decorator'ı kullanılır.
 * Bu birim testinde servisi constructor ile kendimiz oluşturduğumuz için
 * decorator davranışına ihtiyacımız yoktur. Ayrıca @nestjs/typeorm paketi ESM,
 * mevcut Jest transform'u ise CommonJS olduğundan modülü no-op ile izole ederiz.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import type {
  UnitEntity,
} from '../units/entities/unit.entity.js';

import type {
  DeviceEntity,
} from '../devices/entities/device.entity.js';

import type {
  TopologyGraphService,
} from './topology-graph.service.js';

import {
  TopologySyncService,
} from './topology-sync.service.js';

describe('TopologySyncService', () => {
  let unitFind: jest.MockedFunction<Repository<UnitEntity>['find']>;
  let deviceFind: jest.MockedFunction<Repository<DeviceEntity>['find']>;
  let rebuildTopology: jest.MockedFunction<
    TopologyGraphService['rebuildTopology']
  >;
  let service: TopologySyncService;

  beforeEach(() => {
    unitFind = jest.fn();
    deviceFind = jest.fn();
    rebuildTopology = jest.fn().mockResolvedValue(undefined);

    service = new TopologySyncService(
      {
        find: unitFind,
      } as unknown as Repository<UnitEntity>,
      {
        find: deviceFind,
      } as unknown as Repository<DeviceEntity>,
      {
        rebuildTopology,
      } as unknown as TopologyGraphService,
    );
  });

  it('silinmemiş PostgreSQL kayıtlarını okuyup grafı yeniden kurar', async () => {
    const units = [
      createUnit({ id: '10' }),
      createUnit({
        id: '20',
        parent_id: '10',
        organization_unit_type_id: '2',
      }),
    ];
    const devices = [
      createDevice({
        id: '50',
        organization_unit_id: '20',
      }),
    ];

    unitFind.mockResolvedValue(units);
    deviceFind.mockResolvedValue(devices);

    const result = await service.sync();

    expect(unitFind).toHaveBeenCalledWith({
      where: { is_deleted: false },
      order: { id: 'ASC' },
    });
    expect(deviceFind).toHaveBeenCalledWith({
      where: { is_deleted: false },
      order: { id: 'ASC' },
    });
    expect(rebuildTopology).toHaveBeenCalledWith(units, devices);
    expect(result).toEqual({
      unitCount: 2,
      deviceCount: 1,
    });
  });

  it('aktif Device silinmiş veya eksik Unit gösteriyorsa grafı silmez', async () => {
    const units = [createUnit({ id: '10' })];
    const devices = [
      createDevice({
        id: '50',
        organization_unit_id: '999',
      }),
    ];

    unitFind.mockResolvedValue(units);
    deviceFind.mockResolvedValue(devices);

    await expect(service.sync()).rejects.toThrow(
      '1 active device record(s)',
    );

    /**
     * Doğrulama rebuild'den önce çalışmalıdır. Aksi halde mevcut sağlıklı
     * graf silinip eksik veriyle yeniden kurulmaya başlanabilirdi.
     */
    expect(rebuildTopology).not.toHaveBeenCalled();
  });

  it('PostgreSQL okuması başarısızsa Neo4j rebuild işlemini başlatmaz', async () => {
    unitFind.mockRejectedValue(
      new Error('PostgreSQL is unavailable'),
    );
    deviceFind.mockResolvedValue([]);

    await expect(service.sync()).rejects.toThrow(
      'PostgreSQL is unavailable',
    );
    expect(rebuildTopology).not.toHaveBeenCalled();
  });
});

function createUnit(
  overrides: Partial<UnitEntity> = {},
): UnitEntity {
  return {
    id: '10',
    parent_id: null,
    organization_unit_type_id: '1',
    code: 'UNIT-10',
    name: 'Unit 10',
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

function createDevice(
  overrides: Partial<DeviceEntity> = {},
): DeviceEntity {
  return {
    id: '50',
    organization_unit_id: '10',
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
