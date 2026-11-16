import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Unit koduyla arama endpointinin query parametrelerini doğrular.
 *
 * Örnek:
 * GET /units/search?code=TR-TEST&limit=20
 */
export class SearchUnitsByCodeQueryDto {
  /**
   * Aranacak Unit kodu veya kod parçası.
   *
   * Tam eşleşme zorunlu değil. Backend parameterized ILIKE kullanarak
   * "TR" sorgusuyla "TR-TEST-01" gibi kodları bulabilecek.
   */
  @IsString()
  @Matches(/\S/, {
    message: 'code must contain at least one non-whitespace character',
  })
  @MaxLength(64)
  code!: string;

  /**
   * Arama sonucunu sınırlandırıyoruz.
   *
   * Kullanıcının iki harf yazarak binlerce Unit kaydını tarayıcıya indirmesini
   * engeller. Varsayılan 20, izin verilen en yüksek değer 50'dir.
   */
  @IsOptional()
  @Matches(/^(?:[1-9]|[1-4]\d|50)$/, {
    message: 'limit must be an integer between 1 and 50',
  })
  limit = '20';
}