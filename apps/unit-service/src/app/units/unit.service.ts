import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeepPartial, EntityManager } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { BaseService } from '@mini-pms/common';
import { UnitEntity } from './entities/unit.entity.js';
import type { FindOptionsWhere } from 'typeorm';

@Injectable()
export class UnitService extends BaseService<UnitEntity> {
  constructor(
    @InjectRepository(UnitEntity)
    repository: Repository<UnitEntity>,

  ) {
    super(repository);
  }
  
 override async create(
    data: DeepPartial<UnitEntity>,
    created_by: string,
    manager?: EntityManager,
    ): Promise<UnitEntity> {

    const unitType = data.organization_unit_type_id;
    const repository = manager
        ? manager.getRepository(UnitEntity)
        : this.repository;

    // 1. SUBSTATION üst birime sahip olamaz
    if (unitType === '1') {
        if (data.parent_id != null) {
        throw new BadRequestException(
            'SUBSTATION cannot have a parent unit',
        );
        }
    }

    // 2. TRANSFORMER ve FEEDER üst birime sahip olmalı
    if (unitType === '2' || unitType === '3') {

        if (data.parent_id == null) {
        throw new BadRequestException(
            'Parent unit is required',
        );
        }

        // Parent kaydını veritabanından getir
        const parent = await repository.findOne({
            where: {
                id: data.parent_id,
            },
        });

        if (!parent) {
        throw new BadRequestException(
            'Parent unit not found',
        );
        }

        if (!parent.is_active || parent.is_deleted) {
        throw new BadRequestException(
            'Parent unit must be active',
        );
        }

        // 3. TRANSFORMER yalnızca SUBSTATION altına bağlanır
        if (
        unitType === '2' &&
        parent.organization_unit_type_id !== '1'
        ) {
        throw new BadRequestException(
            'TRANSFORMER must belong to a SUBSTATION',
        );
        }

        // 4. FEEDER yalnızca TRANSFORMER altına bağlanır
        if (
        unitType === '3' &&
        parent.organization_unit_type_id !== '2'
        ) {
        throw new BadRequestException(
            'FEEDER must belong to a TRANSFORMER',
        );
        }
    }

    const unit = repository.create({
        ...data,
        created_by,
    });

    return repository.save(unit);
    }

    override async update(
    id: string,
    data: DeepPartial<UnitEntity>,
    updated_by: string,
    manager?: EntityManager,
    ): Promise<UnitEntity | null> {

    const repository = manager
        ? manager.getRepository(UnitEntity)
        : this.repository;

    const unit = await repository.findOne({
        where: { id },
    });

        
    if (!unit) {
        return null;
    }

    if (unit.is_deleted) {
        throw new BadRequestException(
        'Deleted units cannot be updated',
        );
    }

    if (data.is_active === false) {
        const activeChildCount = await repository.count({
        where: {
            parent_id: id,
            is_active: true,
            is_deleted: false,
        },
        });

        if (activeChildCount > 0) {
        throw new BadRequestException(
            'Unit with active children cannot be deactivated',
        );
        }
    }

    const { id: _ignoredId, ...allowedData } = data;

        repository.merge(unit, allowedData);
        unit.updated_by = updated_by;

        
        return repository.save(unit);
    }

    override async softDelete(
        id: string,
        deleted_by: string,
        manager?: EntityManager,
        ): Promise<boolean> {

        const repository = manager
            ? manager.getRepository(UnitEntity)
            : this.repository;

        const unit = await repository.findOne({
            where: { id },
        });

        if (!unit) {
            return false;
        }

        if (unit.is_deleted) {
            throw new BadRequestException(
            'Unit is already deleted',
            );
        }

        if (unit.is_active) {
            throw new BadRequestException(
            'Active units cannot be deleted',
            );
        }

        const ChildCount = await this.repository.count({
            where: {
            parent_id: id,
            is_deleted: false,
            },
        });

        if (ChildCount > 0) {
            throw new BadRequestException(
            'Unit with children cannot be deleted',
            );
        }

        unit.is_deleted = true;
        unit.is_active = false;
        unit.deleted_at = new Date();
        unit.deleted_by = deleted_by;

        await repository.save(unit);

        return true;
    }
    override async getList(
        page: number = 1,
        limit: number = 10,
        sortBy: keyof UnitEntity = 'id',
        sortOrder: 'ASC' | 'DESC' = 'ASC',
        filters?: FindOptionsWhere<UnitEntity>,
        ): Promise<{ data: UnitEntity[]; total: number }> {
        return super.getList(
            page,
            limit,
            sortBy,
            sortOrder,
            {
            ...filters,
            is_deleted: false,
            },
        );
        }
    override async findOne(
        id: string,
    ): Promise<UnitEntity | null> {
        return this.repository.findOne({
            where: {
            id,
            is_deleted: false,
            },
        });
    }
}