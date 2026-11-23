/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'ingestion-service',
  preset: '../../jest.preset.cjs',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  // TypeORM'un ESM paketlerini de SWC ile Jest'in okuyacağı biçime çevir.
  // pnpm gerçek dosyaları .pnpm dizini altında tutar.
  transformIgnorePatterns: [
    'node_modules/.pnpm/(?!(?:@nestjs\\+typeorm|typeorm)@)',
    'node_modules/(?!\\.pnpm/|@nestjs/typeorm/|typeorm/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
