// Proje kökünde:
// node --env-file=.env apps/ingestion-service/scripts/verify-integration.cjs
// Gerçek uygulamayı ayrı topic/group ile çalıştırır. Sadece kendi test cihazını,
// ölçümlerini ve Redis key'ini temizler; Kafka topic'lerini incelemek için bırakır.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../package.json'));
const redisReq = createRequire(
  path.resolve(__dirname, '../../..', 'libs/modules/redis/package.json'),
);
const { Kafka, logLevel } = req('kafkajs');
const { Client } = req('pg');
const Redis = redisReq('ioredis');

const runId = `ingestion-test-${Date.now()}`;
const rawTopic = `${runId}-raw`;
const dlqTopic = `${runId}-dlq`;
const groupId = `${runId}-consumer`;
const pgConfig = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
};
const db = new Client(pgConfig);
const locker = new Client(pgConfig);
const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});
const kafka = new Kafka({
  clientId: runId,
  logLevel: logLevel.ERROR,
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});
const admin = kafka.admin();
const producer = kafka.producer({ allowAutoTopicCreation: false });
const observer = kafka.consumer({ groupId: `${runId}-observer` });
const dlq = [];
let child;
let output = '';
let device;
let lockOpen = false;
let offset;
const period = '2026-01-01T10:00:00.000Z';
const blockedPeriod = '2026-01-01T10:15:00.000Z';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    if (child && child.exitCode !== null)
      throw new Error(`Ingestion exited: ${output.slice(-3000)}`);
    await wait(100);
  }
  throw new Error(`Timed out: ${label}; ${output.slice(-1500)}`);
}
function event(patch = {}) {
  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    deviceId: device.id,
    serialNo: device.serial_no,
    organizationUnitId: device.organization_unit_id,
    periodStart: period,
    intervalMinutes: 15,
    producedAt: new Date().toISOString(),
    source: 'simulator',
    simulationMode: 'normal',
    activeImportKwh: 10,
    activeExportKwh: 0,
    inductiveKvarh: 2,
    capacitiveKvarh: 0.5,
    ...patch,
  };
}
async function committed() {
  const topics = await admin.fetchOffsets({ groupId, topics: [rawTopic] });
  return BigInt(
    topics[0]?.partitions.find((p) => p.partition === 0)?.offset ?? '-1',
  );
}
async function send(value) {
  const result = await producer.send({
    topic: rawTopic,
    acks: -1,
    messages: [
      {
        partition: 0,
        key: device.id,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      },
    ],
  });
  offset = BigInt(result[0].baseOffset);
  return offset;
}
async function sendAndWait(value) {
  const sentOffset = await send(value);
  await until(
    async () => (await committed()) === sentOffset + 1n,
    'manual offset commit',
  );
  return sentOffset;
}
async function rows(at = period) {
  return (
    await db.query(
      'SELECT * FROM mini_pms.interval WHERE device_id=$1 AND period_start=$2',
      [device.id, at],
    )
  ).rows;
}
async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const processToStop = child;
  processToStop.kill('SIGINT');
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      processToStop.kill('SIGKILL');
      reject(new Error(`Ingestion shutdown timed out: ${output.slice(-3500)}`));
    }, 30000);
    processToStop.once('exit', (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
  // Nest kapanış hook'larından sonra SIGINT'i yeniden iletebilir.
  // Bu durumda Node exitCode=null, signalCode=SIGINT bildirir.
  assert.ok(
    code === 0 || processToStop.signalCode === 'SIGINT',
    output.slice(-2000),
  );
  assert.ok(
    output.includes('Measurement consumer disconnected'),
    output.slice(-2000),
  );
  assert.ok(output.includes('DLQ producer disconnected'), output.slice(-2000));
}
async function main() {
  try {
    await db.connect();
    await locker.connect();
    await redis.connect();
    await admin.connect();
    const unit = (
      await db.query(
        'SELECT id FROM mini_pms.organization_unit WHERE is_active=true AND is_deleted=false ORDER BY id LIMIT 1',
      )
    ).rows[0];
    assert.ok(unit, 'An existing active unit is needed');
    // Aktif simülatör listesine girmeyen, yalnız bu teste ait cihaz.
    device = (
      await db.query(
        `INSERT INTO mini_pms.device
      (organization_unit_id, serial_no, role, is_active, created_by)
      VALUES ($1,$2,'FEEDER',false,$2) RETURNING id, serial_no, organization_unit_id`,
        [unit.id, runId],
      )
    ).rows[0];
    await admin.createTopics({
      waitForLeaders: true,
      topics: [rawTopic, dlqTopic].map((topic) => ({
        topic,
        numPartitions: 1,
        replicationFactor: 1,
      })),
    });
    await producer.connect();
    await observer.connect();
    await observer.subscribe({ topic: dlqTopic, fromBeginning: true });
    await observer.run({
      eachMessage: async ({ message }) => {
        dlq.push(JSON.parse(message.value.toString()));
      },
    });

    child = spawn(process.execPath, ['apps/ingestion-service/dist/main.js'], {
      cwd: path.resolve(__dirname, '../../..'),
      env: {
        ...process.env,
        INGESTION_SERVICE_PORT: '0',
        MEASUREMENT_RAW_TOPIC: rawTopic,
        MEASUREMENT_DLQ_TOPIC: dlqTopic,
        MEASUREMENT_CONSUMER_GROUP: groupId,
        // Sadece bu test uygulamasının sorguları için; diğer servislere dokunmaz.
        PGOPTIONS: '-c statement_timeout=1500',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    await until(
      () => output.includes('Application is running on:'),
      'application startup',
    );

    const original = event();
    await sendAndWait(original);
    assert.equal((await rows()).length, 1);
    // Aynı event ve farklı eventId: ikisi de aynı mantıksal ölçümdür.
    await sendAndWait(original);
    await sendAndWait({ ...original, eventId: randomUUID() });
    assert.equal((await rows()).length, 1);
    console.log(
      'PASS NFR-02: same event and new eventId leave one database row',
    );

    const conflictOffset = await sendAndWait(event({ activeImportKwh: 11 }));
    const corruptOffset = await sendAndWait(
      event({ activeImportKwh: -1, simulationMode: 'corrupt' }),
    );
    const badJsonOffset = await sendAndWait('{broken JSON');
    const absentId = '9223372036854775807';
    assert.equal(
      (await db.query('SELECT id FROM mini_pms.device WHERE id=$1', [absentId]))
        .rows.length,
      0,
    );
    const absentOffset = await sendAndWait(event({ deviceId: absentId }));
    // absentId mesajında key de eşleşmeli; bu kontrolü ayrı, doğru key ile yap.
    const absentResult = await producer.send({
      topic: rawTopic,
      acks: -1,
      messages: [
        {
          partition: 0,
          key: absentId,
          value: JSON.stringify(event({ deviceId: absentId })),
        },
      ],
    });
    const foreignOffset = BigInt(absentResult[0].baseOffset);
    await until(
      async () => (await committed()) === foreignOffset + 1n,
      'foreign key rejection',
    );
    await until(() => dlq.length >= 5, 'DLQ messages');
    for (const [sourceOffset, code] of [
      [conflictOffset, 'MEASUREMENT_CONFLICT'],
      [corruptOffset, 'INVALID_MEASUREMENT'],
      [badJsonOffset, 'INVALID_MEASUREMENT'],
      [absentOffset, 'INVALID_MEASUREMENT'],
      [foreignOffset, 'MEASUREMENT_REJECTED'],
    ]) {
      const record = dlq.find(
        (item) => item.original.offset === sourceOffset.toString(),
      );
      assert.ok(record, `DLQ missing source offset ${sourceOffset}`);
      assert.equal(record.error.code, code);
      assert.ok(record.error.reason.length > 0);
      assert.equal(record.original.topic, rawTopic);
      assert.equal(record.original.partition, 0);
    }
    assert.equal((await rows())[0].active_import_kwh, '10');
    assert.equal(
      dlq.find((item) => item.original.offset === badJsonOffset.toString())
        .original.raw,
      '{broken JSON',
    );
    console.log(
      'PASS DLQ: conflict, corrupt, broken JSON, wrong key, missing device; reasons and original source preserved',
    );

    const oldPeriod = '2026-01-01T09:45:00.000Z';
    await sendAndWait(
      event({ periodStart: oldPeriod, simulationMode: 'backfill' }),
    );
    const cached = JSON.parse(
      await redis.hget(`mpms:measurement:latest:${device.id}`, 'measurement'),
    );
    assert.equal(cached.periodStart, period);
    assert.equal((await rows(oldPeriod)).length, 1);
    console.log(
      'PASS Redis: backfill saved without moving latest value backwards',
    );

    // Yalnız bu test cihazının yeni dönem kaydını kilitler. Consumer sorgusu
    // timeout almalı; offset ve sonraki mesaj aynı partition'da ilerlememeli.
    await locker.query('BEGIN');
    lockOpen = true;
    await locker.query(
      `INSERT INTO mini_pms.interval
      (device_id,period_start,active_import_kwh,active_export_kwh,inductive_kvarh,capacitive_kvarh)
      VALUES ($1,$2,10,0,2,0.5)`,
      [device.id, blockedPeriod],
    );
    const before = await committed();
    output = '';
    const blockedOffset = await send(event({ periodStart: blockedPeriod }));
    const laterPeriod = '2026-01-01T10:30:00.000Z';
    const laterOffset = await send(event({ periodStart: laterPeriod }));
    await until(
      () =>
        output.includes('statement timeout') ||
        output.includes('statement_timeout'),
      'injected DB timeout',
    );
    assert.equal(await committed(), before);
    assert.equal((await rows(laterPeriod)).length, 0);
    assert.equal(dlq.length, 5);
    console.log(
      `PASS manual commit: DB failure leaves offset=${before}; blocked message=${blockedOffset}; next message not skipped`,
    );
    await locker.query('ROLLBACK');
    lockOpen = false;
    await until(
      async () => (await committed()) === laterOffset + 1n,
      'recovery after DB timeout',
    );
    assert.equal((await rows(blockedPeriod)).length, 1);
    assert.equal((await rows(laterPeriod)).length, 1);
    assert.equal(
      JSON.parse(
        await redis.hget(`mpms:measurement:latest:${device.id}`, 'measurement'),
      ).periodStart,
      laterPeriod,
    );
    console.log(
      'PASS recovery: both messages saved once, latest updated, offset advanced',
    );

    // Aynı Kafka grubunda duplicate, conflict, bozuk JSON ve FK hatası.
    // Tek hatalı kayıt sağlam ölçümlerin yazılmasını engellememeli.
    const mixedPeriod = '2026-01-01T11:00:00.000Z';
    const newestPeriod = '2026-01-01T11:15:00.000Z';
    const mixed = [
      event({ periodStart: mixedPeriod }),
      event({ periodStart: mixedPeriod }),
      event({ periodStart: mixedPeriod, activeImportKwh: 12 }),
      '{mixed broken JSON',
      event({ deviceId: absentId, periodStart: mixedPeriod }),
      event({ periodStart: newestPeriod }),
    ];
    const sent = await producer.send({
      topic: rawTopic,
      acks: -1,
      messages: mixed.map((value) => ({
        partition: 0,
        key: typeof value === 'string' ? device.id : value.deviceId,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })),
    });
    const endOffset = BigInt(sent[0].baseOffset) + BigInt(mixed.length);
    await until(
      async () => (await committed()) === endOffset,
      'mixed batch commit',
    );
    await until(() => dlq.length === 8, 'mixed batch DLQ');
    assert.equal((await rows(mixedPeriod)).length, 1);
    assert.equal((await rows(mixedPeriod))[0].active_import_kwh, '10');
    assert.equal((await rows(newestPeriod)).length, 1);
    assert.equal(
      JSON.parse(
        await redis.hget(`mpms:measurement:latest:${device.id}`, 'measurement'),
      ).periodStart,
      newestPeriod,
    );
    console.log(
      'PASS mixed batch: first value wins; duplicate, conflict and FK isolation preserve valid rows; Redis/offset complete',
    );
    await stopChild();
    console.log('PASS graceful shutdown');
    console.log(
      JSON.stringify({
        result: 'PASS',
        rawTopic,
        dlqTopic,
        groupId,
        testDevice: device.id,
        dlqMessages: dlq.length,
        finalOffset: (await committed()).toString(),
      }),
    );
  } finally {
    if (lockOpen) await locker.query('ROLLBACK');
    await stopChild();
    await observer.disconnect();
    await producer.disconnect();
    if (device) {
      await redis.del(`mpms:measurement:latest:${device.id}`);
      await db.query('DELETE FROM mini_pms.interval WHERE device_id=$1', [
        device.id,
      ]);
      await db.query(
        'DELETE FROM mini_pms.device WHERE id=$1 AND created_by=$2',
        [device.id, runId],
      );
    }
    await admin.disconnect();
    await redis.quit();
    await locker.end();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
