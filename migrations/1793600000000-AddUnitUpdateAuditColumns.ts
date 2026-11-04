
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitUpdateAuditColumns1793600000000
  implements MigrationInterface
{
  name = 'AddUnitUpdateAuditColumns1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mini_pms"."organization_unit"
      ADD COLUMN "updated_by" VARCHAR NULL,
      ADD COLUMN "updated_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mini_pms"."organization_unit"
      DROP COLUMN "updated_at",
      DROP COLUMN "updated_by"
    `);
  }
}
