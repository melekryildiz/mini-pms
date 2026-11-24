jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
import { DeviceService } from './device.service';
import { DeviceEntity } from './entities/device.entity';
import { validate } from 'class-validator';
import { CreateDeviceDto, UpdateDeviceDto } from '@mini-pms/contracts';

describe('Sayaç tanımlama kuralları', () => {
  let repo: any;
  let service: DeviceService;
  const device = {
    id: '3',
    organization_unit_id: '1',
    serial_no: 'S3',
    role: 'FEEDER',
    multiplier: '1',
    is_active: true,
  };
  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => data),
      merge: jest.fn((target, data) => Object.assign(target, data)),
      save: jest.fn(async (data) => data),
      manager: {
        getRepository: () => ({
          findOne: jest.fn().mockResolvedValue({ id: '1', is_active: true }),
        }),
      },
    };
    service = new DeviceService(repo);
  });
  it.each(['SECONDARY', 'METER', 'TEST', '', null])(
    'geçersiz rolü reddeder: %s',
    async (role) => {
      await expect(
        service.create({ ...device, role } as any, 'test'),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
  it.each(['0', '-1', 'NaN', 'Infinity', '0.0000001', '1e3', null])(
    'geçersiz çarpanı reddeder: %s',
    async (multiplier) => {
      await expect(
        service.create({ ...device, multiplier } as any, 'test'),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('çarpan yoksa 1 kaydeder; seri no baş/son boşluklarını temizler', async () => {
    const result = await service.create(
      { organization_unit_id: '1', serial_no: ' S3 ', role: 'FEEDER' },
      'test',
    );
    expect(result).toMatchObject({ serial_no: 'S3', multiplier: '1' });
  });
  it('silinmiş sayacın seri numarasını da yeniden kullandırmaz', async () => {
    repo.findOne.mockResolvedValue({ ...device, is_deleted: true });
    await expect(service.create(device, 'test')).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { serial_no: 'S3' },
      withDeleted: true,
    });
  });
  it('aynı birime ikinci aktif MAIN eklenmez', async () => {
    repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: '4' });
    await expect(
      service.create({ ...device, role: 'MAIN' }, 'test'),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('FEEDER MAIN yapılırken mevcut MAIN kontrol edilir', async () => {
    repo.findOne
      .mockResolvedValueOnce({ ...device })
      .mockResolvedValueOnce({ id: '4' });
    await expect(
      service.update('3', { role: 'MAIN' }, 'test'),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('pasif MAIN aktifleştirilirken mevcut MAIN kontrol edilir', async () => {
    repo.findOne
      .mockResolvedValueOnce({ ...device, role: 'MAIN', is_active: false })
      .mockResolvedValueOnce({ id: '4' });
    await expect(
      service.update('3', { is_active: true }, 'test'),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('MAIN pasifleştirilirken başka MAIN aramaz', async () => {
    repo.findOne.mockResolvedValueOnce({ ...device, role: 'MAIN' });
    await expect(
      service.update('3', { is_active: false }, 'test'),
    ).resolves.toMatchObject({ is_active: false });
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });
  it.each(['uq_device_serial_no', 'uq_device_active_main_per_unit'])(
    'eşzamanlı yazma yarışını 409 yapar: %s',
    async (constraint) => {
      repo.save.mockRejectedValue({
        driverError: { code: '23505', constraint },
      });
      await expect(service.create(device, 'test')).rejects.toMatchObject({
        status: 409,
      });
    },
  );
  it('DTO sınırında rol ve çarpan doğrulanır', async () => {
    for (const Dto of [CreateDeviceDto, UpdateDeviceDto]) {
      const invalid = Object.assign(new Dto(), {
        organization_unit_id: '1',
        serial_no: 'S1',
        role: 'METER',
        multiplier: null,
      });
      expect((await validate(invalid)).map((e) => e.property)).toEqual(
        expect.arrayContaining(['role', 'multiplier']),
      );
      const valid = Object.assign(new Dto(), {
        organization_unit_id: '1',
        serial_no: 'S1',
        role: 'FEEDER',
        multiplier: '0.000001',
      });
      expect(await validate(valid)).toHaveLength(0);
    }
  });
});
