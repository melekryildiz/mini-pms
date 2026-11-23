import {
  Check,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** Mevcut migration'daki 15 dakikalık enerji tablosu. */
@Entity({ schema: 'mini_pms', name: 'interval' })
@Unique('uq_interval_device_period', ['device_id', 'period_start'])
@Check(
  'chk_interval_values',
  `"active_import_kwh" >= 0
   AND "active_export_kwh" >= 0
   AND "inductive_kvarh" >= 0
   AND "capacitive_kvarh" >= 0`,
)
export class IntervalEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id!: string;

  // bigint değerlerini JavaScript tam sayı sınırına takılmadan taşır.
  @Column({ type: 'bigint' })
  device_id!: string;

  @Column({ type: 'timestamptz' })
  period_start!: Date;

  // PostgreSQL NUMERIC değerlerini hassasiyet kaybetmeden okur.
  @Column({ type: 'numeric' })
  active_import_kwh!: string;

  @Column({ type: 'numeric' })
  active_export_kwh!: string;

  @Column({ type: 'numeric' })
  inductive_kvarh!: string;

  @Column({ type: 'numeric' })
  capacitive_kvarh!: string;
}
