
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReactiveLimitExclusionConstraint1793800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;
    `);

    await queryRunner.query(`
      ALTER TABLE "mini_pms"."reactive_limit_config"
      ADD CONSTRAINT "excl_reactive_limit_overlap"
      EXCLUDE USING gist (
        "organization_unit_id" WITH =,
        "limit_type" WITH =,
        tstzrange(
          "valid_from",
          "valid_to",
          '[)'
        ) WITH &&
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mini_pms"."reactive_limit_config"
      DROP CONSTRAINT "excl_reactive_limit_overlap";
    `);
  }
}
