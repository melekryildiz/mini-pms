import type {
  Neo4jService,
  Neo4jTransactionWork,
} from '@mini-pms/neo4j';

import {
  TopologyGraphService,
} from './topology-graph.service.js';

import type {
  UnitEntity,
} from '../units/entities/unit.entity.js';

import type {
  DeviceEntity,
} from '../devices/entities/device.entity.js';

describe('TopologyGraphService', () => {
  let transactionRun: jest.MockedFunction<
    (
      query: string,
      parameters?: Record<string, unknown>,
    ) => Promise<unknown>
  >;

  let executeWrite: jest.MockedFunction<(
    work: Neo4jTransactionWork<void>,
  ) => Promise<void>>;

  let service: TopologyGraphService;

  beforeEach(() => {
    transactionRun = jest.fn().mockResolvedValue({});

    const transaction = {
      run: transactionRun,
    } as unknown as Parameters<Neo4jTransactionWork<void>>[0];

    executeWrite = jest.fn(
      async (work: Neo4jTransactionWork<void>): Promise<void> =>
        work(transaction),
    );

    service = new TopologyGraphService({
      executeWrite,
    } as unknown as Neo4jService);
  });

  it('topology grafını tek transaction içinde doğru sırayla yeniden kurar', async () => {
    const root = createUnit({
      id: '10',
      parent_id: null,
    });
    const child = createUnit({
      id: '20',
      parent_id: '10',
      organization_unit_type_id: '2',
    });
    const device = createDevice({
      id: '50',
      organization_unit_id: '20',
    });

    await service.rebuildTopology(
      [root, child],
      [device],
    );

    /**
     * Beş Cypher sorgusunun tamamı aynı executeWrite callback'i içerisinde
     * çalışmalıdır. Böylece herhangi biri hata verirse Neo4j transaction
     * bütün rebuild işlemini rollback edebilir.
     */
    expect(executeWrite).toHaveBeenCalledTimes(1);
    expect(transactionRun).toHaveBeenCalledTimes(5);

    const [deleteQuery] = transactionRun.mock.calls[0];
    const [unitQuery, unitParameters] = transactionRun.mock.calls[1];
    const [containsQuery, containsParameters] =
      transactionRun.mock.calls[2];
    const [deviceQuery, deviceParameters] =
      transactionRun.mock.calls[3];
    const [hasDeviceQuery, hasDeviceParameters] =
      transactionRun.mock.calls[4];

    // Başka domain node'ları değil, sadece topology label'ları silinir.
    expect(deleteQuery).toContain('node:Unit OR node:Device');
    expect(deleteQuery).toContain('DETACH DELETE node');

    expect(unitQuery).toContain('UNWIND $units AS unitData');
    expect(unitQuery).toContain('MERGE (unit:Unit');
    expect(unitParameters).toEqual({
      units: [
        {
          id: '10',
          parentId: null,
          organizationUnitTypeId: '1',
          code: 'UNIT-10',
          name: 'Unit 10',
          isActive: true,
        },
        {
          id: '20',
          parentId: '10',
          organizationUnitTypeId: '2',
          code: 'UNIT-10',
          name: 'Unit 10',
          isActive: true,
        },
      ],
    });

    expect(containsQuery).toContain(
      'MERGE (parent)-[:CONTAINS]->(child)',
    );
    expect(containsParameters).toEqual(unitParameters);

    expect(deviceQuery).toContain('UNWIND $devices AS deviceData');
    expect(deviceQuery).toContain('MERGE (device:Device');
    expect(deviceParameters).toEqual({
      devices: [
        {
          id: '50',
          unitId: '20',
          serialNo: 'SERIAL-50',
          role: 'METER',
          isActive: true,
        },
      ],
    });

    expect(hasDeviceQuery).toContain(
      'MERGE (unit)-[:HAS_DEVICE]->(device)',
    );
    expect(hasDeviceParameters).toEqual(deviceParameters);
  });

  it('root Unit nodeunu günceller ve yeni parent kenarı oluşturmaz', async () => {
    const unit = createUnit({
      id: '10',
      parent_id: null,
    });

    await service.upsertUnit(unit);

    expect(executeWrite).toHaveBeenCalledTimes(1);
    expect(transactionRun).toHaveBeenCalledTimes(1);

    const [query, parameters] = transactionRun.mock.calls[0];

    expect(query).toContain('MERGE (unit:Unit { id: $id })');
    expect(query).toContain('DELETE oldParent');
    expect(parameters).toEqual({
      id: '10',
      code: 'UNIT-10',
      name: 'Unit 10',
      organizationUnitTypeId: '1',
      isActive: true,
    });
  });

  it('child Unit için eski parent kenarını kaldırıp güncel parentı bağlar', async () => {
    const unit = createUnit({
      id: '20',
      parent_id: '10',
      organization_unit_type_id: '2',
    });

    await service.upsertUnit(unit);

    expect(transactionRun).toHaveBeenCalledTimes(2);

    const [upsertQuery] = transactionRun.mock.calls[0];
    const [parentQuery, parentParameters] = transactionRun.mock.calls[1];

    expect(upsertQuery).toContain(
      'OPTIONAL MATCH (:Unit)-[oldParent:CONTAINS]->(unit)',
    );
    expect(upsertQuery).toContain('DELETE oldParent');

    expect(parentQuery).toContain(
      'MERGE (parent)-[:CONTAINS]->(unit)',
    );
    expect(parentParameters).toEqual({
      parentId: '10',
      unitId: '20',
    });
  });

  it('Unit silerken node ve relationshipleri kaldırır', async () => {
    await service.deleteUnit('25');

    expect(transactionRun).toHaveBeenCalledTimes(1);

    const [query, parameters] = transactionRun.mock.calls[0];

    expect(query).toContain('DETACH DELETE unit');
    expect(parameters).toEqual({
      unitId: '25',
    });
  });

  it('Device upsert sırasında değişmez Unit bağlantısını silmeden MERGE eder', async () => {
    const device = createDevice({
      id: '50',
      organization_unit_id: '20',
    });

    await service.upsertDevice(device);

    expect(transactionRun).toHaveBeenCalledTimes(2);

    const [deviceQuery, deviceParameters] = transactionRun.mock.calls[0];
    const [relationshipQuery, relationshipParameters] =
      transactionRun.mock.calls[1];

    expect(deviceQuery).toContain('MERGE (device:Device { id: $id })');

    /**
     * Domain kuralı: organization_unit_id değiştirilemez. Bu nedenle Device
     * upsert sorgusunda eski HAS_DEVICE kenarını silen kod bulunmamalıdır.
     */
    expect(deviceQuery).not.toContain('oldUnit');
    expect(deviceQuery).not.toContain('DELETE oldUnit');

    expect(deviceParameters).toEqual({
      id: '50',
      serialNo: 'SERIAL-50',
      role: 'METER',
      isActive: true,
    });

    expect(relationshipQuery).toContain(
      'MERGE (unit)-[:HAS_DEVICE]->(device)',
    );
    expect(relationshipParameters).toEqual({
      unitId: '20',
      deviceId: '50',
    });
  });

  it('Device silerken node ve HAS_DEVICE ilişkisini kaldırır', async () => {
    await service.deleteDevice('50');

    expect(transactionRun).toHaveBeenCalledTimes(1);

    const [query, parameters] = transactionRun.mock.calls[0];

    expect(query).toContain('DETACH DELETE device');
    expect(parameters).toEqual({
      deviceId: '50',
    });
  });
});

/**
 * Testlerin ilgilenmediği UnitEntity alanlarına güvenli varsayılanlar verir.
 */
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

/**
 * Testlerin ilgilenmediği DeviceEntity alanlarına güvenli varsayılanlar verir.
 */
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
