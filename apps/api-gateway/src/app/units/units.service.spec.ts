
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { UnitsService } from './units.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    mockClient.send.mockReturnValue(
      of({ success: true }),
    );

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          UnitsService,
          {
            provide: 'UNIT_SERVICE',
            useValue: mockClient,
          },
        ],
      }).compile();

    service = module.get<UnitsService>(UnitsService);
  });

  it('should send unit.findAll pattern', async () => {
    const query: ListUnitsQueryDto = {
      page: 1,
      limit: 10,
      sortBy: 'id',
      sortOrder: 'ASC',
    };

    await service.findAll(query);

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.findAll',
      query,
    );
  });

  it('should send unit.findOne pattern', async () => {
    await service.findOne('5');

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.findOne',
      { id: '5' },
    );
  });

  it('should send unit.create pattern with username', async () => {
    const dto: CreateUnitDto = {
      organization_unit_type_id: '1',
      code: 'TM-TEST',
      name: 'Test Unit',
    };

    const username = 'testuser';

    await service.create(dto, username);

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.create',
      {
        dto,
        username,
      },
    );
  });

  it('should send unit.update pattern with username', async () => {
    const dto: UpdateUnitDto = {
      name: 'Updated Unit',
    };

    const username = 'testuser';

    await service.update('5', dto, username);

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.update',
      {
        id: '5',
        dto,
        username,
      },
    );
  });

  it('should send unit.delete pattern with username', async () => {
    const username = 'testuser';

    await service.delete('5', username);

    expect(mockClient.send).toHaveBeenCalledWith(
      'unit.delete',
      {
        id: '5',
        username,
      },
    );
  });
});
