import {
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsNumberString,
} from 'class-validator';

import { Type, Transform } from 'class-transformer';

export class ListUnitsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsIn(['id', 'code', 'name', 'created_at'])
  sortBy: 'id' | 'code' | 'name' | 'created_at' = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'ASC';

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value
  )
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsNumberString()
  organization_unit_type_id?: string;
}