import {
  Module,
} from '@nestjs/common';

import {
  TypeOrmModule,
} from '@nestjs/typeorm';

import {
  UnitEntity,
} from '../units/entities/unit.entity.js';

import {
  DeviceEntity,
} from '../devices/entities/device.entity.js';

import {
  TopologyGraphService,
} from './topology-graph.service.js';

import {
  TopologySyncService,
} from './topology-sync.service.js';

/**
 * Unit Service'in graph projection işlemlerini sağlayan feature modülü.
 */
@Module({
  imports: [
    /**
     * TopologySyncService PostgreSQL'den Unit ve Device kayıtlarını okuyacağı
     * için bu iki entity'nin repository provider'larını modüle kaydediyoruz.
     *
     * forFeature tablo oluşturmaz ve yeni database bağlantısı açmaz. AppModule
     * içindeki mevcut TypeORM DataSource üzerinden iki repository üretir.
     */
    TypeOrmModule.forFeature([
      UnitEntity,
      DeviceEntity,
    ]),
  ],

  providers: [
    TopologyGraphService,
    TopologySyncService,
  ],

  /**
   * TopologyGraphService UnitOrchestrator ve DeviceOrchestrator tarafından;
   * TopologySyncService ise sync-topology CLI giriş noktası tarafından
   * kullanılacağı için ikisini de modül dışına açıyoruz.
   */
  exports: [
    TopologyGraphService,
    TopologySyncService,
  ],
})
export class TopologyModule {}
