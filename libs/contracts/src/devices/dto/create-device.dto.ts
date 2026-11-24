import {
  IsString,
  IsIn,
  ValidateIf,
  IsNotEmpty,
  IsOptional,
  IsObject,
  Matches,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeviceDto {
  @ApiProperty({
    example: '1',
    description: 'Organization unit ID',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'organization_unit_id must be a positive integer',
  })
  organization_unit_id!: string;

  @ApiProperty({
    example: 'METER-001',
    description: 'Device serial number',
  })
  @IsString()
  @IsNotEmpty()
  serial_no!: string;

  @ApiProperty({
    example: 'MAIN',
    description: 'Device role',
  })
  @IsIn(['MAIN', 'FEEDER'])
  role!: string;

  @ApiPropertyOptional({
    example: '1',
    description: 'Pozitif sayaç çarpanı; en fazla 6 ondalık basamak',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^(?:(?:[1-9]\d{0,11})(?:\.\d{1,6})?|0\.(?=\d{0,5}[1-9])\d{1,6})$/, {
    message:
      'multiplier must be a positive decimal string with at most 12 integer and 6 fractional digits',
  })
  multiplier?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { manufacturer: 'Test' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
