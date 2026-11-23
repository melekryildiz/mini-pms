import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeepPartial, EntityManager } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { BaseService } from '@mini-pms/common';
import { UnitEntity } from './entities/unit.entity.js';
import { OrganizationUnitLogEntity } from './entities/organization-unit-log.js';
import type { FindOptionsWhere } from 'typeorm';
import type {
  UnitNavigationNode,
  UnitTopologyNode,
} from '@mini-pms/contracts';

@Injectable()
export class UnitService extends BaseService<UnitEntity> {
  constructor(
    @InjectRepository(UnitEntity)
    repository: Repository<UnitEntity>,
    @InjectRepository(OrganizationUnitLogEntity)
    private readonly logRepository: Repository<OrganizationUnitLogEntity>,
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
        throw new BadRequestException('SUBSTATION cannot have a parent unit');
      }
    }

    // 2. TRANSFORMER ve FEEDER üst birime sahip olmalı
    if (unitType === '2' || unitType === '3') {
      if (data.parent_id == null) {
        throw new BadRequestException('Parent unit is required');
      }

      // Parent kaydını veritabanından getir
      const parent = await repository.findOne({
        where: {
          id: data.parent_id,
        },
      });

      if (!parent) {
        throw new BadRequestException('Parent unit not found');
      }

      if (!parent.is_active || parent.is_deleted) {
        throw new BadRequestException('Parent unit must be active');
      }

      // 3. TRANSFORMER yalnızca SUBSTATION altına bağlanır
      if (unitType === '2' && parent.organization_unit_type_id !== '1') {
        throw new BadRequestException(
          'TRANSFORMER must belong to a SUBSTATION',
        );
      }

      // 4. FEEDER yalnızca TRANSFORMER altına bağlanır
      if (unitType === '3' && parent.organization_unit_type_id !== '2') {
        throw new BadRequestException('FEEDER must belong to a TRANSFORMER');
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
      throw new BadRequestException('Deleted units cannot be updated');
    }

    /**
     * parent_id yalnızca istek içinde açıkça gönderilmiş ve mevcut değerden
     * farklıysa yeni parent atamasını doğrularız.
     *
     * undefined "parent alanına dokunma" anlamına gelir. null ise Unit'i
     * root yapma isteğidir ve yalnızca SUBSTATION için geçerlidir.
     */
    if (
      data.parent_id !== undefined &&
      data.parent_id !== unit.parent_id
    ) {
      if (data.parent_id === id) {
        throw new BadRequestException(
          'Unit cannot be its own parent',
        );
      }

      const unitType = unit.organization_unit_type_id;

      /**
       * SUBSTATION hiyerarşinin root seviyesidir. Başka bir Unit'in altına
       * taşınamaz; yalnızca parent_id=null olabilir.
       */
      if (unitType === '1' && data.parent_id !== null) {
        throw new BadRequestException(
          'SUBSTATION cannot have a parent unit',
        );
      }

      /**
       * TRANSFORMER ve FEEDER root olamaz; her zaman uygun tipte aktif bir
       * parent'a bağlı olmalıdır.
       */
      if (unitType === '2' || unitType === '3') {
        if (data.parent_id === null) {
          throw new BadRequestException(
            'Parent unit is required',
          );
        }

        const parent = await repository.findOne({
          where: {
            id: data.parent_id,
            is_deleted: false,
          },
        });

        if (!parent) {
          throw new BadRequestException('Parent unit not found');
        }

        if (!parent.is_active) {
          throw new BadRequestException(
            'Parent unit must be active',
          );
        }

        if (
          unitType === '2' &&
          parent.organization_unit_type_id !== '1'
        ) {
          throw new BadRequestException(
            'TRANSFORMER must belong to a SUBSTATION',
          );
        }

        if (
          unitType === '3' &&
          parent.organization_unit_type_id !== '2'
        ) {
          throw new BadRequestException(
            'FEEDER must belong to a TRANSFORMER',
          );
        }
      }
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

    /**
     * Güncellenebilir alanları açıkça seçiyoruz.
     *
     * organization_unit_type_id değiştirilemez. Tip sabit kaldığı için
     * SUBSTATION → TRANSFORMER → FEEDER seviye kuralı graph cycle oluşmasını
     * da engeller.
     */
    const allowedData: DeepPartial<UnitEntity> = {
      ...(data.parent_id !== undefined && {
        parent_id: data.parent_id,
      }),
      ...(data.code !== undefined && {
        code: data.code,
      }),
      ...(data.name !== undefined && {
        name: data.name,
      }),
      ...(data.is_active !== undefined && {
        is_active: data.is_active,
      }),
    };

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
      throw new BadRequestException('Unit is already deleted');
    }

    if (unit.is_active) {
      throw new BadRequestException('Active units cannot be deleted');
    }

    const ChildCount = await this.repository.count({
      where: {
        parent_id: id,
        is_deleted: false,
      },
    });

    if (ChildCount > 0) {
      throw new BadRequestException('Unit with children cannot be deleted');
    }

    unit.is_deleted = true;
    unit.is_active = false;
    unit.deleted_at = new Date();
    unit.deleted_by = deleted_by;

    await repository.save(unit);

    return true;
  }
  override async getList(
      page = 1,
      limit = 10,
    sortBy: keyof UnitEntity = 'id',
    sortOrder: 'ASC' | 'DESC' = 'ASC',
    filters?: FindOptionsWhere<UnitEntity>,
  ): Promise<{ data: UnitEntity[]; total: number }> {
    return super.getList(page, limit, sortBy, sortOrder, {
      ...filters,
      is_deleted: false,
    });
  }
  override async findOne(id: string): Promise<UnitEntity | null> {
    return this.repository.findOne({
      where: {
        id,
        is_deleted: false,
      },
    });
  }
  /**
 * Topoloji ekranının ilk açılışında yalnız root Unit getirir.
 * parent_id değeri null olan, silinmemiş Unit
 * bütün ağacı almak yerine yalnızca
 * root seviyesini lazy-loading
 */
async getNavigationRoots(): Promise<UnitNavigationNode[]> {
  const rows =
    await this.repository.query<UnitNavigationSqlRow[]>(
      `
        SELECT
          unit.id::text AS "id",
          unit.parent_id::text AS "parentId",
          unit.organization_unit_type_id::text
            AS "organizationUnitTypeId",
          unit.code AS "code",
          unit.name AS "name",
          unit.is_active AS "isActive",

          /**
           * EXISTS yalnızca en az bir aktif kayıt bulunup bulunmadığını
           * kontrol eder. PostgreSQL ilk eşleşmede aramayı durdurabilir.
           */
          EXISTS (
            SELECT 1
            FROM mini_pms.organization_unit AS child
            WHERE child.parent_id = unit.id
              AND child.is_deleted = false
          ) AS "hasChildren"

        FROM mini_pms.organization_unit AS unit

        WHERE unit.parent_id IS NULL
          AND unit.is_deleted = false

        ORDER BY unit.code ASC
      `,
    );

  return rows;
}

/**
 * Bir Unit'in yalnızca doğrudan çocuklarını getirir.
 *
 * Recursive CTE kullanmıyoruz. Kullanıcı hangi düğümü açarsa yalnızca o
 * düğümün bir alt seviyesi veritabanından okunur.
 */
async getNavigationChildren(
  parentId: string,
): Promise<UnitNavigationNode[]> {
  const rows =
    await this.repository.query<UnitNavigationSqlRow[]>(
      `
        SELECT
          unit.id::text AS "id",
          unit.parent_id::text AS "parentId",
          unit.organization_unit_type_id::text
            AS "organizationUnitTypeId",
          unit.code AS "code",
          unit.name AS "name",
          unit.is_active AS "isActive",

          EXISTS (
            SELECT 1
            FROM mini_pms.organization_unit AS child
            WHERE child.parent_id = unit.id
              AND child.is_deleted = false
          ) AS "hasChildren"

        FROM mini_pms.organization_unit AS unit

        WHERE unit.parent_id = $1
          AND unit.is_deleted = false

        ORDER BY unit.code ASC
      `,
      [parentId],
    );

  return rows;
}

/**
 * Unit kodunun tamamı veya bir bölümüyle arama yapar
 */
async searchNavigationByCode(
  code: string,
  limit: number,
): Promise<UnitNavigationNode[]> {
  /**
   * Kullanıcının yazdığı % ve _ karakterlerinin SQL wildcard olarak
   * davranmasını engelliyoruz
   */
  const escapedCode = this.escapeLikePattern(code.trim());

  const rows =
    await this.repository.query<UnitNavigationSqlRow[]>(
      `
        SELECT
          unit.id::text AS "id",
          unit.parent_id::text AS "parentId",
          unit.organization_unit_type_id::text
            AS "organizationUnitTypeId",
          unit.code AS "code",
          unit.name AS "name",
          unit.is_active AS "isActive",

          EXISTS (
            SELECT 1
            FROM mini_pms.organization_unit AS child
            WHERE child.parent_id = unit.id
              AND child.is_deleted = false
          ) AS "hasChildren"

        FROM mini_pms.organization_unit AS unit

        WHERE unit.code ILIKE $1 ESCAPE '\\'
          AND unit.is_deleted = false

        /**
         * Tam eşleşmeyi önce, kod içinde geçen diğer sonuçları sonra gösterir.
         * Aynı gruptaki kayıtlar code alanına göre kararlı biçimde sıralanır.
         */
        ORDER BY
          CASE
            WHEN LOWER(unit.code) = LOWER($2) THEN 0
            ELSE 1
          END,
          unit.code ASC

        LIMIT $3
      `,
      [
        `%${escapedCode}%`,
        code.trim(),
        limit,
      ],
    );

  return rows;
}

/**
 * PostgreSQL ILIKE pattern karakterlerini literal karaktere dönüştürür.
 */
private escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}
    /**
   * Verilen Unit'i ve onun bütün alt birimlerini PostgreSQL recursive CTE
   * kullanarak getirir.
   */
  async getUnitTreeWithCte(
    unitId: string,
  ): Promise<UnitTopologyNode[]> {

    const rows =
      await this.repository.query<UnitTopologySqlRow[]>(
        `
          WITH RECURSIVE unit_tree AS (
            /**
             * Anchor bölüm:
             * Kullanıcının istediği başlangıç Unit'i.
             */
            SELECT
              unit.id,
              unit.parent_id,
              unit.organization_unit_type_id,
              unit.code,
              unit.name,
              unit.is_active,

              0 AS depth,

              /**
               * visited_ids cycle koruması
               * için kullanılır.
               */
              ARRAY[unit.id]::bigint[] AS visited_ids

            FROM mini_pms.organization_unit AS unit

            WHERE unit.id = $1
              AND unit.is_deleted = false

            UNION ALL

            /**
             * Recursive bölüm:
             * Bir önceki seviyedeki Unit'lerin çocuklarını bulur.
             */
            SELECT
              child.id,
              child.parent_id,
              child.organization_unit_type_id,
              child.code,
              child.name,
              child.is_active,
              parent_tree.depth + 1 AS depth,
              parent_tree.visited_ids || child.id
                AS visited_ids

            FROM mini_pms.organization_unit AS child

            INNER JOIN unit_tree AS parent_tree
              ON child.parent_id = parent_tree.id

            WHERE child.is_deleted = false

              /**
               * veri recursive
               * sorguyu sonsuz döngüye sokmasın diye daha önce ziyaret edilen
               * id'yi tekrar eklemiyoruz.
               */
              AND NOT (
                child.id = ANY(parent_tree.visited_ids)
              )
          )

          SELECT
            id::text AS "id",
            parent_id::text AS "parentId",
            organization_unit_type_id::text
              AS "organizationUnitTypeId",
            code AS "code",
            name AS "name",
            is_active AS "isActive"

          FROM unit_tree

          ORDER BY visited_ids ASC
        `,
        [unitId],
      );

    return rows;
  }
    /**
   * Verilen Unit'ten parent_id üzerinden yukarı çıkarak root Unit'e ulaşır.
   *
   * CTE hedef Unit'ten root'a doğru ilerler; sonuç ise API'nin beklediği
   * root → target sırasında döndürülür.
   *
   * Örnek:
   *
   * SUBSTATION → TRANSFORMER → FEEDER
   */
  async getUnitPathWithCte(
    unitId: string,
  ): Promise<UnitTopologyNode[]> {
    const rows =
      await this.repository.query<UnitTopologySqlRow[]>(
        `
          WITH RECURSIVE unit_path AS (
            /**
             * Anchor bölüm:
             * Yolunu istediğimiz hedef Unit ile başlarız.
             */
            SELECT
              unit.id,
              unit.parent_id,
              unit.organization_unit_type_id,
              unit.code,
              unit.name,
              unit.is_active,

              /**
               * Hedef Unit için depth sıfırdır.
               * Her parent seviyesinde bir artırılır.
               */
              0 AS depth,

              /**
               * Aynı Unit'in tekrar ziyaret edilmesini önleyen id listesi.
               */
              ARRAY[unit.id]::bigint[] AS visited_ids

            FROM mini_pms.organization_unit AS unit

            WHERE unit.id = $1
              AND unit.is_deleted = false

            UNION ALL

            /**
             * Recursive bölüm:
             * Mevcut satırın parent_id değerinden parent Unit'i bulur.
             */
            SELECT
              parent.id,
              parent.parent_id,
              parent.organization_unit_type_id,
              parent.code,
              parent.name,
              parent.is_active,
              child_path.depth + 1 AS depth,
              child_path.visited_ids || parent.id
                AS visited_ids

            FROM mini_pms.organization_unit AS parent

            INNER JOIN unit_path AS child_path
              ON parent.id = child_path.parent_id

            WHERE parent.is_deleted = false

              /**
               * Bozuk bir parent döngüsünde recursive sorgunun sonsuza kadar
               * devam etmesini engeller.
               */
              AND NOT (
                parent.id = ANY(child_path.visited_ids)
              )
          )

          SELECT
            id::text AS "id",
            parent_id::text AS "parentId",
            organization_unit_type_id::text
              AS "organizationUnitTypeId",
            code AS "code",
            name AS "name",
            is_active AS "isActive"

          FROM unit_path

          ORDER BY depth DESC
        `,
        [unitId],
      );

    return rows;
  }
  /**
   * Birim detay ekranındaki değişiklik zaman çizelgesini getirir. Audit tablosu
   * ayrı tutulduğu için ana entity sorgusuna ağır bir relation eklemiyoruz.
   */
  async getHistory(
    unitId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: OrganizationUnitLogEntity[]; total: number }> {
    const [data, total] = await this.logRepository.findAndCount({
      where: { organization_unit_id: unitId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }
}
type UnitTopologySqlRow = UnitTopologyNode;
type UnitNavigationSqlRow = UnitNavigationNode;
