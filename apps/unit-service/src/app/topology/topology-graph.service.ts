import {
  Injectable,
} from '@nestjs/common';

import {
  Neo4jService,
} from '@mini-pms/neo4j';

import type {
  UnitEntity,
} from '../units/entities/unit.entity.js';

import type {
  DeviceEntity,
} from '../devices/entities/device.entity.js';

import type {
  UnitTopologyNode,
} from '@mini-pms/contracts';

import {
  mapNeo4jRecords,
} from '@mini-pms/neo4j';

/**
 * PostgreSQL'deki Unit ve Device kayıtlarını Neo4j topology projection'ına
 * yansıtır.
 */
@Injectable()
export class TopologyGraphService {
  
  constructor(
    private readonly neo4jService: Neo4jService,
  ) {}
    /**
   * Verilen Unit'i ve onun altındaki bütün Unit düğümlerini getirir.

   */
  async getUnitTree(
    unitId: string,
  ): Promise<UnitTopologyNode[]> {
    return this.neo4jService.executeRead(
      async (transaction) => {
        const result = await transaction.run(
          `

            MATCH (root:Unit { id: $unitId })


            MATCH path =
              (root)-[:CONTAINS*0..]->(unit:Unit)


            OPTIONAL MATCH
              (parent:Unit)-[:CONTAINS]->(unit)

            RETURN
              unit.id AS id,
              parent.id AS parentId,
              unit.organizationUnitTypeId
                AS organizationUnitTypeId,
              unit.code AS code,
              unit.name AS name,
              unit.isActive AS isActive,
              length(path) AS depth


            ORDER BY depth ASC, id ASC
          `,
          {
            unitId,
          },
        );

        /**
         * Neo4j Record nesnelerini API'nin kullandığı ortak tipe çeviriyoruz.
         *
         * mapNeo4jRecords ayrıca Neo4j Integer gibi özel değerleri normal
         * JavaScript değerlerine dönüştürür.
         */
        return mapNeo4jRecords<UnitTopologyNode>(
          result.records,
          mapUnitTopologyNode,
        );
      },
    );
  }
    /**
   * Root Unit'ten verilen hedef Unit'e kadar olan yolu getirir.
   */
  async getUnitPath(
    unitId: string,
  ): Promise<UnitTopologyNode[]> {
    return this.neo4jService.executeRead(
      async (transaction) => {
        const result = await transaction.run(
          `

            MATCH (target:Unit { id: $unitId })

            MATCH path =
              (root:Unit)-[:CONTAINS*0..]->(target)

            WHERE NOT EXISTS {
              MATCH (:Unit)-[:CONTAINS]->(root)
            }

            WITH nodes(path) AS pathNodes

            UNWIND
              range(0, size(pathNodes) - 1)
              AS position

            WITH
              pathNodes[position] AS unit,
              position

            OPTIONAL MATCH
              (parent:Unit)-[:CONTAINS]->(unit)

            RETURN
              unit.id AS id,
              parent.id AS parentId,
              unit.organizationUnitTypeId
                AS organizationUnitTypeId,
              unit.code AS code,
              unit.name AS name,
              unit.isActive AS isActive,
              position

            ORDER BY position ASC
          `,
          {
            unitId,
          },
        );

        return mapNeo4jRecords<UnitTopologyNode>(
          result.records,
          mapUnitTopologyNode,
        );
      },
    );
  }
    /**
   * PostgreSQL'den alınan güncel Unit ve Device kayıtlarıyla topology
   * projection'ını tamamen yeniden oluşturur.
   * Bütün silme ve yeniden oluşturma işlemleri TEK executeWrite çağrısında,
   * dolayısıyla tek Neo4j transaction içerisinde yapılır.
   *
   * İşlemlerden biri hata verirse transaction rollback olur. Böylece eski
   * graf silinmiş fakat yenisi yarım oluşturulmuş halde bırakılmaz.
   * hata ve tutarszılık duruumlarında kullanırlır.
   */
  async rebuildTopology(
    units: readonly UnitEntity[],
    devices: readonly DeviceEntity[],
  ): Promise<void> {
    
    const unitRows = units.map((unit) => ({
      id: unit.id,
      parentId: unit.parent_id,
      organizationUnitTypeId: unit.organization_unit_type_id,
      code: unit.code,
      name: unit.name,
      isActive: unit.is_active,
    }));

    const deviceRows = devices.map((device) => ({
      id: device.id,
      unitId: device.organization_unit_id,
      serialNo: device.serial_no,
      role: device.role,
      isActive: device.is_active,
    }));

    await this.neo4jService.executeWrite(
      async (transaction) => {
        
        await transaction.run(`
          MATCH (node)
          WHERE node:Unit OR node:Device
          DETACH DELETE node
        `);

        /**
         * PostgreSQL'deki bütün Unit kayıtlarını Neo4j Unit düğümlerine
         * dönüştürüyoruz.
         *
         * Tek tek sorgu göndermek yerine UNWIND kullanmak daha az network
         * isteği ve daha az transaction yükü oluşturur.
         */
        await transaction.run(
          `
            UNWIND $units AS unitData

            MERGE (unit:Unit { id: unitData.id })

            SET unit.code = unitData.code,
                unit.name = unitData.name,
                unit.organizationUnitTypeId =
                  unitData.organizationUnitTypeId,
                unit.isActive = unitData.isActive
          `,
          {
            units: unitRows,
          },
        );

        /**
         * Unit düğümleri oluşturulduktan sonra parent-child ilişkilerini
         * kuruyoruz.
         *
         * Önce düğümleri, sonra ilişkileri oluşturmamız gerekir. Çünkü
         * ilişki kurulurken hem parent hem child Unit mevcut olmalıdır.
         */
        await transaction.run(
          `
            UNWIND $units AS unitData

            WITH unitData
            WHERE unitData.parentId IS NOT NULL

            MATCH (parent:Unit { id: unitData.parentId })
            MATCH (child:Unit { id: unitData.id })

            MERGE (parent)-[:CONTAINS]->(child)
          `,
          {
            units: unitRows,
          },
        );

        /**
         * Device düğümlerini toplu olarak oluşturuyoruz.
         */
        await transaction.run(
          `
            UNWIND $devices AS deviceData

            MERGE (device:Device { id: deviceData.id })

            SET device.serialNo = deviceData.serialNo,
                device.role = deviceData.role,
                device.isActive = deviceData.isActive
          `,
          {
            devices: deviceRows,
          },
        );

        /**
         * Son olarak Unit ile Device arasındaki HAS_DEVICE ilişkilerini
         * oluşturuyoruz.
         */
        await transaction.run(
          `
            UNWIND $devices AS deviceData

            MATCH (unit:Unit { id: deviceData.unitId })
            MATCH (device:Device { id: deviceData.id })

            MERGE (unit)-[:HAS_DEVICE]->(device)
          `,
          {
            devices: deviceRows,
          },
        );
      },
    );
  }
  /**
   * Unit node'unu oluşturur veya günceller.
   *
   * Parent değişebildiği için önce Unit'e gelen eski CONTAINS kenarı silinir,
   * ardından güncel parent_id ile yeni kenar kurulur.
   */
  async upsertUnit(
    unit: UnitEntity,
  ): Promise<void> {
    await this.neo4jService.executeWrite(
      async (transaction) => {
        await transaction.run(
          `
            MERGE (unit:Unit { id: $id })

            SET unit.code = $code,
                unit.name = $name,
                unit.organizationUnitTypeId = $organizationUnitTypeId,
                unit.isActive = $isActive

            WITH unit

            OPTIONAL MATCH (:Unit)-[oldParent:CONTAINS]->(unit)
            DELETE oldParent
          `,
          {
        
            id: unit.id,
            code: unit.code,
            name: unit.name,
            organizationUnitTypeId:
              unit.organization_unit_type_id,
            isActive: unit.is_active,
          },
        );

        /**
         * Root Unit'in parent_id değeri null olur. Eski ilişki yukarıdaki
         * sorguda kaldırıldığı için yeni kenar oluşturmadan çıkabiliriz.
         */
        if (unit.parent_id === null) {
          return;
        }

        await transaction.run(
          `
            MERGE (parent:Unit { id: $parentId })

            // MERGE bir write clause, MATCH ise read clause'dur.
            // Neo4j 5 bu iki aşama arasında scope'u açıkça taşıyan WITH ister.
            WITH parent

            MATCH (unit:Unit { id: $unitId })
            MERGE (parent)-[:CONTAINS]->(unit)
          `,
          {
            parentId: unit.parent_id,
            unitId: unit.id,
          },
        );
      },
    );
  }

  /**
   * Soft delete edilen Unit'i graph projection'ından kaldırır.
   */
  async deleteUnit(
    unitId: string,
  ): Promise<void> {
    await this.neo4jService.executeWrite(
      async (transaction) => {
        await transaction.run(
          `
            MATCH (unit:Unit { id: $unitId })
            DETACH DELETE unit
          `,
          {
            unitId,
          },
        );
      },
    );
  }

  /**
   * Device node'unu oluşturur veya günceller ve değişmez Unit bağlantısını
   * kurar.
   *
   * Domain kuralı:
   * Device oluşturulduktan sonra organization_unit_id değiştirilemez.
   * DeviceService.update() bu alanı izin verilen update alanlarına almaz.
   *
   * Bu nedenle Unit upsert'inden farklı olarak eski HAS_DEVICE kenarını
   * silmiyoruz ve Device'ı başka Unit'e taşımıyoruz.
   */
  async upsertDevice(
    device: DeviceEntity,
  ): Promise<void> {
    await this.neo4jService.executeWrite(
      async (transaction) => {
       
        await transaction.run(
          `
            MERGE (device:Device { id: $id })

            SET device.serialNo = $serialNo,
                device.role = $role,
                device.isActive = $isActive
          `,
          {
            id: device.id,
            serialNo: device.serial_no,
            role: device.role,
            isActive: device.is_active,
          },
        );

        /**
         * organization_unit_id değişmez olduğu için ilişkiyi silip yeniden
         * kurmayız. MERGE aynı kenar zaten varsa ikinci bir kenar oluşturmaz.
         */
        await transaction.run(
          `
            MERGE (unit:Unit { id: $unitId })

            // Unit oluşturulmuş olabileceği için MERGE kullanıyoruz; ardından
            // Device'ı okumadan önce Neo4j 5 sözdizimi gereği WITH ekliyoruz.
            WITH unit

            MATCH (device:Device { id: $deviceId })
            MERGE (unit)-[:HAS_DEVICE]->(device)
          `,
          {
            unitId: device.organization_unit_id,
            deviceId: device.id,
          },
        );
      },
    );
  }

  /**
   * Soft delete edilen Device'ı ve HAS_DEVICE relationship'ini graph
   * projection'ından kaldırır.
   */
  async deleteDevice(
    deviceId: string,
  ): Promise<void> {
    await this.neo4jService.executeWrite(
      async (transaction) => {
        await transaction.run(
          `
            MATCH (device:Device { id: $deviceId })
            DETACH DELETE device
          `,
          {
            deviceId,
          },
        );
      },
    );
  }
}
/**
 * Neo4j Record mapper tarafından normalize edilmiş veriyi ortak topology
 * tipine dönüştürür.
 *
 * Bu fonksiyon query'den dönen alanların gerçekten beklediğimiz tipte
 * olduğunu runtime sırasında da kontrol eder.
 */
function mapUnitTopologyNode(
  data: Readonly<Record<string, unknown>>,
): UnitTopologyNode {
  return {
    id: readString(data, 'id'),

    parentId: readNullableString(
      data,
      'parentId',
    ),

    organizationUnitTypeId: readString(
      data,
      'organizationUnitTypeId',
    ),

    code: readString(data, 'code'),

    name: readString(data, 'name'),

    isActive: readBoolean(
      data,
      'isActive',
    ),
  };
}

/**
 * Zorunlu bir string alanını güvenli biçimde okur.
 */
function readString(
  data: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = data[field];

  if (typeof value !== 'string') {
    throw new TypeError(
      `Neo4j topology field "${field}" must be a string`,
    );
  }

  return value;
}

/**
 * parentId gibi null olabilen string alanını okur.
 */
function readNullableString(
  data: Readonly<Record<string, unknown>>,
  field: string,
): string | null {
  const value = data[field];

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError(
      `Neo4j topology field "${field}" must be a string or null`,
    );
  }

  return value;
}

/**
 * Boolean alanların yanlışlıkla "true" string'i veya 1 gibi farklı
 * değerlerle response'a girmesini engeller.
 */
function readBoolean(
  data: Readonly<Record<string, unknown>>,
  field: string,
): boolean {
  const value = data[field];

  if (typeof value !== 'boolean') {
    throw new TypeError(
      `Neo4j topology field "${field}" must be a boolean`,
    );
  }

  return value;
}
