// Proje kökünde: node --env-file=.env apps/ingestion-service/scripts/benchmark.cjs
// Tekli ve toplu yolu aynı 48.000 benzersiz ölçümle, ayrı topic/group ile ölçer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '../../..');
const req = createRequire(path.resolve(__dirname, '../package.json'));
const redisReq = createRequire(
  path.join(root, 'libs/modules/redis/package.json'),
);
const { Kafka, logLevel } = req('kafkajs');
const { Client } = req('pg');
const Redis = redisReq('ioredis');
const count = 48000;
const runId = `ingestion-bench-${Date.now()}`;
const kafka = new Kafka({
  clientId: runId,
  logLevel: logLevel.ERROR,
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});
const admin = kafka.admin();
const producer = kafka.producer({ allowAutoTopicCreation: false });
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
let devices = [];
let child;
let output = '';
const topics = [];
const groups = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const active = child;
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      active.kill('SIGKILL');
      reject(new Error('Shutdown timed out'));
    }, 30000);
    active.once('error', reject);
    active.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  active.kill('SIGINT');
  const code = await done;
  assert.ok(code === 0 || active.signalCode === 'SIGINT', output.slice(-2000));
}
async function clearMeasurements() {
  if (!devices.length) return;
  const ids = devices.map((item) => item.id);
  await db.query(
    'DELETE FROM mini_pms.interval WHERE device_id = ANY($1::bigint[])',
    [ids],
  );
  await redis.del(...ids.map((id) => `mpms:measurement:latest:${id}`));
}
async function run(mode, messages) {
  await clearMeasurements();
  const raw = `${runId}-${mode}-raw`;
  const dlq = `${runId}-${mode}-dlq`;
  const group = `${runId}-${mode}`;
  topics.push(raw, dlq);
  groups.push(group);
  await admin.createTopics({
    waitForLeaders: true,
    topics: [raw, dlq].map((topic) => ({
      topic,
      numPartitions: 3,
      replicationFactor: 1,
    })),
  });
  const preparing = performance.now();
  for (let start = 0; start < messages.length; start += 1000) {
    await producer.send({
      topic: raw,
      acks: -1,
      messages: messages.slice(start, start + 1000),
    });
  }
  const producerMs = performance.now() - preparing;
  const targets = await admin.fetchTopicOffsets(raw);
  assert.equal(
    targets.reduce((sum, p) => sum + Number(p.offset), 0),
    count,
  );
  output = '';
  let firstMessageAt;
  const started = performance.now();
  child = spawn(process.execPath, ['apps/ingestion-service/dist/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      INGESTION_SERVICE_PORT: '0',
      MEASUREMENT_RAW_TOPIC: raw,
      MEASUREMENT_DLQ_TOPIC: dlq,
      MEASUREMENT_CONSUMER_GROUP: group,
      MEASUREMENT_WRITE_MODE: mode,
      MEASUREMENT_BATCH_SIZE: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output += chunk;
      if (
        firstMessageAt === undefined &&
        output.includes('Processing started:')
      )
        firstMessageAt = performance.now();
    });
  let complete = false;
  let nextProgress = performance.now() + 10000;
  while (performance.now() - started < 360000) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(output.slice(-3000));
    const fetched = await admin.fetchOffsets({ groupId: group, topics: [raw] });
    const offsets = fetched[0]?.partitions ?? [];
    complete = targets.every(
      (target) =>
        BigInt(
          offsets.find((item) => item.partition === target.partition)?.offset ??
            '-1',
        ) >= BigInt(target.offset),
    );
    if (complete) break;
    if (performance.now() > nextProgress) {
      const committed = offsets.reduce(
        (sum, item) => sum + Math.max(0, Number(item.offset)),
        0,
      );
      console.log(`${mode}: ${committed}/${count} committed`);
      nextProgress = performance.now() + 10000;
    }
    await sleep(100);
  }
  assert.ok(complete, `Processing timed out: ${output.slice(-1500)}`);
  assert.ok(firstMessageAt !== undefined);
  const durationMs = performance.now() - firstMessageAt;
  const rows = (
    await db.query(
      'SELECT count(*)::integer AS count FROM mini_pms.interval WHERE device_id=ANY($1::bigint[])',
      [devices.map((item) => item.id)],
    )
  ).rows[0].count;
  assert.equal(rows, count);
  const expectedLatest = new Date(
    Date.parse('2026-01-01T00:00:00Z') + 479 * 900000,
  ).toISOString();
  for (const device of devices) {
    const cached = JSON.parse(
      await redis.hget(`mpms:measurement:latest:${device.id}`, 'measurement'),
    );
    assert.equal(cached.periodStart, expectedLatest);
  }
  const dlqOffsets = await admin.fetchTopicOffsets(dlq);
  assert.equal(
    dlqOffsets.reduce((sum, item) => sum + Number(item.offset), 0),
    0,
  );
  await stop();
  const result = {
    mode,
    messages: count,
    batchSize: mode === 'single' ? 1 : 500,
    partitions: 3,
    durationSeconds: Number((durationMs / 1000).toFixed(3)),
    messagesPerSecond: Number((count / (durationMs / 1000)).toFixed(2)),
    producerSeconds: Number((producerMs / 1000).toFixed(3)),
    databaseRows: rows,
    redisDevices: devices.length,
    dlqMessages: 0,
    allOffsetsCommitted: true,
    under120Seconds: durationMs < 120000,
  };
  console.log(JSON.stringify(result));
  return result;
}
async function main() {
  try {
    await db.connect();
    await redis.connect();
    await admin.connect();
    await producer.connect();
    const unit = (
      await db.query(
        'SELECT id FROM mini_pms.organization_unit WHERE is_active=true AND is_deleted=false ORDER BY id LIMIT 1',
      )
    ).rows[0];
    assert.ok(unit);
    devices = (
      await db.query(
        `INSERT INTO mini_pms.device (organization_unit_id,serial_no,role,is_active,created_by)
      SELECT $1,$2 || '-' || n,'FEEDER',false,$2 FROM generate_series(1,100) AS n
      RETURNING id,serial_no,organization_unit_id`,
        [unit.id, runId],
      )
    ).rows;
    const producedAt = new Date().toISOString();
    const messages = [];
    for (let period = 0; period < 480; period++)
      for (const device of devices) {
        const event = {
          eventId: randomUUID(),
          schemaVersion: 1,
          deviceId: device.id,
          serialNo: device.serial_no,
          organizationUnitId: device.organization_unit_id,
          periodStart: new Date(
            Date.parse('2026-01-01T00:00:00Z') + period * 900000,
          ).toISOString(),
          intervalMinutes: 15,
          producedAt,
          source: 'simulator',
          simulationMode: 'backfill',
          activeImportKwh: 10 + period / 100,
          activeExportKwh: 0,
          inductiveKvarh: 2,
          capacitiveKvarh: 0.5,
        };
        messages.push({ key: device.id, value: JSON.stringify(event) });
      }
    const results = [];
    for (const mode of ['single', 'batch'])
      results.push(await run(mode, messages));
    const report = {
      runId,
      completedAt: new Date().toISOString(),
      node: process.version,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      memoryGiB: Number((os.totalmem() / 2 ** 30).toFixed(1)),
      measurement:
        'First processing log to final committed offsets; 100ms offset polling; producer preparation excluded',
      workload:
        '100 devices x 480 completed 15-minute periods; 48000 valid unique measurements; same payloads, clean DB/Redis per mode; 3 partitions, concurrency=1',
      results,
      speedup: Number(
        (results[0].durationSeconds / results[1].durationSeconds).toFixed(2),
      ),
      nfr05Passed: results[1].under120Seconds,
    };
    const reportDir = path.join(root, 'docs/reports');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'f3-t4-benchmark.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    const lines = [
      'F3-T4 toplu yazim olcumu',
      `Calisma: ${report.completedAt}`,
      `Makine: ${report.cpu}, ${report.memoryGiB} GiB RAM, ${report.platform}`,
      `Node: ${report.node}`,
      '',
      'Ayni 48.000 gecerli ve benzersiz olcum iki yontemle islendi.',
      'Her yontem oncesi yalniz test kayitlari ve test Redis degerleri temizlendi.',
      'Kafka: 3 partition, isleme paralelligi 1. PostgreSQL index/constraint kurallari ayni.',
      'Sure: ilk isleme logundan son offset commit kontrolune kadar; startup ve veri hazirlama haric.',
      'Offset kontrol araligi 100 ms; surede bu kadar kontrol gecikmesi olabilir.',
      'Bu rapor tekli ve toplu yontemin birer calistirmasidir; donanimdan bagimsiz garanti degildir.',
      '',
      ...results.map(
        (r) =>
          `${r.mode}: ${r.durationSeconds} sn, ${r.messagesPerSecond} mesaj/sn; DB=${r.databaseRows}, Redis=${r.redisDevices}, DLQ=${r.dlqMessages}; Kafka hazirlama=${r.producerSeconds} sn`,
      ),
      '',
      `Hizlanma: ${report.speedup} kat`,
      `NFR-05 (toplu <120 sn): ${report.nfr05Passed ? 'GECTI' : 'GECMEDI'}`,
      '',
      'Toplu normal yazim yolu her grup icin 1 INSERT + 1 karsilastirma SELECT kullanir.',
      'Redis pipeline, sayac basina en yeni olcumu yazar. Commit grup sonunda yapilir.',
      'Tekli yolda mesaj basina INSERT, Redis ve offset commit vardir.',
      'Olculen hizlanma yalniz SQL degil, tum bu toplulastirmalarin toplam etkisidir.',
      '48.000 satir, 100 Redis son degeri ve tamamlanan offsetler ayrica dogrulandi.',
      'Test cihazi, DB satirlari, Redis keyleri ve benchmark Kafka topic/gruplari temizlenir.',
    ];
    fs.writeFileSync(
      path.join(reportDir, 'f3-t4-benchmark.txt'),
      lines.join('\n') + '\n',
    );
    assert.ok(report.nfr05Passed, 'NFR-05 failed; results saved');
  } finally {
    await stop();
    await clearMeasurements();
    if (devices.length)
      await db.query(
        'DELETE FROM mini_pms.device WHERE id=ANY($1::bigint[]) AND created_by=$2',
        [devices.map((item) => item.id), runId],
      );
    await producer.disconnect();
    for (const groupId of groups) await admin.deleteGroups([groupId]);
    if (topics.length) await admin.deleteTopics({ topics });
    await admin.disconnect();
    await redis.quit();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
