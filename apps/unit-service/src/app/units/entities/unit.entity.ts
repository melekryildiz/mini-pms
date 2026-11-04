
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity({ schema: 'mini_pms', name: 'organization_unit' })
export class UnitEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id!: string;

  @Column({ type: 'bigint', nullable: true })
  parent_id!: string | null;

  @Column({ type: 'bigint' })
  organization_unit_type_id!: string;

  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'varchar' })
  name!: string;

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
