// Proje kökünde: node --env-file=.env apps/ingestion-service/scripts/verify-instant.cjs
// Geçici RabbitMQ vhost, Kafka topicleri ve etiketli PG/Neo4j/Redis verisi kullanır.
// Gateway'in gerçek JWT guard'ı test anahtarıyla imzalanmış token'ı doğrular;
// Keycloak giriş ekranı bu backend testinin kapsamında değildir.
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const req = createRequire(
  path.join(root, 'apps/ingestion-service/package.json'),
);
const redisReq = createRequire(
  path.join(root, 'libs/modules/redis/package.json'),
);
const neoReq = createRequire(
  path.join(root, 'libs/modules/neo4j/package.json'),
);
const gatewayReq = createRequire(
  path.join(root, 'apps/api-gateway/package.json'),
);
const { Client } = req('pg');
const Redis = redisReq('ioredis');
const neo4j = neoReq('neo4j-driver');
const { Kafka, logLevel } = req('kafkajs');
const id = `instant-test-${Date.now()}`;
const db = new Client({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});
const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});
const graph = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME ?? 'neo4j',
    process.env.NEO4J_PASSWORD,
  ),
);
const admin = new Kafka({
  clientId: id,
  logLevel: logLevel.ERROR,
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
}).admin();
const rabbit = new URL(
  process.env.RABBITMQ_URL ?? 'amqp://mpms:mpms_dev_password@localhost:5672',
);
const management =
  process.env.RABBITMQ_MANAGEMENT_URL ?? `http://${rabbit.hostname}:15672`;
const rabbitAuthorization =
  'Basic ' +
  Buffer.from(
    `${decodeURIComponent(rabbit.username)}:${decodeURIComponent(rabbit.password)}`,
  ).toString('base64');
const topics = [`${id}-raw`, `${id}-dlq`];
const children = [];
const units = [];
let devices = [];
let vhost = false;
let jwksServer;
async function rabbitApi(method, url, body) {
  const response = await fetch(`${management}/api/${url}`, {
    method,
    headers: {
      Authorization: rabbitAuthorization,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok && !(method === 'DELETE' && response.status === 404))
    throw new Error(`RabbitMQ management ${method}: ${response.status}`);
}
async function port() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function launch(app, env, ready) {
  const item = {
    app,
    output: '',
    child: spawn(process.execPath, [`apps/${app}/dist/main.js`], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  };
  children.push(item);
  for (const stream of [item.child.stdout, item.child.stderr])
    stream.on('data', (chunk) => {
      item.output += chunk;
    });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (item.output.includes(ready)) return item;
    if (item.child.exitCode !== null || item.child.signalCode !== null)
      throw new Error(`${app}: ${item.output.slice(-2200)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${app} startup timed out: ${item.output.slice(-2200)}`);
}
async function stop(item) {
  if (item.child.exitCode !== null || item.child.signalCode !== null) return;
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      item.child.kill('SIGKILL');
      reject(new Error(`${item.app} stop timed out`));
    }, 20000);
    item.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  item.child.kill('SIGINT');
  await done;
}
async function unit(type, parent, name) {
  const value = (
    await db.query(
      `INSERT INTO mini_pms.organization_unit (organization_unit_type_id,parent_id,code,name,created_by) VALUES ($1,$2,$3,$3,$4) RETURNING id,code,name`,
      [type, parent, `${id}-${name}`, id],
    )
  ).rows[0];
  units.push(value);
  return value;
}
async function main() {
  try {
    await db.connect();
    await redis.connect();
    await admin.connect();
    const tm = await unit('1', null, 'TM');
    const transformer = await unit('2', tm.id, 'TR');
    const empty = await unit('2', tm.id, 'EMPTY');
    const other = await unit('1', null, 'OTHER');
    const missingGraph = await unit('1', null, 'MISSING-GRAPH');
    devices = (
      await db.query(
        `INSERT INTO mini_pms.device (organization_unit_id,serial_no,role,is_active,created_by)
    SELECT CASE WHEN n<=50 THEN $1::bigint WHEN n<=102 THEN $2::bigint ELSE $3::bigint END,$4||'-M-'||n,
    CASE WHEN n=102 THEN 'OTHER' ELSE 'MAIN' END,n<>101,$4 FROM generate_series(1,103) AS n
    RETURNING id,serial_no,organization_unit_id,role,is_active`,
        [tm.id, transformer.id, other.id, id],
      )
    ).rows;
    const session = graph.session({
      database: process.env.NEO4J_DATABASE ?? 'neo4j',
    });
    try {
      await session.run(
        `UNWIND $units AS data CREATE (u:Unit {id:data.id,code:data.code,name:data.name,isActive:true})`,
        { units: [tm, transformer, empty, other] },
      );
      await session.run(
        `MATCH (root:Unit {id:$root}) MATCH (child:Unit) WHERE child.id IN $children CREATE (root)-[:CONTAINS]->(child)`,
        { root: tm.id, children: [transformer.id, empty.id] },
      );
      await session.run(
        `UNWIND $devices AS data MATCH (u:Unit {id:data.organization_unit_id}) CREATE (d:Device {id:data.id,serialNo:data.serial_no,role:data.role,isActive:data.is_active}) CREATE (u)-[:HAS_DEVICE]->(d)`,
        { devices },
      );
    } finally {
      await session.close();
    }
    const expected = devices.filter(
      (d) =>
        d.is_active && d.role === 'MAIN' && d.organization_unit_id !== other.id,
    );
    assert.equal(expected.length, 100);
    const startMs = Math.floor(Date.now() / 900000) * 900000 - 900000;
    const cache = redis.pipeline();
    for (const [index, device] of expected.entries()) {
      if (index === 99) continue;
      const measurement = {
        eventId: randomUUID(),
        schemaVersion: 1,
        deviceId: device.id,
        serialNo: device.serial_no,
        organizationUnitId: device.organization_unit_id,
        periodStart: new Date(startMs).toISOString(),
        intervalMinutes: 15,
        producedAt: new Date().toISOString(),
        source: 'simulator',
        simulationMode: 'normal',
        activeImportKwh: index,
        activeExportKwh: 0,
        inductiveKvarh: 2,
        capacitiveKvarh: 0.5,
      };
      cache.hset(
        `mpms:measurement:latest:${device.id}`,
        'periodStartMs',
        String(startMs),
        'measurement',
        JSON.stringify(measurement),
      );
    }
    await cache.exec();
    await rabbitApi('PUT', `vhosts/${id}`);
    vhost = true;
    await rabbitApi(
      'PUT',
      `permissions/${id}/${encodeURIComponent(decodeURIComponent(rabbit.username))}`,
      { configure: '.*', write: '.*', read: '.*' },
    );
    const isolatedRabbit = new URL(rabbit);
    isolatedRabbit.pathname = `/${id}`;
    await admin.createTopics({
      waitForLeaders: true,
      topics: topics.map((topic) => ({
        topic,
        numPartitions: 1,
        replicationFactor: 1,
      })),
    });
    const jose = await import(gatewayReq.resolve('jose'));
    const keys = await jose.generateKeyPair('RS256');
    const jwk = await jose.exportJWK(keys.publicKey);
    jwk.kid = id;
    jwksServer = http.createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
    const issuer = `http://127.0.0.1:${jwksServer.address().port}/test-realm`;
    const unitPort = await port(),
      ingestionPort = await port(),
      gatewayPort = await port();
    const shared = { RABBITMQ_URL: isolatedRabbit.toString() };
    const unitProcess = await launch(
      'unit-service',
      { ...shared, UNIT_SERVICE_PORT: String(unitPort) },
      'RabbitMQ: listening on mpms.unit',
    );
    await launch(
      'ingestion-service',
      {
        ...shared,
        INGESTION_SERVICE_PORT: String(ingestionPort),
        MEASUREMENT_RAW_TOPIC: topics[0],
        MEASUREMENT_DLQ_TOPIC: topics[1],
        MEASUREMENT_CONSUMER_GROUP: id,
      },
      'Application is running on:',
    );
    await launch(
      'api-gateway',
      {
        ...shared,
        API_GATEWAY_PORT: String(gatewayPort),
        KEYCLOAK_ISSUER: issuer,
      },
      'API Gateway:',
    );
    const base = `http://127.0.0.1:${gatewayPort}/api/units`;
    async function token(roles) {
      return new jose.SignJWT({ realm_access: { roles } })
        .setProtectedHeader({ alg: 'RS256', kid: id })
        .setIssuer(issuer)
        .setAudience('mini-pms-api')
        .setSubject('instant-test')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(keys.privateKey);
    }
    async function get(unitId, bearer) {
      return fetch(`${base}/${unitId}/instant-values`, {
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
        signal: AbortSignal.timeout(12000),
      });
    }
    assert.equal((await get(tm.id)).status, 401);
    assert.equal((await get(tm.id, 'invalid')).status, 401);
    assert.equal((await get(tm.id, await token(['unknown']))).status, 403);
    const viewer = await token(['viewer']);
    const result = await get(tm.id, viewer);
    const body = await result.json();
    assert.equal(result.status, 200, JSON.stringify(body));
    assert.equal(body.meters.length, 100);
    assert.deepEqual(
      new Set(body.meters.map((m) => m.deviceId)),
      new Set(expected.map((d) => d.id)),
    );
    assert.equal(body.meters.filter((m) => m.measurement === null).length, 1);
    assert.equal(
      body.meters.find((m) => m.deviceId === expected[0].id).measurement
        .activeImportKwh,
      0,
    );
    assert.equal(
      body.meters.find((m) => m.deviceId === expected[0].id).measurement
        .periodEnd,
      new Date(startMs + 900000).toISOString(),
    );
    console.log(
      'PASS HTTP -> Gateway -> Ingestion RPC -> Unit RPC -> Neo4j -> Redis: 100 meters, 99 measurements, 1 null, zero energy preserved',
    );
    console.log(
      'PASS auth: missing/invalid JWT=401, insufficient role=403, signed viewer JWT=200',
    );
    const invalidId = await get('abc', viewer);
    assert.equal(
      invalidId.status,
      400,
      JSON.stringify({
        body: await invalidId.json(),
        logs: children.map((item) => ({
          app: item.app,
          output: item.output.slice(-1600),
        })),
      }),
    );
    assert.equal((await get('9223372036854775807', viewer)).status, 404);
    assert.equal((await get(missingGraph.id, viewer)).status, 503);
    const emptyResponse = await get(empty.id, viewer);
    assert.equal(emptyResponse.status, 200);
    assert.deepEqual((await emptyResponse.json()).meters, []);
    assert.equal((await get(transformer.id, viewer)).status, 200);
    const key = `mpms:measurement:latest:${expected[0].id}`;
    await redis.hset(key, 'measurement', '{broken');
    assert.equal((await get(tm.id, viewer)).status, 503);
    console.log(
      'PASS boundaries: empty unit=200/[], invalid ID=400, missing unit=404, graph/cache corruption=503',
    );
    console.log(
      'PASS graph: root + descendant meters included; inactive, wrong-role and unrelated meters excluded',
    );
    await stop(unitProcess);
    assert.equal((await get(tm.id, viewer)).status, 504);
    console.log(
      'PASS timeout: stopped Unit Service returns 504 through Ingestion and Gateway',
    );
  } catch (error) {
    for (const item of children)
      console.error(item.app, item.output.slice(-2200));
    throw error;
  } finally {
    for (const item of children.reverse()) await stop(item);
    if (jwksServer) await new Promise((resolve) => jwksServer.close(resolve));
    if (vhost) await rabbitApi('DELETE', `vhosts/${id}`);
    if (devices.length) {
      await redis.del(...devices.map((d) => `mpms:measurement:latest:${d.id}`));
      await db.query(
        'DELETE FROM mini_pms.device WHERE id=ANY($1::bigint[]) AND created_by=$2',
        [devices.map((d) => d.id), id],
      );
    }
    if (units.length) {
      const s = graph.session({
        database: process.env.NEO4J_DATABASE ?? 'neo4j',
      });
      try {
        await s.run(
          'MATCH (n) WHERE (n:Unit AND n.id IN $units) OR (n:Device AND n.id IN $devices) DETACH DELETE n',
          { units: units.map((u) => u.id), devices: devices.map((d) => d.id) },
        );
      } finally {
        await s.close();
      }
      for (const u of [...units].reverse())
        await db.query(
          'DELETE FROM mini_pms.organization_unit WHERE id=$1 AND created_by=$2',
          [u.id, id],
        );
    }
    await admin.deleteGroups([id]).catch((error) => {
      if (!error.groups?.every((group) => group.errorCode === 69))
        console.error('Test group cleanup:', error.message);
    });
    await admin.deleteTopics({ topics });
    await admin.disconnect();
    await redis.quit();
    await graph.close();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
