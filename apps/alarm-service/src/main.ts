/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  // Her servis farklı varsayılan port kullanır; böylece bağımsız `nx serve`
  // komutları web uygulamasının 3000 portunu ele geçirmez.
  const port = process.env.ALARM_SERVICE_PORT || process.env.PORT || 3006;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
