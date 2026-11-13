import {
  IsBoolean,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateUnitDto {
  /**
   * undefined: Parent değiştirilmez.
   * null: Unit root yapılmak istenir; yalnızca SUBSTATION için geçerlidir.
   * string: Yeni parent Unit ID değeridir.
   *
   * IsOptional null ve undefined değerlerinde diğer validator'ları atlar.
   * Null olmayan değerlerin PostgreSQL bigint ID biçiminde olması gerekir.
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
