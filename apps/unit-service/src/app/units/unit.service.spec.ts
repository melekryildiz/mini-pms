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
