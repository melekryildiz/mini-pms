import {
  IsString,
  IsNotEmpty,
  IsNumberString,
  IsISO8601,
  IsOptional,
} from 'class-validator';

export class CreateReactiveLimitDto {
  @IsNumberString()
  organization_unit_id!: string;

  @IsString()
  @IsNotEmpty()
  limit_type!: string;

  @IsNumberString()
  limit_value!: string;

  @IsISO8601()
  valid_from!: string;

  @IsOptional()
  @IsISO8601()
  valid_to?: string | null;
}