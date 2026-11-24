// Proje kökünde: node --env-file=.env apps/ingestion-service/scripts/verify-meter-rules.cjs
// Yalnız bu testin oluşturduğu birim, sayaç ve ölçümleri temizler.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const req = createRequire(
  path.join(root, 'apps/ingestion-service/package.json'),
);
const rootReq = createRequire(path.join(root, 'package.json'));
const { Client } = req('pg');
const { QueryFailedError } = req('typeorm');
const ts = rootReq('typescript');
const config = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
};
const db = new Client(config);
const label = `meter-rules-${randomUUID()}`;
let unitId;
const devices = [];
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      experimentalDecorators: true,
    },
  });
  function localRequire(name) {
    if (name === '@nestjs/typeorm')
      return { InjectRepository: () => () => undefined };
    if (name.startsWith('.'))
      return load(
        path.resolve(path.dirname(file), name.replace(/\.js$/, '.ts')),
      );
    return req(name);
  }
  new Function('require', 'module', 'exports', outputText)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}
async function sql(query, parameters = []) {
  try {
    return (await db.query(query, parameters)).rows;
  } catch (e) {
    throw new QueryFailedError(query, parameters, e);
  }
}
async function expectConstraint(query, params, constraint) {
  await assert.rejects(
    db.query(query, params),
    (e) => e.constraint === constraint,
  );
}
async function meter(
  serial,
  role = 'FEEDER',
  active = true,
  multiplier = '1',
  client = db,
) {
  const row = (
    await client.query(
      `INSERT INTO mini_pms.device (organization_unit_id,serial_no,role,is_active,multiplier,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [unitId, `${label}-${serial}`, role, active, multiplier, label],
    )
  ).rows[0];
  devices.push(row.id);
  return row.id;
}
function event(deviceId, periodStart = '2026-01-01T00:00:00.000Z') {
  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    deviceId,
    serialNo: 'test',
    organizationUnitId: unitId,
    periodStart,
    intervalMinutes: 15,
    producedAt: new Date().toISOString(),
    source: 'simulator',
    simulationMode: 'backfill',
    activeImportKwh: 10.25,
    activeExportKwh: 1,
    inductiveKvarh: 2,
    capacitiveKvarh: 0.5,
  };
}
(async () => {
  await db.connect();
  unitId = (
    await db.query(
      `INSERT INTO mini_pms.organization_unit (organization_unit_type_id,code,name,created_by) VALUES (1,$1,$1,$1) RETURNING id`,
      [label],
    )
  ).rows[0].id;
  const a = new Client(config),
    b = new Client(config);
  await Promise.all([a.connect(), b.connect()]);
  try {
    const results = await Promise.allSettled([
      meter('main-a', 'MAIN', true, '1', a),
      meter('main-b', 'MAIN', true, '1', b),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.find((r) => r.status === 'rejected');
    assert.equal(rejected.reason.constraint, 'uq_device_active_main_per_unit');
  } finally {
    await Promise.all([a.end(), b.end()]);
  }
  console.log('PASS concurrent MAIN creation: exactly one succeeds');
  const inactive = await meter('inactive-main', 'MAIN', false);
  await expectConstraint(
    'UPDATE mini_pms.device SET is_active=true WHERE id=$1',
    [inactive],
    'uq_device_active_main_per_unit',
  );
  const feeder = await meter('feeder', 'FEEDER', true, '2.5');
  await expectConstraint(
    "UPDATE mini_pms.device SET role='MAIN' WHERE id=$1",
    [feeder],
    'uq_device_active_main_per_unit',
  );
  await expectConstraint(
    "UPDATE mini_pms.device SET role='METER' WHERE id=$1",
    [feeder],
    'chk_device_role',
  );
  for (const value of ['0', '-1', 'NaN'])
    await expectConstraint(
      'UPDATE mini_pms.device SET multiplier=$1 WHERE id=$2',
      [value, feeder],
      'chk_device_multiplier',
    );
  const removed = await meter('removed');
  await db.query(
    `UPDATE mini_pms.device SET is_deleted=true,is_active=false,deleted_at=now(),deleted_by=$1 WHERE id=$2`,
    [label, removed],
  );
  await assert.rejects(
    meter('removed'),
    (e) => e.constraint === 'uq_device_serial_no',
  );
  console.log(
    'PASS roles, multiplier, activation, role change and deleted serial uniqueness enforced by PostgreSQL',
  );
  const { MeasurementStoreService } = load(
    path.join(
      root,
      'apps/ingestion-service/src/app/measurements/measurement-store.service.ts',
    ),
  );
  const store = new MeasurementStoreService({
    query: sql,
    manager: {
      transaction: async (_isolation, fn) => {
        await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        try {
          const result = await fn({ query: sql });
          await db.query('COMMIT');
          return result;
        } catch (e) {
          await db.query('ROLLBACK');
          throw e;
        }
      },
    },
  });
  const raw = event(feeder);
  const inserted = await store.store(raw);
  assert.equal(inserted.status, 'inserted');
  assert.equal(inserted.measurement.activeImportKwh, 25.625);
  assert.equal(inserted.measurement.activeExportKwh, 2.5);
  assert.equal(inserted.measurement.inductiveKvarh, 5);
  assert.equal(inserted.measurement.capacitiveKvarh, 1.25);
  await db.query('UPDATE mini_pms.device SET multiplier=3 WHERE id=$1', [
    feeder,
  ]);
  const replay = await store.store(raw);
  assert.equal(replay.status, 'duplicate');
  assert.equal(replay.measurement.activeImportKwh, 25.625);
  assert.equal(
    (await store.store({ ...raw, activeImportKwh: 11 })).status,
    'conflict',
  );
  const next = await store.store(event(feeder, '2026-01-01T00:15:00.000Z'));
  assert.equal(next.measurement.activeImportKwh, 30.75);
  const second = await meter('second', 'FEEDER', true, '0.125');
  const batch = await store.storeBatch([
    event(feeder, '2026-01-01T00:30:00.000Z'),
    event(second),
    event(second),
  ]);
  assert.deepEqual(
    batch.map((r) => r.status),
    ['inserted', 'inserted', 'duplicate'],
  );
  assert.equal(batch[0].measurement.activeImportKwh, 30.75);
  assert.equal(batch[1].measurement.activeImportKwh, 1.28125);
  assert.equal(batch[2].measurement.activeImportKwh, 1.28125);
  const missing = await store.store(event('9223372036854775806'));
  assert.equal(missing.status, 'rejected');
  const rows = (
    await db.query(
      'SELECT multiplier_applied,active_import_kwh FROM mini_pms.interval WHERE device_id=$1 ORDER BY period_start',
      [feeder],
    )
  ).rows;
  assert.equal(Number(rows[0].multiplier_applied), 2.5);
  assert.equal(Number(rows[1].multiplier_applied), 3);
  console.log(
    'PASS real store SQL: all 4 energies scaled once, historical multiplier preserved, batch/duplicate/conflict/missing-device cases',
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (unitId) {
      await db.query(
        'DELETE FROM mini_pms.interval WHERE device_id IN (SELECT id FROM mini_pms.device WHERE created_by=$1)',
        [label],
      );
      await db.query('DELETE FROM mini_pms.device WHERE created_by=$1', [
        label,
      ]);
      await db.query(
        'DELETE FROM mini_pms.organization_unit WHERE id=$1 AND created_by=$2',
        [unitId, label],
      );
    }
    await db.end();
    console.log('Test fixtures cleaned');
  });
