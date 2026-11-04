import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
} from 'class-validator';

export class CreateUnitDto {
  @IsOptional()
  @IsNumberString()
  parent_id?: string | null;

  @IsNumberString()
  organization_unit_type_id!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}