import {
  IsBoolean,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateUnitDto {
  /**
   * Parent değişikliği gönderilmezse mevcut ilişki korunur.
   * Null yalnızca root olabilen SUBSTATION için kabul edilir.
   */
  @IsOptional()
  @IsNumberString()
  parent_id?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
