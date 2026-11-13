import { IsNumberString, IsOptional, Matches } from 'class-validator';

/** Limit geçmişini birime göre ve sayfalı getiren endpoint'in query modeli. */
export class ListReactiveLimitsQueryDto {
  @IsNumberString()
  organization_unit_id!: string;

  @IsOptional()
  @Matches(/^[1-9]\d*$/, { message: 'page must be a positive integer' })
  page = '1';

  @IsOptional()
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/, {
    message: 'limit must be an integer between 1 and 100',
  })
  limit = '10';
}
