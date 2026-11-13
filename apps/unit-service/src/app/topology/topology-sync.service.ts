import {
  Injectable,
  Logger,
} from '@nestjs/common';

import {
  InjectRepository,
} from '@nestjs/typeorm';

import type {
  Repository,
} from 'typeorm';

import {
  UnitEntity,
} from '../units/entities/unit.entity.js';

import {
  DeviceEntity,
} from '../devices/entities/device.entity.js';

import {
  TopologyGraphService,
} from './topology-graph.service.js';

/**
 * PostgreSQL'deki güncel Unit ve Device kayıtlarını okuyup Neo4j topology
 * projection'ını baştan oluşturan uygulama servisidir.
 */
@Injectable()
export class TopologySyncService {
 
  private readonly logger = new Logger(
    TopologySyncService.name,
  );

  constructor(
    /**
     * Repository'yi "new Repository()" ile oluşturmuyoruz. TypeOrmModule
     * doğru DataSource'a bağlı repository'yi Nest DI üzerinden verir.
     */
    @InjectRepository(UnitEntity)
    private readonly unitRepository: Repository<UnitEntity>,

    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,

   
    private readonly topologyGraphService: TopologyGraphService,
  ) {}

  /**
   * PostgreSQL'i source of truth kabul ederek topology grafını yeniden kurar.
   *
   * Dönüş değerinde senkronize edilen kayıt sayılarını veriyoruz. Böylece CLI
   * komutu veya ileride yazılacak monitoring sistemi kaç kaydın işlendiğini
   * görebilir.
   */
  async sync(): Promise<TopologySyncResult> {
    this.logger.log(
      'Reading topology data from PostgreSQL',
    );

    /**
     * Unit ve Device sorguları birbirine bağlı olmadığı için paralel
     * çalışabilir.
     *
     * Promise.all kullanmazsak önce Unit sorgusunun, sonra Device sorgusunun
     * tamamlanmasını bekleriz. Promise.all ikisini aynı anda başlatır.
     */
    const [units, devices] = await Promise.all([
      this.unitRepository.find({
        /**
         * Soft-delete edilmiş Unit kayıtları topology grafına alınmaz.
         *
         * is_deleted burada açıkça kontrol edilir çünkü uygulama kendi
         * is_deleted kolonunu kullanıyor.
         */
        where: {
          is_deleted: false,
        },

        /**
         * Sıralama Neo4j için zorunlu değildir. Fakat testleri, logları ve
         * problem araştırmayı daha öngörülebilir hale getirir.
         */
        order: {
          id: 'ASC',
        },
      }),

      this.deviceRepository.find({
        /**
         * Soft-delete edilmiş Device kayıtları yeniden oluşturulmamalıdır.
         */
        where: {
          is_deleted: false,
        },

        order: {
          id: 'ASC',
        },
      }),
    ]);

    /**
     * Neo4j'deki HAS_DEVICE ilişkisi için her Device'ın geçerli bir Unit'e
     * bağlı olması gerekir.
     *
     * Unit id'lerini Set içine koyuyoruz. Set.has() yaklaşık O(1) erişim
     * sağlar.
     */
    const unitIds = new Set(
      units.map((unit) => unit.id),
    );

    const orphanDevices = devices.filter(
      (device) =>
        !unitIds.has(device.organization_unit_id),
    );

    /**
     * Silinmemiş bir Device, silinmiş veya bulunamayan bir Unit'e bağlıysa
     * PostgreSQL verisi kendi içinde tutarsızdır.
     *
     * Böyle bir durumda Device'ı sessizce atlamak doğru olmaz. Çünkü komut
     * başarılı görünür fakat PostgreSQL ile Neo4j birebir aynı olmaz.
        * Bu nedenle hata fırlatıyoruz ve senkronizasyonu durduruyoruz.
     */
    if (orphanDevices.length > 0) {
      throw new Error(
        [
          'Topology synchronization stopped.',
          `${orphanDevices.length} active device record(s)`,
          'reference a missing or deleted organization unit.',
        ].join(' '),
      );
    }

    this.logger.log(
      [
        'Rebuilding Neo4j topology:',
        `${units.length} unit(s),`,
        `${devices.length} device(s)`,
      ].join(' '),
    );

    /**
     * Veriler doğrulandıktan sonra graf servisine gönderilir.
     *
     * rebuildTopology içerisindeki bütün Neo4j işlemleri tek transaction
     * içinde çalışır.
     */
    await this.topologyGraphService.rebuildTopology(
      units,
      devices,
    );

    this.logger.log(
      'Neo4j topology rebuild completed',
    );

    return {
      unitCount: units.length,
      deviceCount: devices.length,
    };
  }
}

export interface TopologySyncResult {
  unitCount: number;
  deviceCount: number;
}