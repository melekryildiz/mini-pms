import { Injectable,NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { DeepPartial } from 'typeorm';

import {
  BaseOrchestrator,
  Transactional,
} from '@mini-pms/common';

import { UnitService } from './unit.service.js';
import { UnitEntity } from './entities/unit.entity.js';
import { OrganizationUnitLogEntity } from './entities/organization-unit-log.js';

@Injectable()
export class UnitOrchestrator extends BaseOrchestrator {
  constructor(
    entityManager: EntityManager,
    private readonly unitService: UnitService,
  ) {
    super(entityManager);
  }

  @Transactional()
  async create(
    data: DeepPartial<UnitEntity>,
    created_by: string,
    manager?: EntityManager,
  ): Promise<UnitEntity> {
    if (!manager) {
      throw new Error('Transaction manager is required');
    }

    // 1. Birimi oluştur
    const unit = await this.unitService.create(
      data,
      created_by,
      manager,
    );

    // 2. Transaction'a bağlı log repository'sini al
    const logRepository = manager.getRepository(
      OrganizationUnitLogEntity,
    );

    // 3. CREATE logunu kaydet
    await logRepository.save({
      organization_unit_id: unit.id,
      action: 'CREATE',
      changes: {
        before: null,
        after: { ...unit },
      },
      created_by,
    });

    return unit;
  }

    @Transactional()
    async update(
    id: string,
    data: DeepPartial<UnitEntity>,
    updated_by: string,
    manager?: EntityManager,
    ): Promise<UnitEntity> {

    if (!manager) {
        throw new Error('Transaction manager is required');
    }

    const repository = manager.getRepository(UnitEntity);

    // 1. Güncelleme öncesindeki kaydı getir
    const existingUnit = await repository.findOne({
        where: { id, is_deleted: false },
        lock: { mode: 'pessimistic_write' },
    });

    if (!existingUnit) {
        throw new NotFoundException('Unit not found');
    }

    // 2. BEFORE snapshot'ını oluştur
    const before = { ...existingUnit };

    // 3. UnitService üzerinden güncelle
    const updatedUnit = await this.unitService.update(
        id,
        data,
        updated_by,
        manager,
    );

    if (!updatedUnit) {
        throw new NotFoundException('Unit not found');
    }

    // 4. AFTER snapshot'ını oluştur
    const after = { ...updatedUnit };

    // 5. Log kaydını oluştur
    await manager.getRepository(
        OrganizationUnitLogEntity,
    ).save({
        organization_unit_id: updatedUnit.id,
        action: 'UPDATE',
        changes: {
        before,
        after,
        },
        created_by: updated_by,
    });

    return updatedUnit;
    }
    @Transactional()
    async softDelete(
    id: string,
    deleted_by: string,
    manager?: EntityManager,
    ): Promise<boolean> {

    if (!manager) {
        throw new Error('Transaction manager is required');
    }

    const repository = manager.getRepository(UnitEntity);
    console.log('DELETE ID:', id);
    // Silmeden önceki durumu al
    const unit = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
    });
    console.log('FOUND UNIT:', unit);


    if (!unit) {
        throw new NotFoundException('Unit not found');
    }

    const before = { ...unit };

    // Soft delete işlemini gerçekleştir
    const deleted = await this.unitService.softDelete(
        id,
        deleted_by,
        manager,
    );
    console.log('SOFT DELETE RESULT:', deleted);

    if (!deleted) {
        throw new NotFoundException('Unit not found');
    }

    // Güncellenmiş kaydı tekrar getir
   const updatedUnit = await repository.findOne({
    where: { id },
    withDeleted: true,
    });

    if (!updatedUnit) {
        throw new NotFoundException('Unit not found');
    }

    const after = { ...updatedUnit };

    // DELETE logunu oluştur
    await manager.getRepository(
        OrganizationUnitLogEntity,
    ).save({
        organization_unit_id: id,
        action: 'DELETE',
        changes: {
        before,
        after,
        },
        created_by: deleted_by,
    });

    return true;
    }
}