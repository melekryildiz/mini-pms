
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

async function bootstrap() {
  // NestJS API Gateway uygulamasını oluştur.
  const app = await NestFactory.create(AppModule);

  // Gelen verileri DTO kurallarına göre doğrula.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Bütün endpoint'lerin başına /api ekle.
  app.setGlobalPrefix('api');

  // Keycloak realm adresi.
  const issuer = process.env.KEYCLOAK_ISSUER;

  if (!issuer) {
    throw new Error(
      'KEYCLOAK_ISSUER environment variable is required',
    );
  }

  // Swagger API dokümantasyonu.
  const config = new DocumentBuilder()
    .setTitle('Mini PMS API')
    .setDescription('Power Monitoring System API')
    .setVersion('1.0')

    // Mevcut manuel Bearer token desteğini koruyoruz.
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Keycloak access token giriniz.',
      },
      'access-token',
    )

    // Keycloak üzerinden OAuth2 Authorization Code + PKCE.
    .addOAuth2(
      {
        type: 'oauth2',
        description: 'Keycloak OAuth2 login with PKCE',
        flows: {
          authorizationCode: {
            authorizationUrl:
              `${issuer}/protocol/openid-connect/auth`,
            tokenUrl:
              `${issuer}/protocol/openid-connect/token`,
            scopes: {
              openid: 'OpenID Connect',
              profile: 'User profile',
              email: 'User email',
            },
          },
        },
      },
      'keycloak-oauth2',
    )
    .build();

  // Controller ve DTO bilgilerinden OpenAPI dokümanı oluştur.
  const document = SwaggerModule.createDocument(app, config);

  // Swagger UI dosyalarının konumunu bul.
  const gatewayRequire = createRequire(
    join(process.cwd(), 'apps/api-gateway/package.json'),
  );

  const swaggerUiPath = dirname(
    gatewayRequire.resolve('swagger-ui-dist/package.json'),
  );

  // Swagger UI.
  SwaggerModule.setup('api/docs', app, document, {
  useGlobalPrefix: false,
  customSwaggerUiPath: swaggerUiPath,

  swaggerOptions: {
    persistAuthorization: false,

    // Keycloak girişinden sonra Swagger'a dönülecek adres
    oauth2RedirectUrl:
      'http://localhost:3001/api/docs/oauth2-redirect.html',

    initOAuth: {
      clientId: 'mini-pms-web',
      appName: 'Mini PMS Swagger',
      scopes: ['openid', 'profile', 'email'],
      usePkceWithAuthorizationCodeGrant: true,
    },
  },
});

  // API Gateway portu.
  const port = Number(process.env.PORT) || 3001;

  await app.listen(port);

  console.log(`API Gateway: http://localhost:${port}/api`);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}

bootstrap();
