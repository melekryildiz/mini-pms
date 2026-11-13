import type {
  Neo4jConstraintDefinition,
} from '@mini-pms/neo4j';

/**
 * Unit Service açılırken Neo4j üzerinde hazır olması gereken topology
 * constraint'leri.
 */
export const UNIT_NEO4J_CONSTRAINTS = [
  {
    name: 'unit_id_unique',

    /**
     * Aynı PostgreSQL Unit kaydının Neo4j'de birden fazla node olarak
     * oluşmasını engeller.
     */
    statement: `
      CREATE CONSTRAINT unit_id_unique IF NOT EXISTS
      FOR (unit:Unit)
      REQUIRE unit.id IS UNIQUE
    `,
  },

  {
    name: 'device_id_unique',

    
    statement: `
      CREATE CONSTRAINT device_id_unique IF NOT EXISTS
      FOR (device:Device)
      REQUIRE device.id IS UNIQUE
    `,
  },
] as const satisfies readonly Neo4jConstraintDefinition[];