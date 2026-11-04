
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'mini_pms', name: 'device_log' })
export class DeviceLogEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id!: string;

  @Column({ type: 'bigint' })
  device_id!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'jsonb' })
  changes!: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'varchar' })
  created_by!: string;
}

