import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Check,
} from 'typeorm';

@Entity({
  schema: 'mini_pms',
  name: 'reactive_limit_config',
})
@Check('chk_reactive_limit_value', '"limit_value" >= 0')
@Check(
  'chk_reactive_limit_dates',
  '"valid_to" IS NULL OR "valid_to" > "valid_from"',
)
export class ReactiveLimitEntity {
  @PrimaryGeneratedColumn({
    type: 'bigint',
  })
  id!: string;

  @Column({
    type: 'bigint',
  })
  organization_unit_id!: string;

  @Column({
    type: 'varchar',
  })
  limit_type!: string;

  @Column({
    type: 'numeric',
  })
  limit_value!: string;

  @Column({
    type: 'timestamptz',
  })
  valid_from!: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  valid_to!: Date | null;
}
