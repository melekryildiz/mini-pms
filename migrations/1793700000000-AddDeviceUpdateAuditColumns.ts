
import {
  MigrationInterface,
  QueryRunner,
} from 'typeorm';

export class AddDeviceUpdateAuditColumns1793700000000
  implements MigrationInterface
{
  name = 'AddDeviceUpdateAuditColumns1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE mini_pms.device
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR NULL
  `);
}
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mini_pms.device
      DROP COLUMN IF EXISTS updated_at,
      DROP COLUMN IF EXISTS updated_by
    `);
  }
}

