import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceMeterDefinition1795500000000 implements MigrationInterface {
  name = 'EnforceMeterDefinition1795500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Önceki prototipte ana olmayan sayaçlar bu adlarla tutuluyordu.
    // MAIN kayıtları veya aktiflikleri otomatik değiştirilmez.
    await queryRunner.query(
      `UPDATE mini_pms.device SET role = 'FEEDER' WHERE role IN ('SECONDARY', 'METER')`,
    );
    await queryRunner.query(`ALTER TABLE mini_pms.device
      ADD COLUMN multiplier NUMERIC(18,6) NOT NULL DEFAULT 1,
      ADD CONSTRAINT chk_device_role CHECK (role IN ('MAIN', 'FEEDER')),
      ADD CONSTRAINT chk_device_multiplier CHECK (multiplier > 0 AND multiplier <> 'NaN'::numeric),
      ADD CONSTRAINT chk_device_serial_no CHECK (length(btrim(serial_no)) > 0 AND serial_no = btrim(serial_no))`);
    // Eski ölçümler zaten mevcut enerji değerleriyle kalır; çarpanları 1 kabul edilir.
    await queryRunner.query(`ALTER TABLE mini_pms.interval
      ADD COLUMN multiplier_applied NUMERIC(18,6) NOT NULL DEFAULT 1,
      ADD CONSTRAINT chk_interval_multiplier CHECK (multiplier_applied > 0 AND multiplier_applied <> 'NaN'::numeric)`);
    // Seri no silinmiş sayaçlarda da yeniden kullanılamaz.
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_device_serial_no ON mini_pms.device (serial_no)`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX uq_device_active_main_per_unit
      ON mini_pms.device (organization_unit_id)
      WHERE role = 'MAIN' AND is_active = true AND is_deleted = false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE mini_pms.interval DROP CONSTRAINT chk_interval_multiplier, DROP COLUMN multiplier_applied`,
    );
    await queryRunner.query(
      `DROP INDEX mini_pms.uq_device_active_main_per_unit`,
    );
    await queryRunner.query(`DROP INDEX mini_pms.uq_device_serial_no`);
    await queryRunner.query(`ALTER TABLE mini_pms.device
      DROP CONSTRAINT chk_device_serial_no,
      DROP CONSTRAINT chk_device_multiplier,
      DROP CONSTRAINT chk_device_role,
      DROP COLUMN multiplier`);
    // FEEDER eski adlara dönüştürülmez; hangi eski ada ait olduğu artık bilinmez.
  }
}
