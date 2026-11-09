
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

import { DevicesService } from './devices.service';

import type {
  CreateDeviceDto,
  UpdateDeviceDto,
} from '@mini-pms/contracts';

describe('DevicesService', () => {
  let service: DevicesService;

  const mockClient = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockClient.send.mockReturnValue(of({ success: true }));

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          DevicesService,
          {
            provide: 'UNIT_SERVICE',
            useValue: mockClient,
          },
        ],
      }).compile();

    service = module.get<DevicesService>(DevicesService);
  });

  it('should send device.findAll pattern', async () => {
    const query = {
      page: 1,
      limit: 10,
    };

    await service.findAll(query);

    expect(mockClient.send).toHaveBeenCalledWith(
      'device.findAll',
      query,
    );
  });

  it('should send device.findOne pattern', async () => {
    await service.findOne('5');

    expect(mockClient.send).toHaveBeenCalledWith(
      'device.findOne',
      { id: '5' },
    );
  });

  it('should send device.create pattern', async () => {
    const dto: CreateDeviceDto = {
      organization_unit_id: '1',
      serial_no: 'METER-001',
      role: 'MAIN',
    };

    await service.create(dto);

    expect(mockClient.send).toHaveBeenCalledWith(
      'device.create',
      dto,
    );
  });

  it('should send device.update pattern', async () => {
    const dto: UpdateDeviceDto = {
      serial_no: 'METER-002',
    };

    await service.update('5', dto);

    expect(mockClient.send).toHaveBeenCalledWith(
      'device.update',
      { id: '5', dto },
    );
  });

  it('should send device.delete pattern', async () => {
    await service.delete('5');

    expect(mockClient.send).toHaveBeenCalledWith(
      'device.delete',
      { id: '5' },
    );
  });
});
