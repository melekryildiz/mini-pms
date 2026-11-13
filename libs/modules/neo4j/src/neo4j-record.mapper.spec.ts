import {
  int,
  Record as Neo4jRecord,
} from 'neo4j-driver';

import {
  mapNeo4jRecord,
  mapNeo4jRecords,
  normalizeNeo4jValue,
} from './neo4j-record.mapper.js';

/**
 * Testlerde Result üretmek için gerçek bir Neo4j sunucusuna bağlanmak yerine
 * driver'ın Record sınıfını kullanıyoruz. Böylece test hızlı ve deterministik
 * kalırken gerçek record.toObject() davranışı da sınanmış oluyor.
 */
function createRecord(
  data: Record<string, unknown>,
): Neo4jRecord {
  const entries = Object.entries(data);

  return new Neo4jRecord(
    entries.map(([key]) => key),
    entries.map(([, value]) => value),
  );
}

describe('normalizeNeo4jValue', () => {
  it('güvenli aralıktaki Neo4j Integer değerini number yapar', () => {
    const value = int(42);

    expect(normalizeNeo4jValue(value)).toBe(42);
  });

  it('JavaScript güvenli aralığını aşan Integer için veri kaybını önler', () => {
    /**
     * Number.MAX_SAFE_INTEGER değerinden büyük sayıları number'a çevirmek
     * hassasiyet kaybına yol açabilir. Mapper bu durumda sessizce yanlış bir
     * sayı üretmek yerine açık bir RangeError vermelidir.
     */
    const unsafeValue = int('9007199254740992');

    expect(() => normalizeNeo4jValue(unsafeValue)).toThrow(
      new RangeError(
        'Neo4j integer is outside JavaScript safe range: 9007199254740992',
      ),
    );
  });

  it('iç içe object ve array içindeki Integer değerlerini dönüştürür', () => {
    const value = {
      unit: {
        floor: int(3),
        counters: [int(10), int(20)],
      },
      active: true,
    };

    expect(normalizeNeo4jValue(value)).toEqual({
      unit: {
        floor: 3,
        counters: [10, 20],
      },
      active: true,
    });
  });

  it.each([
    ['string', 'unit-1'],
    ['number', 12.5],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined],
  ])(
    '%s gibi drivera özel olmayan değeri değiştirmez',
    (_description, value) => {
      expect(normalizeNeo4jValue(value)).toBe(value);
    },
  );

  it('Date gibi class instance değerlerini parçalamadan korur', () => {
    const date = new Date('2026-01-15T10:00:00.000Z');

    /**
     * Burada toEqual yerine toBe kullanıyoruz. Yalnızca eşit bir tarih değil,
     * aynı class instance'ın değişmeden döndüğünü kanıtlamak istiyoruz.
     */
    expect(normalizeNeo4jValue(date)).toBe(date);
  });
});

describe('mapNeo4jRecord', () => {
  it('Neo4j Record değerini tipli domain nesnesine dönüştürür', () => {
    interface UnitSummary {
      id: string;
      name: string;
      childCount: number;
    }

    const record = createRecord({
      id: 'unit-1',
      name: 'Main Unit',
      childCount: int(4),
    });

    const result = mapNeo4jRecord<UnitSummary>(
      record,
      (data) => ({
        id: String(data.id),
        name: String(data.name),
        childCount: Number(data.childCount),
      }),
    );

    expect(result).toEqual({
      id: 'unit-1',
      name: 'Main Unit',
      childCount: 4,
    });
  });

  it('mapper callbackine normalize edilmiş veri gönderir', () => {
    const record = createRecord({
      count: int(7),
    });

    const mapper = jest.fn((data: Readonly<Record<string, unknown>>) =>
      data.count,
    );

    const result = mapNeo4jRecord(record, mapper);

    expect(mapper).toHaveBeenCalledWith({ count: 7 });
    expect(result).toBe(7);
  });
});

describe('mapNeo4jRecords', () => {
  it('birden fazla recordu aynı mapper ile tipli listeye dönüştürür', () => {
    interface UnitListItem {
      id: string;
      level: number;
    }

    const records = [
      createRecord({ id: 'unit-1', level: int(1) }),
      createRecord({ id: 'unit-2', level: int(2) }),
    ];

    const result = mapNeo4jRecords<UnitListItem>(
      records,
      (data) => ({
        id: String(data.id),
        level: Number(data.level),
      }),
    );

    expect(result).toEqual([
      { id: 'unit-1', level: 1 },
      { id: 'unit-2', level: 2 },
    ]);
  });

  it('boş record listesi için boş liste döndürür', () => {
    const mapper = jest.fn(() => ({ id: 'unused' }));

    const result = mapNeo4jRecords([], mapper);

    expect(result).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });
});
