import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeasurementsModule } from './measurements/measurements.module.js';

@Module({
  imports: [
    // Ortam değişkenleri Nx veya node --env-file=.env ile yüklenir.
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      // forFeature ile kaydedilen entity'leri bu bağlantıya dahil eder.
      autoLoadEntities: true,
      // Mevcut interval tablosunu migration yönetir.
      synchronize: false,
      migrationsRun: false,
    }),
    MeasurementsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
