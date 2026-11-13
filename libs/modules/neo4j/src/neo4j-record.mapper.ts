import {
  isInt,
  type Record as Neo4jRecord,
} from 'neo4j-driver';

/**
 * Neo4j Record içindeki alanların normalize edildikten sonraki ham biçimi.
 *
 * Alanları başlangıçta unknown tutuyoruz. Çünkü mapper çalışmadan önce
 * verinin gerçekten string, number veya başka bir tip olduğunu bilmiyoruz.
 */
export type Neo4jRecordData = Record<string, unknown>;

/**
 * Normalize edilmiş record verisini uygulamanın istediği tipe dönüştürür.
 */
export type Neo4jRecordMapper<T> = (
  data: Readonly<Neo4jRecordData>,
) => T;

/**
 * Tek bir Neo4j Record'u tipli uygulama nesnesine dönüştürür.
 */
export function mapNeo4jRecord<T>(
  record: Neo4jRecord,
  mapper: Neo4jRecordMapper<T>,
): T {
  
  const rawData = record.toObject();

  /**
   * Neo4j Integer, array ve iç içe map değerlerini normal JavaScript
   * değerlerine dönüştürüyoruz.
   */
  const normalizedData = normalizeNeo4jValue(rawData);

  return mapper(normalizedData as Neo4jRecordData);
}

/**
 * Birden fazla Neo4j Record'u aynı mapper ile tipli listeye dönüştürür.
 */
export function mapNeo4jRecords<T>(
  records: readonly Neo4jRecord[],
  mapper: Neo4jRecordMapper<T>,
): T[] {
  return records.map((record) => mapNeo4jRecord(record, mapper));
}


export function normalizeNeo4jValue(
  value: unknown,
): unknown {
  /**
   * Neo4j kendi 64-bit Integer tipini kullanır.
   *
   * JavaScript number tipi tüm 64-bit integer değerlerini güvenli biçimde
   * temsil edemez. Bu nedenle önce güvenli aralık kontrolü yapıyoruz.
   */
  if (isInt(value)) {
    if (!value.inSafeRange()) {
      
      throw new RangeError(
        `Neo4j integer is outside JavaScript safe range: ${value.toString()}`,
      );
    }

    return value.toNumber();
  }

  /**
   * Array.isArray kontrolünü object kontrolünden önce yapıyoruz.
   *
   * Çünkü JavaScript'te array değerleri de typeof ile "object" döndürür.
   */
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNeo4jValue(item));
  }

  /**
   * null için typeof null sonucu "object" gelir.
   *
   * Bu nedenle null kontrolünü ayrıca yapmamız gerekir.
   */
  if (value === null) {
    return null;
  }

  /**
   * Neo4j projection/map sonucundaki iç içe nesneleri normalize eder.
   */
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeNeo4jValue(nestedValue),
      ]),
    );
  }

  
  return value;
}

/**
 * Bir değerin normal JavaScript object literal olup olmadığını kontrol eder.
 *
 * Neo4j Node, Relationship, Date veya başka class instance'larını düz object
 * sanıp parçalamak istemiyoruz.
 */
function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}