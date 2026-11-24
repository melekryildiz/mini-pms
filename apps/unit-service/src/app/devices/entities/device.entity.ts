import {
  Entity,
  Index,
  Check,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('uq_device_serial_no', ['serial_no'], { unique: true })
@Index('uq_device_active_main_per_unit', ['organization_unit_id'], {
  unique: true,
  where: "role = 'MAIN' AND is_active = true AND is_deleted = false",
})
@Check('chk_device_role', `role IN ('MAIN', 'FEEDER')`)
@Check(
  'chk_device_multiplier',
  `multiplier > 0 AND multiplier <> 'NaN'::numeric`,
)
@Entity({ schema: 'mini_pms', name: 'device' })
export class DeviceEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id!: string;

  @Column({ type: 'bigint' })
  organization_unit_id!: string;

  @Column({ type: 'varchar' })
  serial_no!: string;

  @Column({ type: 'varchar' })
  role!: string;

  @Column({ type: 'numeric', precision: 18, scale: 6, default: '1' })
  multiplier!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'varchar' })
  created_by!: string;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  deleted_by!: string | null;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updated_at!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  updated_by!: string | null;
}
