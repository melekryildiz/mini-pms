import { IsIn, IsNumberString, IsOptional, Matches } from 'class-validator';

/**
 * Cihaz listesinin tarayıcıda filtrelenmesi yerine veritabanında filtrelenmesi
 * için kullanılan query sözleşmesi. Aynı DTO Gateway ve core service arasında
 * kullanıldığı için iki katmanda farklı varsayımlar oluşmaz.
 */
export class ListDevicesQueryDto {
  @IsOptional()
  @Matches(/^[1-9]\d*$/, { message: 'page must be a positive integer' })
  page = '1';

  @IsOptional()
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/, {
    message: 'limit must be an integer between 1 and 100',
  })
  limit = '10';

  @IsOptional()
  @IsNumberString()
  organization_unit_id?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  is_active?: 'true' | 'false';

  @IsOptional()
  @IsIn(['id', 'serial_no', 'created_at'])
  sortBy: 'id' | 'serial_no' | 'created_at' = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'ASC';
}
