import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { Kafka, Partitioners } from 'kafkajs';

import type { MeasurementEvent } from '@mini-pms/contracts';

import { MEASUREMENT_RAW_TOPIC } from './simulator.constants.js';

@Injectable()
export class MeasurementProducerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    MeasurementProducerService.name,
  );

  private readonly kafka = new Kafka({
    // Broker loglarında uygulamayı tanımamızı sağlar.
    clientId: 'mini-pms-simulator',

    // Lokal çalışan simulator: localhost:9092
    // Docker ağı içinde çalışan simulator: kafka:29092
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
  });

  private readonly producer = this.kafka.producer({
    // Partition seçimini message key üzerinden yapar.
    createPartitioner: Partitioners.DefaultPartitioner,

    // Topic'i istediğimiz partition sayısıyla önceden oluşturacağız.
    allowAutoTopicCreation: false,

    // Gönderimleri sırada tutmak için aynı anda tek istek.
    maxInFlightRequests: 1,
  });

  /** Nest uygulaması başlarken bağlantıyı bir kez açar. */
  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  /** Tek bir enerji ölçümünü Kafka'ya gönderir. */
  async publish(event: MeasurementEvent): Promise<void> {
    await this.producer.send({
      topic: MEASUREMENT_RAW_TOPIC,

      // Bütün mevcut in-sync replica'lardan onay bekler.
      // Lokal tek broker ortamında tek broker onayı alınır.
      acks: -1,

      messages: [
        {
          // Aynı sayacın mesajlarını aynı partition'a yönlendirir.
          key: event.deviceId,

          // Ortak sözleşmedeki enerji alanlarını JSON olarak taşır.
          value: JSON.stringify(event),
        },
      ],
    });

    // Her mesajı normal log seviyesinde yazıp logları şişirmiyoruz.
    this.logger.debug(
      `Published device=${event.deviceId} period=${event.periodStart}`,
    );
  }

  /** Nest uygulaması kapanırken bağlantıyı kapatır. */
  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }
}