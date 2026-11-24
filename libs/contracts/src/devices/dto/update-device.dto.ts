import {
  IsString,
  IsIn,
  ValidateIf,
  Matches,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
} from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDeviceDto {
  @ApiPropertyOptional({
    example: 'METER-002',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serial_no?: string;

  @ApiPropertyOptional({
    example: 'MAIN',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['MAIN', 'FEEDER'])
  role?: string;

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
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
