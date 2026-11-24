import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, DeepPartial, EntityManager, Not } from 'typeorm';

import type { FindOptionsWhere, FindOptionsOrder } from 'typeorm';

import { BaseService } from '@mini-pms/common';

import { DeviceEntity } from './entities/device.entity.js';
import { UnitEntity } from '../units/entities/unit.entity.js';
import type { SimulationDevice } from '@mini-pms/contracts';

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
   * Simülatörün ölçüm üreteceği aktif sayaçları getirir.
   */
  async findMetersForSimulation(): Promise<SimulationDevice[]> {
    const rows = await this.repository
      .createQueryBuilder('device')
      .select('device.id', 'id')
      .addSelect('device.serial_no', 'serialNo')
      .addSelect('device.organization_unit_id', 'organizationUnitId')
      .addSelect(
        `CASE WHEN device.metadata ->> 'simulationProfile' = 'solar'
         THEN 'solar' ELSE 'consumer' END`,
        'simulationProfile',
      )
      // Simülatör yalnız tanımlı sayaç rollerini üretir.
      .where('device.role IN (:...roles)', {
        roles: ['MAIN', 'FEEDER'],
      })
      .andWhere('device.is_active = :isActive', {
        isActive: true,
      })
      .andWhere('device.is_deleted = :isDeleted', {
        isDeleted: false,
      })
      .orderBy('device.id', 'ASC')
      .getRawMany<SimulationDevice>();

    return rows;
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
    const { organization_unit_id, role, metadata } = data;
    const serial_no =
      typeof data.serial_no === 'string' ? data.serial_no.trim() : '';
    this.validateMeterFields(role, data.multiplier ?? '1');
    if (data.multiplier === null)
      throw new BadRequestException('Invalid multiplier');

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
      throw new BadRequestException('Organization unit not found');
    }

    // Pasif bir unit'e yeni cihaz bağlanmasını engelliyoruz.
    if (!unit.is_active) {
      throw new BadRequestException(
        'Device cannot be assigned to an inactive unit',
      );
    }

    // 3. Seri numarası, silinmiş kayıtlar dahil benzersizdir.
    const existingDevice = await deviceRepository.findOne({
      where: { serial_no },
      withDeleted: true,
    });

    if (existingDevice) {
      throw new ConflictException('Device serial number already exists');
    }

    await this.ensureSingleMain(
      deviceRepository,
      organization_unit_id,
      role,
      true,
    );

    // 4. Sadece izin verilen alanlarla entity oluşturuyoruz.
    // Metadata gönderilmediyse boş nesne kullanıyoruz.
    const device = deviceRepository.create({
      organization_unit_id,
      serial_no,
      role,
      multiplier: data.multiplier ?? '1',
      metadata: metadata ?? {},
      created_by,
    });

    // Oluşturulan cihazı veritabanına kaydediyoruz.
    return this.saveMeter(deviceRepository, device);
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
      'multiplier',
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

    if (typeof data.serial_no === 'string')
      data = { ...data, serial_no: data.serial_no.trim() };
    this.validateMeterFields(
      data.role ?? device.role,
      data.multiplier ?? device.multiplier ?? '1',
    );
    if (data.role === null || data.multiplier === null)
      throw new BadRequestException('Invalid role or multiplier');

    // 3. Seri numarası değiştiriliyorsa kontrol ediyoruz.
    if (data.serial_no !== undefined && data.serial_no !== device.serial_no) {
      // Yeni seri numarası boş olamaz.
      if (typeof data.serial_no !== 'string' || data.serial_no.trim() === '') {
        throw new BadRequestException('Invalid serial number');
      }

      // Aynı seri numarası başka bir cihazda kullanılıyor mu?
      const existingDevice = await deviceRepository.findOne({
        where: {
          serial_no: data.serial_no,
        },
        withDeleted: true,
      });

      if (existingDevice && existingDevice.id !== device.id) {
        throw new ConflictException('Device serial number already exists');
      }
    }

    // 4. Role alanı gönderilmişse boş olmamalı.
    if (
      data.role !== undefined &&
      (typeof data.role !== 'string' || data.role.trim() === '')
    ) {
      throw new BadRequestException('Invalid device role');
    }

    // 5. Metadata bir JSON nesnesi olmalı.
    // null veya array kabul etmiyoruz.
    if (
      data.metadata !== undefined &&
      (data.metadata === null ||
        typeof data.metadata !== 'object' ||
        Array.isArray(data.metadata))
    ) {
      throw new BadRequestException('Metadata must be an object');
    }

    // 6. is_active alanı yalnızca true/false olabilir.
    if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
      throw new BadRequestException('is_active must be a boolean');
    }

    // 7. Pasif cihaz yeniden aktif ediliyorsa
    // bağlı olduğu unit'in de aktif olması gerekir.
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

    await this.ensureSingleMain(
      deviceRepository,
      device.organization_unit_id,
      data.role ?? device.role,
      data.is_active ?? device.is_active,
      device.id,
    );

    // 8. Yalnızca istekte bulunan alanları güncelliyoruz.
    // undefined olan alanlar mevcut değerlerini koruyor.
    deviceRepository.merge(device, {
      ...(data.serial_no !== undefined && {
        serial_no: data.serial_no,
      }),
      ...(data.role !== undefined && {
        role: data.role,
      }),
      ...(data.multiplier !== undefined && { multiplier: data.multiplier }),
      ...(data.metadata !== undefined && {
        metadata: data.metadata,
      }),
      ...(data.is_active !== undefined && {
        is_active: data.is_active,
      }),
      updated_by,
    });

    // Güncellenmiş cihazı kaydediyoruz.
    return this.saveMeter(deviceRepository, device);
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
  override async findOne(id: string): Promise<DeviceEntity | null> {
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
      throw new BadRequestException('Page must be a positive integer');
    }

    // Bir istekte en fazla 100 cihaz getirilebilir.
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    // findAndCount hem cihazları hem toplam kayıt sayısını döndürür.
    const [data, total] = await this.repository.findAndCount({
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
  private validateMeterFields(role: unknown, multiplier: unknown): void {
    if (role !== 'MAIN' && role !== 'FEEDER') {
      throw new BadRequestException('role must be MAIN or FEEDER');
    }
    if (
      typeof multiplier !== 'string' ||
      !/^(?:(?:[1-9]\d{0,11})(?:\.\d{1,6})?|0\.(?=\d{0,5}[1-9])\d{1,6})$/.test(
        multiplier,
      )
    ) {
      throw new BadRequestException(
        'multiplier must be a positive decimal string with at most 6 fractional digits',
      );
    }
  }

  private async ensureSingleMain(
    repository: Repository<DeviceEntity>,
    unitId: string,
    role: string,
    active: boolean,
    exceptId?: string,
  ): Promise<void> {
    if (role !== 'MAIN' || !active) return;
    const existing = await repository.findOne({
      where: {
        organization_unit_id: unitId,
        role: 'MAIN',
        is_active: true,
        is_deleted: false,
        ...(exceptId ? { id: Not(exceptId) } : {}),
      },
    });
    if (existing)
      throw new ConflictException('This unit already has an active MAIN meter');
  }

  private async saveMeter(
    repository: Repository<DeviceEntity>,
    device: DeviceEntity,
  ): Promise<DeviceEntity> {
    try {
      return await repository.save(device);
    } catch (error: unknown) {
      const detail = (
        error as { driverError?: { code?: string; constraint?: string } }
      )?.driverError;
      // Ön kontrol yarışları önlemez; unique index son savunmadır.
      if (
        detail?.code === '23505' &&
        detail.constraint === 'uq_device_active_main_per_unit'
      ) {
        throw new ConflictException(
          'This unit already has an active MAIN meter',
        );
      }
      if (
        detail?.code === '23505' &&
        detail.constraint === 'uq_device_serial_no'
      ) {
        throw new ConflictException('Device serial number already exists');
      }
      throw error;
    }
  }
}
