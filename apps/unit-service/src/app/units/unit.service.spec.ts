import {
  BadRequestException,
} from '@nestjs/common';

import type {
  Repository,
} from 'typeorm';

import {
  UnitService,
} from './unit.service.js';

import {
  UnitEntity,
} from './entities/unit.entity.js';

import type {
  OrganizationUnitLogEntity,
} from './entities/organization-unit-log.js';

import type {
  UnitTopologyNode,
} from '@mini-pms/contracts';

/**
 * Bu test NestJS'in repository injection mekanizmasını değil UnitService'in
 * parent iş kurallarını ölçer. @nestjs/typeorm paketinin ESM girişini Jest
 * CommonJS ortamına yüklemek yerine yalnızca decorator factory'sini no-op
 * olarak taklit ediyoruz.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

type MockUnitRepository = {
  findOne: jest.MockedFunction<
    (options: unknown) => Promise<UnitEntity | null>
  >;
  count: jest.MockedFunction<(options: unknown) => Promise<number>>;
  merge: jest.MockedFunction<
    (target: UnitEntity, source: Partial<UnitEntity>) => UnitEntity
  >;
  save: jest.MockedFunction<(unit: UnitEntity) => Promise<UnitEntity>>;
  query: jest.MockedFunction<
    (
      query: string,
      parameters?: unknown[],
    ) => Promise<UnitTopologyNode[]>
  >;
};

describe('UnitService parent update', () => {
  let repository: MockUnitRepository;
  let service: UnitService;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      merge: jest.fn((target, source) => {
        Object.assign(target, source);
        return target;
      }),
      save: jest.fn(async (unit) => unit),
      query: jest.fn(),
    };

    service = new UnitService(
      repository as unknown as Repository<UnitEntity>,
      {} as Repository<OrganizationUnitLogEntity>,
    );
  });

  it('Transformerı başka aktif Substation altına taşır', async () => {
    const transformer = createUnit({
      id: '20',
      parent_id: '10',
      organization_unit_type_id: '2',
    });

    const newSubstation = createUnit({
      id: '11',
      parent_id: null,
      organization_unit_type_id: '1',
    });

    repository.findOne
      .mockResolvedValueOnce(transformer)
      .mockResolvedValueOnce(newSubstation);

    const result = await service.update(
      '20',
      {
        parent_id: '11',
      },
      'admin',
    );

    expect(result?.parent_id).toBe('11');
    expect(result?.updated_by).toBe('admin');
    expect(repository.save).toHaveBeenCalledWith(transformer);
  });

  it('Feederı başka aktif Transformer altına taşır', async () => {
    const feeder = createUnit({
      id: '30',
      parent_id: '20',
      organization_unit_type_id: '3',
    });

    const newTransformer = createUnit({
      id: '21',
      parent_id: '10',
      organization_unit_type_id: '2',
    });

    repository.findOne
      .mockResolvedValueOnce(feeder)
      .mockResolvedValueOnce(newTransformer);

    await expect(
      service.update(
        '30',
        {
          parent_id: '21',
        },
        'admin',
      ),
    ).resolves.toMatchObject({
      parent_id: '21',
    });
  });

  it('Unitin kendisini parent yapmasını reddeder', async () => {
    repository.findOne.mockResolvedValue(
      createUnit({
        id: '20',
        parent_id: '10',
        organization_unit_type_id: '2',
      }),
    );

    await expect(
      service.update(
        '20',
        {
          parent_id: '20',
        },
        'admin',
      ),
    ).rejects.toThrow(
      new BadRequestException('Unit cannot be its own parent'),
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('Transformerın root yapılmasını reddeder', async () => {
    repository.findOne.mockResolvedValue(
      createUnit({
        id: '20',
        parent_id: '10',
        organization_unit_type_id: '2',
      }),
    );

    await expect(
      service.update(
        '20',
        {
          parent_id: null,
        },
        'admin',
      ),
    ).rejects.toThrow(
      new BadRequestException('Parent unit is required'),
    );
  });

  it('Substationın başka bir Unit altına taşınmasını reddeder', async () => {
    repository.findOne.mockResolvedValue(
      createUnit({
        id: '10',
        parent_id: null,
        organization_unit_type_id: '1',
      }),
    );

    await expect(
      service.update(
        '10',
        {
          parent_id: '11',
        },
        'admin',
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'SUBSTATION cannot have a parent unit',
      ),
    );
  });

  it('yanlış tipte parent atanmasını reddeder', async () => {
    const transformer = createUnit({
      id: '20',
      parent_id: '10',
      organization_unit_type_id: '2',
    });

    const feeder = createUnit({
      id: '30',
      parent_id: '20',
      organization_unit_type_id: '3',
    });

    repository.findOne
      .mockResolvedValueOnce(transformer)
      .mockResolvedValueOnce(feeder);

    await expect(
      service.update(
        '20',
        {
          parent_id: '30',
        },
        'admin',
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'TRANSFORMER must belong to a SUBSTATION',
      ),
    );
  });

  it('silinmiş veya bulunamayan parent atamasını reddeder', async () => {
    repository.findOne
      .mockResolvedValueOnce(createUnit({
        id: '20',
        parent_id: '10',
        organization_unit_type_id: '2',
      }))
      .mockResolvedValueOnce(null);

    await expect(
      service.update(
        '20',
        {
          parent_id: '99',
        },
        'admin',
      ),
    ).rejects.toThrow(
      new BadRequestException('Parent unit not found'),
    );
  });

  it('organization_unit_type_id alanını iç çağrıyla bile değiştirmez', async () => {
    const transformer = createUnit({
      id: '20',
      parent_id: '10',
      organization_unit_type_id: '2',
    });

    repository.findOne.mockResolvedValue(transformer);

    const result = await service.update(
      '20',
      {
        organization_unit_type_id: '3',
        name: 'Updated transformer',
      },
      'admin',
    );

    expect(result).toMatchObject({
      organization_unit_type_id: '2',
      name: 'Updated transformer',
    });
  });

  it('Unit subtree için cycle korumalı recursive CTE çalıştırır', async () => {
    const rows = [createTopologyNode({ id: '10' })];
    repository.query.mockResolvedValue(rows);

    const result = await service.getUnitTreeWithCte('10');

    const [query, parameters] = repository.query.mock.calls[0];

    expect(query).toContain('WITH RECURSIVE unit_tree');
    expect(query).toContain('child.parent_id = parent_tree.id');
    expect(query).toContain(
      'child.id = ANY(parent_tree.visited_ids)',
    );
    expect(query).toContain('unit.is_deleted = false');
    expect(parameters).toEqual(['10']);
    expect(result).toBe(rows);
  });

  it('Unit path için parent yönünde recursive CTE çalıştırır', async () => {
    const rows = [
      createTopologyNode({ id: '10' }),
      createTopologyNode({ id: '20', parentId: '10' }),
    ];
    repository.query.mockResolvedValue(rows);

    const result = await service.getUnitPathWithCte('20');

    const [query, parameters] = repository.query.mock.calls[0];

    expect(query).toContain('WITH RECURSIVE unit_path');
    expect(query).toContain('parent.id = child_path.parent_id');
    expect(query).toContain('ORDER BY depth DESC');
    expect(parameters).toEqual(['20']);
    expect(result).toBe(rows);
  });

  it('lazy tree ilk açılışında yalnız root birimleri sorgular', async () => {
    const rows = [
      createNavigationNode({
        id: '10',
        parentId: null,
        hasChildren: true,
      }),
    ];
    repository.query.mockResolvedValue(rows);

    const result = await service.getNavigationRoots();
    const [query, parameters] = repository.query.mock.calls[0];

    expect(query).toContain('unit.parent_id IS NULL');
    expect(query).toContain('EXISTS (');
    expect(query).toContain('AS "hasChildren"');
    expect(query).not.toContain('WITH RECURSIVE');
    expect(parameters).toBeUndefined();
    expect(result).toBe(rows);
  });

  it('düğüm açıldığında yalnız doğrudan çocukları sorgular', async () => {
    const rows = [
      createNavigationNode({
        id: '20',
        parentId: '10',
      }),
    ];
    repository.query.mockResolvedValue(rows);

    const result = await service.getNavigationChildren('10');
    const [query, parameters] = repository.query.mock.calls[0];

    expect(query).toContain('unit.parent_id = $1');
    expect(query).not.toContain('WITH RECURSIVE');
    expect(parameters).toEqual(['10']);
    expect(result).toBe(rows);
  });

  it('kod aramasını parametreli, limitli ve wildcard karakterleri escape edilmiş çalıştırır', async () => {
    const rows = [createNavigationNode({ code: 'TR%_01' })];
    repository.query.mockResolvedValue(rows);

    const result = await service.searchNavigationByCode('  TR%_01  ', 20);
    const [query, parameters] = repository.query.mock.calls[0];

    expect(query).toContain('unit.code ILIKE $1');
    expect(query).toContain('LIMIT $3');
    expect(query).toContain('unit.is_deleted = false');
    expect(parameters).toEqual([
      '%TR\\%\\_01%',
      'TR%_01',
      20,
    ]);
    expect(result).toBe(rows);
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

function createTopologyNode(
  overrides: Partial<UnitTopologyNode> = {},
): UnitTopologyNode {
  return {
    id: '10',
    parentId: null,
    organizationUnitTypeId: '1',
    code: 'SUB-10',
    name: 'Substation 10',
    isActive: true,
    ...overrides,
  };
}

function createNavigationNode(
  overrides: Partial<import('@mini-pms/contracts').UnitNavigationNode> = {},
): import('@mini-pms/contracts').UnitNavigationNode {
  return {
    id: '10',
    parentId: null,
    organizationUnitTypeId: '1',
    code: 'SUB-10',
    name: 'Substation 10',
    isActive: true,
    hasChildren: false,
    ...overrides,
  };
}
