import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { ReactiveLimitEntity } from './entities/reactive-limit.entity.js';
import { UnitEntity } from '../units/entities/unit.entity.js';

@Injectable()
export class ReactiveLimitService {
  constructor(
    @InjectRepository(ReactiveLimitEntity)
    private readonly repository: Repository<ReactiveLimitEntity>,
  ) {}

  private handleDatabaseError(error: unknown): never {
    const databaseError = error as {
      code?: string;
      driverError?: {
        code?: string;
      };
    } | null;

    const errorCode = databaseError?.driverError?.code ?? databaseError?.code;

    if (errorCode === '23P01') {
      throw new ConflictException(
        'A reactive limit already exists for this unit, type and time range',
      );
    }

    throw error;
  }

  async create(
    data: {
      organization_unit_id: string;
      limit_type: string;
      limit_value: string;
      valid_from: Date;
      valid_to: Date | null;
    },
    manager: EntityManager,
  ): Promise<ReactiveLimitEntity> {
    const unitRepository = manager.getRepository(UnitEntity);
    const limitRepository = manager.getRepository(ReactiveLimitEntity);

    const unit = await unitRepository.findOne({
      where: {
        id: data.organization_unit_id,
        is_deleted: false,
      },
    });

    if (!unit) {
      throw new NotFoundException('Organization unit not found');
    }

    if (!unit.is_active) {
      throw new BadRequestException('Organization unit is inactive');
    }

    if (!/^\d+(?:\.\d+)?$/.test(data.limit_value)) {
      throw new BadRequestException(
        'Limit value must be a non-negative number',
      );
    }

    if (
      !(data.valid_from instanceof Date) ||
      Number.isNaN(data.valid_from.getTime()) ||
      (data.valid_to !== null &&
        (!(data.valid_to instanceof Date) ||
          Number.isNaN(data.valid_to.getTime())))
    ) {
      throw new BadRequestException('Invalid limit dates');
    }

    if (data.valid_to !== null && data.valid_to <= data.valid_from) {
      throw new BadRequestException('valid_to must be greater than valid_from');
    }

    const query = limitRepository
      .createQueryBuilder('limit')
      .where('limit.organization_unit_id = :unitId', {
        unitId: data.organization_unit_id,
      })
      .andWhere('limit.limit_type = :limitType', {
        limitType: data.limit_type,
      })
      .andWhere('(limit.valid_to IS NULL OR limit.valid_to > :newStart)', {
        newStart: data.valid_from,
      });

    if (data.valid_to !== null) {
      query.andWhere('limit.valid_from < :newEnd', {
        newEnd: data.valid_to,
      });
    }

    const overlappingLimit = await query.getOne();

    if (overlappingLimit) {
      throw new ConflictException(
        'A reactive limit already exists for this unit, type and time range',
      );
    }

    const limit = limitRepository.create({
      organization_unit_id: data.organization_unit_id,
      limit_type: data.limit_type,
      limit_value: data.limit_value,
      valid_from: data.valid_from,
      valid_to: data.valid_to,
    });

    try {
      return await limitRepository.save(limit);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async update(
    existingLimit: ReactiveLimitEntity,
    data: {
      limit_value: string;
    },
    manager: EntityManager,
  ): Promise<ReactiveLimitEntity> {
    const repository = manager.getRepository(ReactiveLimitEntity);

    if (
      typeof data.limit_value !== 'string' ||
      !/^\d+(?:\.\d+)?$/.test(data.limit_value)
    ) {
      throw new BadRequestException('Invalid limit value');
    }

    const now = new Date();

    if (
      existingLimit.valid_to !== null &&
      existingLimit.valid_to.getTime() <= now.getTime()
    ) {
      throw new ConflictException('Expired reactive limits cannot be updated');
    }

    if (existingLimit.valid_from.getTime() > now.getTime()) {
      existingLimit.limit_value = data.limit_value;

      try {
        return await repository.save(existingLimit);
      } catch (error) {
        this.handleDatabaseError(error);
      }
    }

    // Aktif limitin orijinal bitiş tarihini sakla.
    const previousValidTo = existingLimit.valid_to;

    // Eski versiyonu güncelleme anında kapat.
    existingLimit.valid_to = now;

    try {
      await repository.save(existingLimit);

      // Yeni versiyonu oluştur.
      const newLimit = repository.create({
        organization_unit_id: existingLimit.organization_unit_id,
        limit_type: existingLimit.limit_type,
        limit_value: data.limit_value,
        valid_from: now,
        valid_to: previousValidTo,
      });

      return await repository.save(newLimit);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async findById(id: string): Promise<ReactiveLimitEntity> {
    const limit = await this.repository.findOne({
      where: { id },
    });

    if (!limit) {
      throw new NotFoundException('Reactive limit not found');
    }

    return limit;
  }

  async findByUnitId(unitId: string): Promise<ReactiveLimitEntity[]> {
    return await this.repository.find({
      where: {
        organization_unit_id: unitId,
      },
      order: {
        valid_from: 'DESC',
      },
    });
  }

  /**
   * Liste ekranı bütün limitleri tek seferde indirmez. Filtre veritabanında,
   * sayfalama SQL seviyesinde uygulanır.
   */
  async getListByUnitId(unitId: string, page = 1, limit = 10) {
    const [data, total] = await this.repository.findAndCount({
      where: { organization_unit_id: unitId },
      order: { valid_from: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  async findActiveByUnitId(unitId: string): Promise<ReactiveLimitEntity[]> {
    const now = new Date();

    return await this.repository
      .createQueryBuilder('limit')
      .where('limit.organization_unit_id = :unitId', {
        unitId,
      })
      .andWhere('limit.valid_from <= :now', { now })
      .andWhere('(limit.valid_to IS NULL OR limit.valid_to > :now)', { now })
      .orderBy('limit.valid_from', 'DESC')
      .getMany();
  }
}
