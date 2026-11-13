import { IsIn, IsNumberString, IsOptional, Matches } from 'class-validator';

export class ListUnitsQueryDto {
  @IsOptional()
  @Matches(/^[1-9]\d*$/, { message: 'page must be a positive integer' })
  page = '1';

  @IsOptional()
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/, {
    message: 'limit must be an integer between 1 and 100',
  })
  limit = '10';

  @IsOptional()
  @IsIn(['id', 'code', 'name', 'created_at'])
  sortBy: 'id' | 'code' | 'name' | 'created_at' = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'ASC';

  @IsOptional()
  @IsIn(['true', 'false'])
  is_active?: 'true' | 'false';

  @IsOptional()
  @IsNumberString()
  organization_unit_type_id?: string;
}
