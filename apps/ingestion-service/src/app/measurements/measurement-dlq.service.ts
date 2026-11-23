import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { Kafka, Partitioners } from 'kafkajs';

import { MEASUREMENT_DLQ_TOPIC } from './measurement.constants.js';

/** Mesajın neden reddedildiği. */
export type MeasurementErrorCode =
  | 'INVALID_MEASUREMENT'
  | 'MEASUREMENT_CONFLICT'
  | 'MEASUREMENT_REJECTED';

/**
 * Consumer bu bilgileri Kafka kaydından alacak.
 * Offset büyük olabileceği için string tutuyoruz.
 */
export interface MeasurementMessage {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  raw: string | null;
}

/** Orchestrator hata kararını verdikten sonra bu servisi çağıracak. */
export interface DlqInput {
  message: MeasurementMessage;
  code: MeasurementErrorCode;
  reason: string;
}

@Injectable() // bu metotlar classta bulunacak.
export class MeasurementDlqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeasurementDlqService.name);

  private readonly kafka = new Kafka({
    clientId: 'mini-pms-ingestion-dlq',

    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
  });

  private readonly producer = this.kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: false,
    maxInFlightRequests: 1,
  });

  /** Her mesajda bağlantı açmak yerine başlangıçta bir kez açıyoruz. */
  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log('DLQ producer connected');
  }

  async publish(input: DlqInput): Promise<void> {
    await this.publishMany([input]);
  }

  async publishMany(inputs: DlqInput[]): Promise<void> {
    if (inputs.length === 0) return;

    const messages = inputs.map(({ message, code, reason }) => {
      const payload = {
        // Aynı kaynak mesaj tekrar DLQ'ya gelirse tanıyabilmek için.
        // Bu alan tek başına Kafka'da tekrar gönderimi engellemez.
        failureId: `${message.topic}:${message.partition}:${message.offset}`,

        failedAt: new Date().toISOString(),

        error: {
          code,
          reason,
        },

        // Sorunlu mesajın hangi Kafka kaydından geldiğini saklıyoruz.
        original: {
          topic: message.topic,
          partition: message.partition,
          offset: message.offset,
          key: message.key,

          // Tekrar JSON.parse yapmıyoruz.
          // Bozuk JSON da olduğu gibi saklanabilmeli.
          raw: message.raw,
        },
      };

      return {
        key: message.key ?? payload.failureId,
        value: JSON.stringify(payload),
      };
    });

    await this.producer.send({
      topic: MEASUREMENT_DLQ_TOPIC,

      // Kafka'nın mevcut in-sync replica'larından onay bekle.
      acks: -1,

      messages,
    });

    // Bu log yalnızca gönderim onaylandıktan sonra yazılır.
    this.logger.warn(`DLQ'ya ${inputs.length} mesaj gönderildi.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
    this.logger.log('DLQ producer disconnected');
  }
}
