import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { DeepPartial } from 'typeorm';

import { BaseOrchestrator, Transactional } from '@mini-pms/common';

import { DeviceService } from './device.service.js';
import { DeviceLogEntity } from './entities/device-log.entity.js';

import { DeviceEntity } from './entities/device.entity.js';
import {
  TopologyGraphService,
} from '../topology/topology-graph.service.js';

@Injectable()
export class DeviceOrchestrator extends BaseOrchestrator {
  constructor(
    entityManager: EntityManager,
    private readonly deviceService: DeviceService,
    private readonly topologyGraphService: TopologyGraphService,
  ) {
    super(entityManager);
  }

  @Transactional({
  afterCommit: 'syncDeviceAfterCommit',
})
  async create(
    data: DeepPartial<DeviceEntity>,
    created_by: string,
    manager?: EntityManager,
  ): Promise<DeviceEntity> {
    if (!manager) {
      throw new Error('Transaction manager is required');
    }
    // 1. Birimi oluştur
    const device = await this.deviceService.create(data, created_by, manager);

    const logRepository = manager.getRepository(DeviceLogEntity);

    // 3. CREATE logunu kaydet
    await logRepository.save({
      device_id: device.id,
      action: 'CREATE',
      changes: {
        before: null,
        after: { ...device },
      },
      created_by,
    });

    return device;
  }

  @Transactional({
    afterCommit: 'syncDeviceAfterCommit',
  })
  async update(
    id: string,
    data: DeepPartial<DeviceEntity>,
    updated_by: string,
    manager?: EntityManager,
  ): Promise<DeviceEntity> {
    if (!manager) {
      throw new Error('Transaction manager is required');
    }

    // 1. Güncellemeden önce cihazı bul
    const deviceRepository = manager.getRepository(DeviceEntity);

    const existingDevice = await deviceRepository.findOne({
      where: {
        id,
        is_deleted: false,
      },
    });

    if (!existingDevice) {
      throw new NotFoundException('Device not found');
    }

    // 2. Güncellemeden önceki bilgileri sakla
    const before = { ...existingDevice };

    // 3. DeviceService üzerinden güncelle
    const updatedDevice = await this.deviceService.update(
      id,
      data,
      updated_by,
      manager,
    );

    // 4. UPDATE logunu oluştur
    await manager.getRepository(DeviceLogEntity).save({
      device_id: updatedDevice.id,
      action: 'UPDATE',
      changes: {
        before,
        after: { ...updatedDevice },
      },
      created_by: updated_by,
    });

    return updatedDevice;
  }

  @Transactional({
  afterCommit: 'deleteDeviceAfterCommit',
})
  async softDelete(
    id: string,
    deleted_by: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (!manager) {
      throw new Error('Transaction manager is required');
    }

    const deviceRepository = manager.getRepository(DeviceEntity);

    // 1. Silinmeden önce cihazı bul
    const device = await deviceRepository.findOne({
      where: {
        id,
        is_deleted: false,
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    // 2. Eski bilgileri sakla
    const before = { ...device };

    // 3. DeviceService üzerinden soft delete yap
    const result = await this.deviceService.softDelete(id, deleted_by, manager);

    // 4. Silinmiş cihazın son hâlini getir
    const deletedDevice = await deviceRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    // 5. DELETE logunu kaydet
    await manager.getRepository(DeviceLogEntity).save({
      device_id: id,
      action: 'DELETE',
      changes: {
        before,
        after: deletedDevice ? { ...deletedDevice } : null,
      },
      created_by: deleted_by,
    });

    return result;
  }
    /**
   * Device create veya update transaction'ı commit edildikten sonra çağrılır.
   *
   * Create ve update metotları DeviceEntity döndürdüğü için aynı hook'u
   * kullanabilir.
   */
  protected async syncDeviceAfterCommit(
    device: DeviceEntity,
  ): Promise<void> {
    await this.topologyGraphService.upsertDevice(device);
  }

  /**
   * Device soft delete transaction'ı commit edildikten sonra çağrılır.
   */
  protected async deleteDeviceAfterCommit(
    deleted: boolean,
    id: string,
  ): Promise<void> {
    if (!deleted) {
      return;
    }

    await this.topologyGraphService.deleteDevice(id);
  }

}
