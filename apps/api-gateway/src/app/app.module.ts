
import { Module } from '@nestjs/common';

import {
  ClientsModule,
  Transport,
} from '@nestjs/microservices';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Gateway'in genel controller ve service dosyaları.
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Organization Unit HTTP endpointleri.
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';

// Device HTTP endpointleri.
import { DevicesController } from './devices/devices.controller';
import { DevicesService } from './devices/devices.service';

// Reactive Limit HTTP endpointleri.
import { ReactiveLimitsController } from './reactive-limits/reactive-limits.controller.js';
import { ReactiveLimitsService } from './reactive-limits/reactive-limits.service.js';
import { RolesGuard } from '../auth/roles.guard';

import { AuthController } from '../auth/auth.controller';
@Module({
  imports: [
    // Unit Service ile RabbitMQ üzerinden haberleşmek
    // için tek bir ClientProxy oluşturuyoruz.
    ClientsModule.register([
      {
        // Service'lerde @Inject('UNIT_SERVICE') ile kullanılır.
        name: 'UNIT_SERVICE',

        // Mesajlaşma protokolü olarak RabbitMQ kullanıyoruz.
        transport: Transport.RMQ,

        options: {
          // RabbitMQ bağlantı adresi.
          urls: [
            process.env.RABBITMQ_URL ??
              'amqp://mpms:mpms_dev_password@localhost:5672',
          ],

          // Unit Service'in dinlediği kuyruk.
          queue: 'mpms.unit',

          // Kuyruğun broker yeniden başladığında
          // tanımının korunmasını sağlar.
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],

  // HTTP isteklerini karşılayan controller'lar.
  controllers: [
    AppController,
    UnitsController,
    DevicesController,
    AuthController,
    ReactiveLimitsController,
  ],

  // Controller'ların kullandığı servisler.
 providers: [
  AppService,
  UnitsService,
  DevicesService,
  ReactiveLimitsService,

  // Önce JWT doğrulanır.
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },

  // Sonra kullanıcının rolü kontrol edilir.
  {
    provide: APP_GUARD,
    useClass: RolesGuard,
  },
],
})
export class AppModule {}
