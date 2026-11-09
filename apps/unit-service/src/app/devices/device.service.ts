
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
    // BaseService'e Device repository'sini veriyoruz.
    // Böylece ortak veritabanı işlemlerini kullanabiliyoruz.
    super(repository);
  }

  /**
   * CREATE
   * Yeni bir cihaz oluşturur.
   *
   * Cihazın bağlı olduğu unit'i kontrol eder,
   * seri numarasının benzersiz olduğunu doğrular
   * ve cihazı veritabanına kaydeder.
   */
  override async create(
    data: DeepPartial<DeviceEntity>,
    created_by: string,
    manager?: EntityManager,
  ): Promise<DeviceEntity> {

    // Transaction varsa onun EntityManager'ını kullanıyoruz.
    // Böylece cihaz kaydı ve audit log aynı transaction'da
    // gerçekleştirilebilir.
    const deviceRepository = manager
      ? manager.getRepository(DeviceEntity)
      : this.repository;

    const unitRepository = manager
      ? manager.getRepository(UnitEntity)
      : this.repository.manager.getRepository(UnitEntity);

    // İstekten gelen cihaz bilgilerini ayırıyoruz.
    const {
      organization_unit_id,
      serial_no,
      role,
      metadata,
    } = data;

    // 1. Zorunlu alanların gönderildiğini kontrol ediyoruz.
    if (!organization_unit_id || !serial_no || !role) {
      throw new BadRequestException(
        'organization_unit_id, serial_no and role are required',
      );
    }

    // 2. Cihazın bağlanacağı unit veritabanında var mı?
    // Soft delete edilmiş unit'leri kabul etmiyoruz.
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

    // Pasif bir unit'e yeni cihaz bağlanmasını engelliyoruz.
    if (!unit.is_active) {
      throw new BadRequestException(
        'Device cannot be assigned to an inactive unit',
      );
    }

    // 3. Aynı seri numarasına sahip aktif kayıt var mı?
    // Silinmemiş cihazlar arasında tekrar istemiyoruz.
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

    // 4. Sadece izin verilen alanlarla entity oluşturuyoruz.
    // Metadata gönderilmediyse boş nesne kullanıyoruz.
    const device = deviceRepository.create({
      organization_unit_id,
      serial_no,
      role,
      metadata: metadata ?? {},
      created_by,
    });

    // Oluşturulan cihazı veritabanına kaydediyoruz.
    return deviceRepository.save(device);
  }

  /**
   * UPDATE
   * Mevcut bir cihazın bilgilerini günceller.
   *
   * Yalnızca izin verilen alanlar değiştirilebilir.
   * Seri numarası ve unit durumuyla ilgili
   * iş kuralları tekrar kontrol edilir.
   */
  override async update(
    id: string,
    data: DeepPartial<DeviceEntity>,
    updated_by: string,
    manager?: EntityManager,
  ): Promise<DeviceEntity> {

    // Transaction varsa tüm işlemler aynı manager üzerinden yürür.
    const deviceRepository = manager
      ? manager.getRepository(DeviceEntity)
      : this.repository;

    const unitRepository = manager
      ? manager.getRepository(UnitEntity)
      : this.repository.manager.getRepository(UnitEntity);

    // 1. Güncellenecek cihazı buluyoruz.
    const device = await deviceRepository.findOne({
      where: {
        id,
        is_deleted: false,
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    // 2. Güncellenmesine izin verdiğimiz alanları tanımlıyoruz.
    // Örneğin organization_unit_id değiştirilemez.
    const allowedFields = [
      'serial_no',
      'role',
      'metadata',
      'is_active',
    ];

    // İzin verilmeyen bir alan gönderilmiş mi?
    const invalidFields = Object.keys(data).filter(
      (key) => !allowedFields.includes(key),
    );

    if (invalidFields.length > 0) {
      throw new BadRequestException(
        `Fields cannot be updated: ${invalidFields.join(', ')}`,
      );
    }

    // 3. Seri numarası değiştiriliyorsa kontrol ediyoruz.
    if (
      data.serial_no !== undefined &&
      data.serial_no !== device.serial_no
    ) {
      // Yeni seri numarası boş olamaz.
      if (
        typeof data.serial_no !== 'string' ||
        data.serial_no.trim() === ''
      ) {
        throw new BadRequestException(
          'Invalid serial number',
        );
      }

      // Aynı seri numarası başka bir cihazda kullanılıyor mu?
      const existingDevice = await deviceRepository.findOne({
        where: {
          serial_no: data.serial_no,
          is_deleted: false,
        },
      });

      if (
        existingDevice &&
        existingDevice.id !== device.id
      ) {
        throw new ConflictException(
          'Device serial number already exists',
        );
      }
    }

    // 4. Role alanı gönderilmişse boş olmamalı.
    if (
      data.role !== undefined &&
      (
        typeof data.role !== 'string' ||
        data.role.trim() === ''
      )
    ) {
      throw new BadRequestException(
        'Invalid device role',
      );
    }

    // 5. Metadata bir JSON nesnesi olmalı.
    // null veya array kabul etmiyoruz.
    if (
      data.metadata !== undefined &&
      (
        data.metadata === null ||
        typeof data.metadata !== 'object' ||
        Array.isArray(data.metadata)
      )
    ) {
      throw new BadRequestException(
        'Metadata must be an object',
      );
    }

    // 6. is_active alanı yalnızca true/false olabilir.
    if (
      data.is_active !== undefined &&
      typeof data.is_active !== 'boolean'
    ) {
      throw new BadRequestException(
        'is_active must be a boolean',
      );
    }

    // 7. Pasif cihaz yeniden aktif ediliyorsa
    // bağlı olduğu unit'in de aktif olması gerekir.
    if (
      data.is_active === true &&
      !device.is_active
    ) {
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

    // 8. Yalnızca istekte bulunan alanları güncelliyoruz.
    // undefined olan alanlar mevcut değerlerini koruyor.
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

    // Güncellenmiş cihazı kaydediyoruz.
    return deviceRepository.save(device);
  }

  /**
   * SOFT DELETE
   * Cihazı fiziksel olarak silmeden pasif hâle getirir.
   *
   * Audit bilgileri ve silinme tarihi saklanır.
   */
  override async softDelete(
    id: string,
    deleted_by: string,
    manager?: EntityManager,
  ): Promise<boolean> {

    // Transaction varsa aynı manager kullanılır.
    const deviceRepository = manager
      ? manager.getRepository(DeviceEntity)
      : this.repository;

    // Silinmemiş cihazı buluyoruz.
    const device = await deviceRepository.findOne({
      where: {
        id,
        is_deleted: false,
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    // Soft delete alanlarını güncelliyoruz.
    device.is_active = false;
    device.is_deleted = true;
    device.deleted_at = new Date();
    device.deleted_by = deleted_by;
    device.updated_by = deleted_by;

    // Cihaz veritabanında kalır, ancak silinmiş olarak işaretlenir.
    await deviceRepository.save(device);

    return true;
  }

  /**
   * FIND ONE
   * ID ile tek bir cihaz getirir.
   * Soft delete edilmiş cihazları döndürmez.
   */
  override async findOne(
    id: string,
  ): Promise<DeviceEntity | null> {
    return this.repository.findOne({
      where: {
        id,
        is_deleted: false,
      },
    });
  }

  /**
   * FIND ALL
   * Cihazları sayfalama, sıralama ve filtreleme
   * seçenekleriyle listeler.
   */
  override async getList(
    page = 1,
    limit = 10,
    sortBy: keyof DeviceEntity = 'id',
    sortOrder: 'ASC' | 'DESC' = 'ASC',
    filters?: FindOptionsWhere<DeviceEntity>,
  ) {

    // Sayfa numarası pozitif bir tam sayı olmalı.
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException(
        'Page must be a positive integer',
      );
    }

    // Bir istekte en fazla 100 cihaz getirilebilir.
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException(
        'Limit must be between 1 and 100',
      );
    }

    // findAndCount hem cihazları hem toplam kayıt sayısını döndürür.
    const [data, total] =
      await this.repository.findAndCount({
        where: {
          ...filters,
          is_deleted: false,
        },

        // Önceki sayfalardaki kayıtları atlıyoruz.
        skip: (page - 1) * limit,

        // Bu sayfada kaç kayıt getirileceğini belirliyoruz.
        take: limit,

        // Belirtilen alana göre ASC veya DESC sıralıyoruz.
        order: {
          [sortBy]: sortOrder,
        } as FindOptionsOrder<DeviceEntity>,
      });

    return {
      data,
      total,
    };
  }
}
