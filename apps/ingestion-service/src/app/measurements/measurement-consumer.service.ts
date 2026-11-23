import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { setTimeout as sleep } from 'node:timers/promises';
import { Kafka } from 'kafkajs';

import {
  MEASUREMENT_RAW_TOPIC,
  MEASUREMENT_BATCH_SIZE,
  MEASUREMENT_WRITE_MODE,
} from './measurement.constants.js';
import { MeasurementOrchestrator } from './measurement.orchestrator.js';

@Injectable()
export class MeasurementConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MeasurementConsumerService.name);

  private stopping = false;
  private processingStarted = false;

  private readonly kafka = new Kafka({
    clientId: 'mini-pms-ingestion',

    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
  });

  private readonly consumer = this.kafka.consumer({
    // Sabit olmalı; yeniden başlayınca kaldığı offset'ten devam eder.
    groupId: process.env.MEASUREMENT_CONSUMER_GROUP ?? 'mpms-ingestion',

    allowAutoTopicCreation: false,

    sessionTimeout: 60_000,
    heartbeatInterval: 3_000,
  });

  constructor(private readonly orchestrator: MeasurementOrchestrator) {}

  /**
   * Modüller hazırlandıktan sonra okumaya başlar.
   * Böylece DLQ producer'ın başlangıç bağlantısı da tamamlanmış olur.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.connect();

    await this.consumer.subscribe({
      topic: MEASUREMENT_RAW_TOPIC,

      // Grubun kayıtlı offset'i yoksa eski mesajları da oku.
      // Kayıtlı offset varsa oradan devam eder.
      fromBeginning: true,
    });

    await this.consumer.run({
      // Offset'i yalnızca bizim kodumuz ilerletecek.
      autoCommit: false,
      eachBatchAutoResolve: false,

      // İlk sürümde işlemleri sırayla yürütüyoruz.
      partitionsConsumedConcurrently: 1,

      eachBatch: async ({
        batch,
        resolveOffset,
        heartbeat,
        isRunning,
        isStale,
      }) => {
        // Kafka'nın getirdiği mevcut mesajları parçala; grup dolmasını bekleme.
        const size =
          MEASUREMENT_WRITE_MODE === 'single' ? 1 : MEASUREMENT_BATCH_SIZE;
        for (let start = 0; start < batch.messages.length; start += size) {
          const chunk = batch.messages.slice(start, start + size);
          const last = chunk[chunk.length - 1];
          const messages = chunk.map((message) => ({
            topic: batch.topic,
            partition: batch.partition,
            offset: message.offset,
            key: message.key?.toString('utf8') ?? null,
            raw: message.value?.toString('utf8') ?? null,
          }));
          while (!this.stopping && isRunning() && !isStale()) {
            try {
              if (!this.processingStarted) {
                this.processingStarted = true;
                this.logger.log(
                  `Processing started: mode=${MEASUREMENT_WRITE_MODE}, batchSize=${size}`,
                );
              }
              const results =
                MEASUREMENT_WRITE_MODE === 'single'
                  ? [await this.orchestrator.process(messages[0])]
                  : await this.orchestrator.processBatch(messages);
              if (results.length !== messages.length)
                throw new Error('Eksik grup sonucu');
              if (this.stopping || !isRunning() || isStale()) return;
              await heartbeat();
              // Bütün DB/Redis/DLQ işleri bitmeden grubun ilerisini commit etme.
              await this.consumer.commitOffsets([
                {
                  topic: batch.topic,
                  partition: batch.partition,
                  offset: (BigInt(last.offset) + 1n).toString(),
                },
              ]);
              for (const message of chunk) resolveOffset(message.offset);
              this.logger.debug(
                `Grup tamamlandı: ${chunk.length} mesaj, ${batch.topic}/${batch.partition}/${last.offset}`,
              );
              break;
            } catch (error: unknown) {
              if (this.stopping) return;
              this.logger.error(
                `Grup tamamlanamadı, tekrar denenecek: ${batch.topic}/${batch.partition}/${chunk[0].offset}-${last.offset}`,
                error instanceof Error ? error.message : String(error),
              );
            }
            await heartbeat();
            await sleep(1_000);
          }
          if (this.stopping || !isRunning() || isStale()) return;
        }
      },
    });

    this.logger.log('Measurement consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    await this.consumer.stop();
    await this.consumer.disconnect();

    this.logger.log('Measurement consumer disconnected');
  }
}
