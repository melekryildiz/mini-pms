// node apps/simulator/scripts/verify.cjs [--integration]
// Kaynak TS dosyalarını yükler; uygulamanın derleme ayarlarını değiştirmez.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const nativeRequire = createRequire(path.resolve(__dirname, '../package.json'));
const { Logger } = nativeRequire('@nestjs/common');
Logger.overrideLogger(false);

function loader(globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ console, process, Buffer, ...globals });
  function load(name) {
    const file = path.resolve(__dirname, '../src/app', name);
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
    const localRequire = (request) =>
      request.startsWith('.')
        ? load(
            path.relative(
              path.resolve(__dirname, '../src/app'),
              path.resolve(path.dirname(file), request.replace(/\.js$/, '.ts')),
            ),
          )
        : nativeRequire(request);
    vm.runInContext(
      `(function(require,module,exports){${outputText}\n})`,
      context,
      { filename: file },
    )(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}

async function unitChecks() {
  let now = Date.parse('2026-01-02T07:23:00Z');
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  const random = Object.create(Math);
  const load = loader({ Date: Clock, Math: random });
  const { generateMeasurement: generate, getLastCompletedPeriodStart: last } =
    load('measurement-generator.ts');
  const { SimulationRunnerService: Runner } = load(
    'simulation-runner.service.ts',
  );
  const meter = { id: '3', serialNo: 'test-3', organizationUnitId: '1' };
  const at = (hour) => new Date(`2026-01-01T${hour}:00:00+03:00`);
  const night = generate(meter, at('02'), 'normal');
  const evening = generate(meter, at('19'), 'normal');
  assert.ok(evening.activeImportKwh > night.activeImportKwh);
  assert.equal(evening.activeExportKwh, 0);
  const high = generate(meter, at('19'), 'high-inductive');
  assert.ok(high.inductiveKvarh / high.activeImportKwh >= 0.549);
  const solar = { ...meter, simulationProfile: 'solar' };
  assert.ok(generate(solar, at('12'), 'normal').activeExportKwh > 0);
  assert.equal(generate(solar, at('02'), 'normal').activeExportKwh, 0);
  assert.ok(generate(solar, at('12'), 'corrupt').activeImportKwh < 0);
  assert.throws(() => generate(meter, new Date('invalid'), 'normal'));
  assert.throws(() => generate(meter, new Date('2026-01-01T00:01Z'), 'normal'));
  assert.throws(() => generate(meter, new Date(now), 'normal'));
  assert.equal(last().toISOString(), '2026-01-02T07:00:00.000Z');

  const sent = [];
  const runner = new Runner(
    { getActiveMeters: async () => [meter] },
    { publish: async (event) => sent.push(event) },
  );
  await runner.runOnce('duplicate');
  assert.equal(sent.length, 2);
  assert.strictEqual(sent[0], sent[1]);
  sent.length = 0;
  random.random = () => 0.05;
  await runner.runOnce('missing');
  assert.equal(sent.length, 0);
  random.random = () => 0.5;
  await runner.runOnce('missing');
  assert.equal(sent.length, 1);
  sent.length = 0;
  await runner.runBackfill(at('10'), at('11'), new AbortController().signal);
  assert.equal(sent.length, 4);
  assert.equal(sent[3].periodStart, '2026-01-01T07:45:00.000Z');
  const controller = new AbortController();
  let beforeStop = 0;
  const stopped = new Runner(
    { getActiveMeters: async () => [meter, meter] },
    {
      publish: async () => {
        beforeStop += 1;
        controller.abort();
      },
    },
  );
  await stopped.runBackfill(at('10'), at('11'), controller.signal);
  assert.ok(controller.signal.aborted);
  assert.equal(beforeStop, 1);

  // Gerçek 15 dakika beklemek yerine yalnızca test saatini ilerletir.
  const live = new Runner({}, {});
  const liveController = new AbortController();
  const periods = [];
  live.runOnce = async (_mode, period) => {
    periods.push(period.toISOString());
    if (periods.length === 1) now = Date.parse('2026-01-02T07:45:00Z');
    else if (periods.length === 3) liveController.abort();
  };
  await live.runLive('normal', liveController.signal);
  assert.deepEqual(periods, [
    '2026-01-02T07:00:00.000Z',
    '2026-01-02T07:15:00.000Z',
    '2026-01-02T07:30:00.000Z',
  ]);
  // Gerçek bekleme de abort ile kesilmeli.
  const waiting = new Runner({}, {});
  const waitController = new AbortController();
  waiting.runOnce = async () => setTimeout(() => waitController.abort(), 10);
  await waiting.runLive('normal', waitController.signal);

  const optionsLoad = loader();
  const { readSimulationOptions } = optionsLoad('simulation-options.ts');
  const argv = process.argv;
  try {
    for (const args of [
      ['unknown'],
      ['normal', '--from', '2026-01-01T00:00:00Z'],
      ['backfill'],
      [
        'backfill',
        '--from',
        '2026-02-30T00:00:00Z',
        '--to',
        '2026-03-03T00:00:00Z',
      ],
      [
        'backfill',
        '--from',
        '2026-01-01T00:01:00Z',
        '--to',
        '2026-01-02T00:00:00Z',
      ],
    ]) {
      process.argv = ['node', 'simulator', ...args];
      assert.throws(readSimulationOptions);
    }
  } finally {
    process.argv = argv;
  }
  console.log(
    'PASS: daily curve, solar export, corrupt, duplicate, missing, backfill, live periods, cancellation, CLI validation',
  );
}

async function integrationChecks() {
  const load = loader();
  const { ClientProxyFactory, Transport } = nativeRequire(
    '@nestjs/microservices',
  );
  const { Kafka, logLevel } = nativeRequire('kafkajs');
  const { MeterCatalogService } = load('meter-catalog.service.ts');
  const { MeasurementProducerService } = load(
    'measurement-producer.service.ts',
  );
  const { SimulationRunnerService } = load('simulation-runner.service.ts');
  const client = ClientProxyFactory.create({
    transport: Transport.RMQ,
    options: {
      urls: [
        process.env.RABBITMQ_URL ??
          'amqp://mpms:mpms_dev_password@localhost:5672',
      ],
      queue: 'mpms.unit',
      queueOptions: { durable: true },
    },
  });
  const catalog = new MeterCatalogService(client);
  const producer = new MeasurementProducerService();
  const consumer = new Kafka({
    clientId: 'simulator-acceptance',
    logLevel: logLevel.ERROR,
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
  }).consumer({ groupId: `simulator-acceptance-${Date.now()}` });
  const expected = [];
  const received = [];
  const publish = producer.publish.bind(producer);
  producer.publish = async (event) => {
    await publish(event);
    expected.push(event);
  };
  try {
    await catalog.onApplicationBootstrap();
    const meters = await catalog.getActiveMeters();
    assert.ok(meters.length > 0, 'RPC must return active meters');
    await producer.onModuleInit();
    await consumer.connect();
    // Yeni grubun ilk offset çözümlemesiyle gönderimin yarışmasını önler.
    // Aşağıda yalnızca bu testin eventId'leri kabul edilir.
    await consumer.subscribe({
      topic: 'mpms.measurement.raw',
      fromBeginning: true,
    });
    const joined = new Promise((resolve) =>
      consumer.on(consumer.events.GROUP_JOIN, resolve),
    );
    await consumer.run({
      eachMessage: async ({ partition, message }) => {
        received.push({
          partition,
          key: message.key.toString(),
          raw: message.value.toString(),
          event: JSON.parse(message.value.toString()),
        });
      },
    });
    await joined;
    const runner = new SimulationRunnerService(catalog, producer);
    for (const mode of ['normal', 'high-inductive', 'corrupt', 'duplicate']) {
      await runner.runOnce(mode);
    }
    // Missing olasılık dallarını broker'a sahte cihaz eklemeden doğrula.
    // Gerçek random ile az sayıda cihazda sıfır atlama da geçerlidir.
    await runner.runOnce('missing');
    await runner.runBackfill(
      new Date('2026-01-01T07:00:00Z'),
      new Date('2026-01-01T08:00:00Z'),
      new AbortController().signal,
    );
    const ids = new Set(expected.map((event) => event.eventId));
    const deadline = Date.now() + 30000;
    while (
      received.filter((record) => ids.has(record.event.eventId)).length <
      expected.length
    ) {
      assert.ok(Date.now() < deadline, 'Kafka consumer timed out');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const records = received.filter((record) => ids.has(record.event.eventId));
    assert.equal(records.length, expected.length);
    const partitions = new Map();
    for (const record of records) {
      const event = record.event;
      assert.equal(record.key, event.deviceId);
      if (partitions.has(record.key))
        assert.equal(record.partition, partitions.get(record.key));
      partitions.set(record.key, record.partition);
      assert.equal(event.intervalMinutes, 15);
      if (event.simulationMode === 'corrupt')
        assert.ok(event.activeImportKwh < 0);
      else assert.ok(event.activeImportKwh >= 0);
      if (event.simulationMode === 'high-inductive') {
        assert.ok(event.inductiveKvarh / event.activeImportKwh >= 0.549);
      }
    }
    for (const event of expected.filter(
      (event) => event.simulationMode === 'duplicate',
    )) {
      const copies = records.filter(
        (record) => record.event.eventId === event.eventId,
      );
      assert.equal(copies.length, 2);
      assert.equal(copies[0].raw, copies[1].raw);
    }
    console.log(
      JSON.stringify({
        result: 'PASS',
        rpcMeters: meters.length,
        kafkaMessages: records.length,
        partitions: Object.fromEntries(partitions),
      }),
    );
  } finally {
    await consumer.disconnect();
    await producer.onModuleDestroy();
    await catalog.onApplicationShutdown();
  }
}

(async () => {
  await unitChecks();
  if (process.argv.includes('--integration')) await integrationChecks();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
