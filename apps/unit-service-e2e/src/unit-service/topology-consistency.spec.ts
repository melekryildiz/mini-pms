import axios from 'axios';
import neo4j, { type Driver } from 'neo4j-driver';
import { Client } from 'pg';
import { loadEnvFile } from 'node:process';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Bu test F2-T2'nin asıl kabul testidir.
 *
 * Unit Service'e HTTP üzerinden 20 create/update/delete isteği yollarız.
 * Böylece Controller -> Orchestrator -> PostgreSQL transaction -> afterCommit
 * -> TopologyGraphService zincirinin tamamı gerçekten çalışır.
 *
 * Önemli güvenlik kuralı: bağlantı bilgileri okunur ama hiçbir zaman loglanmaz.
 */
describe('F2-T2 PostgreSQL ve Neo4j topology tutarlılığı', () => {
  jest.setTimeout(90_000);

  const prefix = `F2T2_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  const unitIds: string[] = [];
  const deviceIds: string[] = [];

  let postgres: Client;
  let graph: Driver;
  let postgresConnected = false;
  let graphConnected = false;

  beforeAll(async () => {
    // .env içeriği yalnızca process.env'e yüklenir; test çıktısına basılmaz.
    if (existsSync('.env')) {
      loadEnvFile('.env');
    }

    postgres = new Client({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      user:
        process.env.POSTGRES_USER ??
        readContainerEnvironment('postgres', 'POSTGRES_USER'),
      password:
        process.env.POSTGRES_PASSWORD ??
        readContainerEnvironment('postgres', 'POSTGRES_PASSWORD'),
      database:
        process.env.POSTGRES_DB ??
        readContainerEnvironment('postgres', 'POSTGRES_DB'),
    });

    graph = neo4j.driver(
      process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USERNAME ?? 'neo4j',
        readNeo4jPassword(),
      ),
    );

    await postgres.connect();
    postgresConnected = true;
    await graph.verifyConnectivity();
    graphConnected = true;
  });

  afterAll(async () => {
    /**
     * Yalnızca bu teste ait UUID/bigint kimlikleri temizlenir.
     * Prefix ve toplanan id'ler sayesinde gerçek proje kayıtlarına dokunulmaz.
     */
    if (postgresConnected) {
      /**
       * afterCommit hook'u hata verirse DB commit edilmiş olduğu halde HTTP 500
       * dönebilir. Böyle bir kaydın id'si response'tan alınamayacağı için test
       * prefix'iyle tekrar bulunur ve cleanup listesine eklenir.
       */
      const committedUnits = await postgres.query<{ id: string }>(
        'SELECT id::text FROM mini_pms.organization_unit WHERE code LIKE $1',
        [`${prefix}%`],
      );
      const committedDevices = await postgres.query<{ id: string }>(
        'SELECT id::text FROM mini_pms.device WHERE serial_no LIKE $1',
        [`${prefix}%`],
      );
      mergeUnique(unitIds, committedUnits.rows.map((row) => row.id));
      mergeUnique(deviceIds, committedDevices.rows.map((row) => row.id));
    }

    if (graphConnected) {
      const session = graph.session({
        database: process.env.NEO4J_DATABASE ?? 'neo4j',
      });
      try {
        await session.executeWrite(async (tx) => {
          await tx.run(
            'MATCH (d:Device) WHERE d.id IN $ids DETACH DELETE d',
            { ids: deviceIds },
          );
          await tx.run(
            'MATCH (u:Unit) WHERE u.id IN $ids DETACH DELETE u',
            { ids: unitIds },
          );
        });
      } finally {
        await session.close();
      }
    }

    // Driver oluşturulmuş fakat verifyConnectivity başarısız olmuş olsa da kapat.
    if (graph) {
      await graph.close();
    }

    if (postgresConnected) {
      // FK sırası: önce loglar, sonra device, en son unit kayıtları silinir.
      await postgres.query(
        'DELETE FROM mini_pms.device_log WHERE device_id = ANY($1::bigint[])',
        [deviceIds],
      );
      await postgres.query(
        'DELETE FROM mini_pms.device WHERE id = ANY($1::bigint[])',
        [deviceIds],
      );
      await postgres.query(
        'DELETE FROM mini_pms.organization_unit_log WHERE organization_unit_id = ANY($1::bigint[])',
        [unitIds],
      );
      // Yalnızca fixture içindeki parent FK'lerini kaldırıp topluca temizleriz.
      await postgres.query(
        'UPDATE mini_pms.organization_unit SET parent_id = NULL WHERE id = ANY($1::bigint[])',
        [unitIds],
      );
      await postgres.query(
        'DELETE FROM mini_pms.organization_unit WHERE id = ANY($1::bigint[])',
        [unitIds],
      );
      await postgres.end();
    }
  });

  it('20 karışık işlemden sonra iki veri kaynağında aynı topology kalır', async () => {
    // Seed test hatasını tekrar üretmeyi kolaylaştırır; seçimler yine PRNG ile yapılır.
    const random = seededRandom(Date.now() & 0xffffffff);
    const suffix = () => Math.floor(random() * 1_000_000).toString();

    // 1-2: İki root SUBSTATION oluşturulur.
    const substationA = await createUnit(null, '1', `${prefix}_SA`, `SA-${suffix()}`);
    const substationB = await createUnit(null, '1', `${prefix}_SB`, `SB-${suffix()}`);

    // 3-4: Her root altında birer TRANSFORMER oluşturulur.
    const transformerA = await createUnit(substationA.id, '2', `${prefix}_TA`, `TA-${suffix()}`);
    const transformerB = await createUnit(substationB.id, '2', `${prefix}_TB`, `TB-${suffix()}`);

    // 5-6: Kalacak ve daha sonra silinecek iki FEEDER oluşturulur.
    const feederA = await createUnit(transformerA.id, '3', `${prefix}_FA`, `FA-${suffix()}`);
    const disposableFeeder = await createUnit(transformerA.id, '3', `${prefix}_FX`, `FX-${suffix()}`);

    // 7-8: Bir kalıcı, bir geçici device oluşturulur.
    const deviceA = await createDevice(feederA.id, `${prefix}_DA`, `METER-${suffix()}`);
    const disposableDevice = await createDevice(feederA.id, `${prefix}_DX`, `METER-${suffix()}`);

    // 9: Parent değişimi eski CONTAINS kenarının silinmesini sınar.
    await updateUnit(transformerA.id, { parent_id: substationB.id });

    // 10-15: Rastgele üretilmiş değerlerle unit/device property güncellemeleri.
    await updateUnit(feederA.id, { name: `Feeder-${suffix()}` });
    await updateUnit(substationA.id, { name: `Substation-${suffix()}` });
    await updateDevice(deviceA.id, { role: `ROLE-${suffix()}` });
    await updateDevice(deviceA.id, { is_active: false });
    await updateDevice(deviceA.id, { is_active: true });
    await updateDevice(disposableDevice.id, { role: `TEMP-${suffix()}` });

    // 16: Device delete graf düğümünü ve kenarını kaldırmalıdır.
    await axios.delete(`/api/devices/${disposableDevice.id}`);

    // 17-18: Unit soft-delete öncesi domain kuralı gereği pasifleştirilir.
    await updateUnit(disposableFeeder.id, { is_active: false });
    await axios.delete(`/api/units/${disposableFeeder.id}`);

    // 19: Transformer tekrar diğer geçerli SUBSTATION altına taşınır.
    await updateUnit(transformerA.id, { parent_id: substationA.id });

    // 20: Son property güncellemesi commit sonrası graf senkronunu tekrar sınar.
    await updateUnit(transformerB.id, { name: `Transformer-${suffix()}` });

    const postgresState = await readPostgresState();
    const graphState = await readGraphState();

    expect(graphState.units).toEqual(postgresState.units);
    expect(graphState.devices).toEqual(postgresState.devices);

    // Soft-delete edilen nesneler Neo4j'de kesinlikle kalmamalıdır.
    expect(graphState.allGraphIds).not.toContain(disposableFeeder.id);
    expect(graphState.allGraphIds).not.toContain(disposableDevice.id);
  });

  async function createUnit(
    parentId: string | null,
    typeId: string,
    code: string,
    name: string,
  ): Promise<{ id: string }> {
    const response = await axios.post('/api/units', {
      ...(parentId !== null && { parent_id: parentId }),
      organization_unit_type_id: typeId,
      code,
      name,
    });
    const unit = response.data.data as { id: string };
    unitIds.push(String(unit.id));
    return { id: String(unit.id) };
  }

  async function updateUnit(id: string, data: Record<string, unknown>) {
    await axios.patch(`/api/units/${id}`, data);
  }

  async function createDevice(unitId: string, serialNo: string, role: string) {
    const response = await axios.post('/api/devices', {
      organization_unit_id: unitId,
      serial_no: serialNo,
      role,
    });
    const device = response.data as { id: string };
    deviceIds.push(String(device.id));
    return { id: String(device.id) };
  }

  async function updateDevice(id: string, data: Record<string, unknown>) {
    await axios.patch(`/api/devices/${id}`, data);
  }

  async function readPostgresState() {
    const units = await postgres.query<{
      id: string;
      parent_id: string | null;
      code: string;
      name: string;
      organization_unit_type_id: string;
      is_active: boolean;
    }>(
      `SELECT id::text, parent_id::text, code, name,
              organization_unit_type_id::text, is_active
         FROM mini_pms.organization_unit
        WHERE id = ANY($1::bigint[]) AND is_deleted = false
        ORDER BY id`,
      [unitIds],
    );
    const devices = await postgres.query<{
      id: string;
      organization_unit_id: string;
      serial_no: string;
      role: string;
      is_active: boolean;
    }>(
      `SELECT id::text, organization_unit_id::text, serial_no, role, is_active
         FROM mini_pms.device
        WHERE id = ANY($1::bigint[]) AND is_deleted = false
        ORDER BY id`,
      [deviceIds],
    );

    return {
      units: units.rows.map((row) => ({
        id: row.id,
        parentId: row.parent_id,
        code: row.code,
        name: row.name,
        organizationUnitTypeId: row.organization_unit_type_id,
        isActive: row.is_active,
      })),
      devices: devices.rows.map((row) => ({
        id: row.id,
        unitId: row.organization_unit_id,
        serialNo: row.serial_no,
        role: row.role,
        isActive: row.is_active,
      })),
    };
  }

  async function readGraphState() {
    const session = graph.session({
      database: process.env.NEO4J_DATABASE ?? 'neo4j',
    });
    try {
      return await session.executeRead(async (tx) => {
        const unitResult = await tx.run(
          `MATCH (u:Unit) WHERE u.id IN $ids
           OPTIONAL MATCH (p:Unit)-[:CONTAINS]->(u)
           RETURN u, p.id AS parentId ORDER BY u.id`,
          { ids: unitIds },
        );
        const deviceResult = await tx.run(
          `MATCH (d:Device) WHERE d.id IN $ids
           OPTIONAL MATCH (u:Unit)-[:HAS_DEVICE]->(d)
           RETURN d, u.id AS unitId ORDER BY d.id`,
          { ids: deviceIds },
        );

        const units = unitResult.records.map((record) => {
          const properties = record.get('u').properties;
          return {
            id: String(properties.id),
            parentId: nullableString(record.get('parentId')),
            code: properties.code,
            name: properties.name,
            organizationUnitTypeId: String(properties.organizationUnitTypeId),
            isActive: properties.isActive,
          };
        });
        const devices = deviceResult.records.map((record) => {
          const properties = record.get('d').properties;
          return {
            id: String(properties.id),
            unitId: nullableString(record.get('unitId')),
            serialNo: properties.serialNo,
            role: properties.role,
            isActive: properties.isActive,
          };
        });

        return {
          units,
          devices,
          allGraphIds: [
            ...units.map((unit) => unit.id),
            ...devices.map((device) => device.id),
          ],
        };
      });
    } finally {
      await session.close();
    }
  }
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured for the integration test`);
  }
  return value;
}

/**
 * CI'da parola doğrudan NEO4J_PASSWORD ile verilir.
 *
 * Yerel Docker geliştirmesinde Jest, çalışan Unit Service'in environment'ını
 * devralmayabilir. Bu durumda container içindeki NEO4J_AUTH değeri yalnızca
 * process belleğinde okunur. Komut çıktısı ve parola hiçbir zaman loglanmaz.
 */
function readNeo4jPassword(): string {
  if (process.env.NEO4J_PASSWORD) {
    return process.env.NEO4J_PASSWORD;
  }

  try {
    const authentication = readContainerEnvironment(
      'neo4j',
      'NEO4J_AUTH',
    );
    const separator = authentication.indexOf('/');
    if (separator >= 0 && authentication.length > separator + 1) {
      return authentication.slice(separator + 1);
    }
  } catch {
    // Aşağıdaki güvenli hata yalnızca değişken adını söyler, secret içermez.
  }

  return requiredEnvironment('NEO4J_PASSWORD');
}

/**
 * Local e2e fallback'ı: container env değerini stdout'a/loga yazmadan okur.
 * Dönen değer yalnızca ilgili database client'ını oluşturmak için kullanılır.
 */
function readContainerEnvironment(
  service: string,
  variable: string,
): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', service, 'printenv', variable],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function mergeUnique(target: string[], values: string[]): void {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}

/** Mulberry32: küçük ve tekrar üretilebilir bir pseudo-random generator. */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
