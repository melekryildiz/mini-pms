import {
  IsString,
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
  @IsString()
  @IsNotEmpty()
  role!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { manufacturer: 'Test' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
