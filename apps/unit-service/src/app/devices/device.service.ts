
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DeepPartial,
  EntityManager,
} from 'typeorm';

import type {
  FindOptionsWhere,
  FindOptionsOrder,
} from 'typeorm';

import { BaseService } from '@mini-pms/common';

import { DeviceEntity } from './entities/device.entity.js';
import { UnitEntity } from '../units/entities/unit.entity.js';

@Injectable()
export class DeviceService extends BaseService<DeviceEntity> {
  constructor(
    @InjectRepository(DeviceEntity)
    repository: Repository<DeviceEntity>,
  ) {
    super(repository);
  }

  override async create(
    data: DeepPartial<DeviceEntity>,
    created_by: string,
    manager?: EntityManager,
  ): Promise<DeviceEntity> {
    const deviceRepository = manager
      ? manager.getRepository(DeviceEntity)
      : this.repository;

    const unitRepository = manager
      ? manager.getRepository(UnitEntity)
      : this.repository.manager.getRepository(UnitEntity);

    // 1. Zorunlu alanları kontrol et
    const { organization_unit_id, serial_no, role, metadata } = data;

    if (!organization_unit_id || !serial_no || !role) {
      throw new BadRequestException(
        'organization_unit_id, serial_no and role are required',
      );
    }

    // 2. Organization Unit kontrolü
    const unit = await unitRepository.findOne({
      where: {
        id: organization_unit_id,
        is_deleted: false,
      },
    });

    if (!unit) {
      throw new BadRequestException(
        'Organization unit not found',
      );
    }

    if (!unit.is_active) {
      throw new BadRequestException(
        'Device cannot be assigned to an inactive unit',
      );
    }

    // 3. Seri numarası kontrolü
    const existingDevice = await deviceRepository.findOne({
      where: {
        serial_no,
        is_deleted: false,
      },
    });

    if (existingDevice) {
      throw new ConflictException(
        'Device serial number already exists',
      );
    }

    // 4. Yalnızca izin verilen alanları kaydet
    const device = deviceRepository.create({
      organization_unit_id,
      serial_no,
      role,
      metadata: metadata ?? {},
      created_by,
    });

    return deviceRepository.save(device);
  }


override async update(
  id: string,
  data: DeepPartial<DeviceEntity>,
  updated_by: string,
  manager?: EntityManager,
): Promise<DeviceEntity> {
  const deviceRepository = manager
    ? manager.getRepository(DeviceEntity)
    : this.repository;

  const unitRepository = manager
    ? manager.getRepository(UnitEntity)
    : this.repository.manager.getRepository(UnitEntity);

  // 1. Cihazı bul
  const device = await deviceRepository.findOne({
    where: {
      id,
      is_deleted: false,
    },
  });

    if (!device) {
        throw new NotFoundException('Device not found');
    }

    // 2. Güncellenmesine izin verilen alanlar
    const allowedFields = [
        'serial_no',
        'role',
        'metadata',
        'is_active',
    ];

    const invalidFields = Object.keys(data).filter(
        (key) => !allowedFields.includes(key),
    );

    if (invalidFields.length > 0) {
        throw new BadRequestException(
        `Fields cannot be updated: ${invalidFields.join(', ')}`,
        );
    }

    // 3. Seri numarası değişiyorsa kontrol et
    if (
        data.serial_no !== undefined &&
        data.serial_no !== device.serial_no
    ) {
        if (
        typeof data.serial_no !== 'string' ||
        data.serial_no.trim() === ''
        ) {
        throw new BadRequestException('Invalid serial number');
        }

        const existingDevice = await deviceRepository.findOne({
        where: {
            serial_no: data.serial_no,
            is_deleted: false,
        },
        });

        if (existingDevice && existingDevice.id !== device.id) {
        throw new ConflictException(
            'Device serial number already exists',
        );
        }
    }

    // 4. Role değişiyorsa boş olamaz
    if (data.role !== undefined) {
        if (
        typeof data.role !== 'string' ||
        data.role.trim() === ''
        ) {
        throw new BadRequestException('Invalid device role');
        }
    }

    // 5. Metadata nesne olmalı
    if (data.metadata !== undefined) {
        if (
        data.metadata === null ||
        typeof data.metadata !== 'object' ||
        Array.isArray(data.metadata)
        ) {
        throw new BadRequestException(
            'Metadata must be an object',
        );
        }
    }

    // 6. is_active boolean olmalı
    if (
        data.is_active !== undefined &&
        typeof data.is_active !== 'boolean'
    ) {
        throw new BadRequestException(
        'is_active must be a boolean',
        );
    }

    // 7. Cihaz yeniden aktifleştiriliyorsa unit kontrolü
    if (data.is_active === true && !device.is_active) {
        const unit = await unitRepository.findOne({
        where: {
            id: device.organization_unit_id,
            is_deleted: false,
        },
        });

        if (!unit || !unit.is_active) {
        throw new BadRequestException(
            'Cannot activate device: organization unit is inactive or deleted',
        );
        }
    }

    // 8. Yalnızca izin verilen alanları güncelle
    deviceRepository.merge(device, {
        ...(data.serial_no !== undefined && {
        serial_no: data.serial_no,
        }),
        ...(data.role !== undefined && {
        role: data.role,
        }),
        ...(data.metadata !== undefined && {
        metadata: data.metadata,
        }),
        ...(data.is_active !== undefined && {
        is_active: data.is_active,
        }),
        updated_by,
    });

    return deviceRepository.save(device);
    }


override async softDelete(
  id: string,
  deleted_by: string,
  manager?: EntityManager,
): Promise<boolean> {
  const deviceRepository = manager
    ? manager.getRepository(DeviceEntity)
    : this.repository;

  // 1. Silinmemiş cihazı bul
  const device = await deviceRepository.findOne({
    where: {
      id,
      is_deleted: false,
    },
  });

  if (!device) {
    throw new NotFoundException('Device not found');
  }

  // 2. Soft delete alanlarını güncelle
  device.is_active = false;
  device.is_deleted = true;
  device.deleted_at = new Date();
  device.deleted_by = deleted_by;
  device.updated_by = deleted_by;

  // 3. Veritabanına kaydet
  await deviceRepository.save(device);

  return true;
}
override async findOne(id: string): Promise<DeviceEntity | null> {
  return this.repository.findOne({
    where: {
      id,
      is_deleted: false,
    },
  });
}

override async getList(
  page = 1,
  limit = 10,
  sortBy: keyof DeviceEntity = 'id',
  sortOrder: 'ASC' | 'DESC' = 'ASC',
  filters?: FindOptionsWhere<DeviceEntity>,
) {
  if (!Number.isInteger(page) || page < 1) {
    throw new BadRequestException(
      'Page must be a positive integer',
    );
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new BadRequestException(
      'Limit must be between 1 and 100',
    );
  }

  const [data, total] = await this.repository.findAndCount({
    where: {
      ...filters,
      is_deleted: false,
    },
    skip: (page - 1) * limit,
    take: limit,
    order: {
      [sortBy]: sortOrder,
    } as FindOptionsOrder<DeviceEntity>,
  });

  return { data, total };
}

}
