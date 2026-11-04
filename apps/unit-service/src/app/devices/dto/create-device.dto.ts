
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  Matches,
} from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'organization_unit_id must be a positive integer',
  })
  organization_unit_id!: string;

  @IsString()
  @IsNotEmpty()
  serial_no!: string;

  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
