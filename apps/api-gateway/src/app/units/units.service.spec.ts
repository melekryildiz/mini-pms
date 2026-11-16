import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { UnitsService } from './units.service';
import { UnitCacheService } from './unit-cache.service';

import {
  CreateUnitDto,
  UpdateUnitDto,
  ListUnitsQueryDto,
} from '@mini-pms/contracts';

describe('UnitsService', () => {
  let service: UnitsService;

  const mockClient = {
    send: jest.fn(),
  };

  const mockUnitCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockClient.send.mockReturnValue(of({ success: true }));
    mockUnitCache.get.mockResolvedValue(null);
    mockUnitCache.set.mockResolvedValue(undefined);
    mockUnitCache.invalidate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsService,
        {
          provide: 'UNIT_SERVICE',
          useValue: mockClient,
        },
        {
          provide: UnitCacheService,
          useValue: mockUnitCache,
        },
      ],
    }).compile();

    service = module.get<UnitsService>(UnitsService);
  });

  it('should send unit.findAll pattern', async () => {
    const query: ListUnitsQueryDto = {
      page: '1',
      limit: '10',
      sortBy: 'id',
      sortOrder: 'ASC',
    };

    await service.findAll(query);

    expect(mockClient.send).toHaveBeenCalledWith('unit.findAll', query);
  });

  it('cache miss durumunda unit.findOne çağırıp sonucu cacheler', async () => {
    const unit = { id: '5', name: 'Unit 5' };
    mockClient.send.mockReturnValue(of(unit));

    await expect(service.findOne('5')).resolves.toEqual(unit);

    expect(mockUnitCache.get).toHaveBeenCalledWith('5');
    expect(mockClient.send).toHaveBeenCalledWith('unit.findOne', { id: '5' });
    expect(mockUnitCache.set).toHaveBeenCalledWith('5', unit);
  });

  it('cache hit durumunda RPC çağırmadan birim detayını döndürür', async () => {
    const cachedUnit = { id: '5', name: 'Cached Unit' };
    mockUnitCache.get.mockResolvedValue(cachedUnit);

    const startedAt = performance.now();
    const result = await service.findOne('5');
    const durationMs = performance.now() - startedAt;

    expect(result).toEqual(cachedUnit);
    expect(mockClient.send).not.toHaveBeenCalled();
    expect(mockUnitCache.set).not.toHaveBeenCalled();

    // Bu birim testi ağ erişimi içermeyen cache-hit kısa yolunun bütçesini
    // korur. Gerçek Redis süresi ayrıca entegrasyon testinde ölçülecektir.
    expect(durationMs).toBeLessThan(20);
  });

  it('bulunamayan birimi negative cache içine yazmaz', async () => {
    mockClient.send.mockReturnValue(of(null));

    await expect(service.findOne('404')).resolves.toBeNull();

    expect(mockUnitCache.set).not.toHaveBeenCalled();
  });

  it('should request paginated unit history', async () => {
    await service.history('5', 2, 20);

    expect(mockClient.send).toHaveBeenCalledWith('unit.history', {
      id: '5',
      page: 2,
      limit: 20,
    });
  });

  it('should send unit.getTree pattern', async () => {
    await service.getTree('10');

    expect(mockClient.send).toHaveBeenCalledWith('unit.getTree', {
      id: '10',
    });
  });

  it('should send unit.getPath pattern', async () => {
    await service.getPath('25');

    expect(mockClient.send).toHaveBeenCalledWith('unit.getPath', {
      id: '25',
    });
  });

  it('lazy tree açılışında root patternini boş payload ile gönderir', async () => {
    await service.getNavigationRoots();

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.getNavigationRoots',
      {},
    );
  });

  it('açılan düğümün parentId değerini children patternine gönderir', async () => {
    await service.getNavigationChildren('10');

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.getNavigationChildren',
      { parentId: '10' },
    );
  });

  it('kod arama DTO değerlerini search patternine değiştirmeden gönderir', async () => {
    const query = { code: 'TR-20', limit: '15' };

    await service.searchNavigationByCode(query);

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.searchNavigationByCode',
      query,
    );
  });

  it('should preserve topology inconsistency status 503', async () => {
    mockClient.send.mockReturnValue(
      throwError(() => ({
        statusCode: 503,
        message:
          'Neo4j and PostgreSQL topology results do not match',
      })),
    );

    await expect(service.getTree('10')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('should preserve validation errors returned by the core service', async () => {
    mockClient.send.mockReturnValue(
      throwError(() => ({
        statusCode: 400,
        message: 'code should not be empty',
      })),
    );

    await expect(
      service.create({} as CreateUnitDto, 'testuser'),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('should preserve class-validator message arrays', async () => {
    mockClient.send.mockReturnValue(
      throwError(() => ({
        statusCode: 400,
        message: ['page must be a positive integer'],
      })),
    );

    await expect(
      service.findAll({} as ListUnitsQueryDto),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('should send unit.create pattern with username', async () => {
    const dto: CreateUnitDto = {
      organization_unit_type_id: '1',
      code: 'TM-TEST',
      name: 'Test Unit',
    };

    const username = 'testuser';

    await service.create(dto, username);

    expect(mockClient.send).toHaveBeenCalledWith('unit.create', {
      dto,
      username,
    });
  });

  it('should send unit.update pattern with username', async () => {
    const dto: UpdateUnitDto = {
      name: 'Updated Unit',
    };

    const username = 'testuser';

    await service.update('5', dto, username);

    expect(mockClient.send).toHaveBeenCalledWith('unit.update', {
      id: '5',
      dto,
      username,
    });
    expect(mockUnitCache.invalidate).toHaveBeenCalledWith('5');
  });

  it('update RPC başarısızsa geçerli cache kaydını silmez', async () => {
    mockClient.send.mockReturnValue(
      throwError(() => ({
        statusCode: 409,
        message: 'Update conflict',
      })),
    );

    await expect(
      service.update('5', { name: 'Updated' }, 'testuser'),
    ).rejects.toMatchObject({ status: 409 });

    expect(mockUnitCache.invalidate).not.toHaveBeenCalled();
  });

  it('güncellemeden sonraki GET isteğinde eski cache verisini döndürmez', async () => {
    let cachedUnit: Record<string, unknown> | null = {
      id: '5',
      name: 'Old name',
    };

    mockUnitCache.get.mockImplementation(async () => cachedUnit);
    mockUnitCache.set.mockImplementation(async (_id, value) => {
      cachedUnit = value as Record<string, unknown>;
    });
    mockUnitCache.invalidate.mockImplementation(async () => {
      cachedUnit = null;
    });

    const updatedUnit = { id: '5', name: 'New name' };

    mockClient.send.mockImplementation((pattern: string) => {
      if (pattern === 'unit.update') {
        return of({ success: true, data: updatedUnit });
      }

      if (pattern === 'unit.findOne') {
        return of(updatedUnit);
      }

      return of({ success: true });
    });

    await service.update('5', { name: 'New name' }, 'testuser');
    const detailAfterUpdate = await service.findOne('5');

    expect(mockUnitCache.invalidate).toHaveBeenCalledWith('5');
    expect(mockClient.send).toHaveBeenCalledWith('unit.findOne', { id: '5' });
    expect(detailAfterUpdate).toEqual(updatedUnit);
    expect(detailAfterUpdate).not.toEqual({ id: '5', name: 'Old name' });
  });

  it('should send unit.delete pattern with username', async () => {
    const username = 'testuser';

    await service.delete('5', username);

    expect(mockClient.send).toHaveBeenCalledWith('unit.delete', {
      id: '5',
      username,
    });
    expect(mockUnitCache.invalidate).toHaveBeenCalledWith('5');
  });

  it('delete RPC başarısızsa geçerli cache kaydını silmez', async () => {
    mockClient.send.mockReturnValue(
      throwError(() => ({
        statusCode: 404,
        message: 'Unit not found',
      })),
    );

    await expect(service.delete('5', 'testuser')).rejects.toMatchObject({
      status: 404,
    });

    expect(mockUnitCache.invalidate).not.toHaveBeenCalled();
  });
});
