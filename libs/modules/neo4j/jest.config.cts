// Jest yapılandırması CommonJS dosyası olduğu için Node yardımcısını
// require ile alıyoruz.
const { readFileSync } = require('fs');

// Neo4j testlerine özel TypeScript ve decorator dönüşüm ayarlarını okuruz.
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// SWC'nin üst klasörlerde başka bir .swcrc aramasını engelleriz.
swcJestConfig.swcrc = false;

module.exports = {
  // Nx/Jest çıktısında paketi ayırt etmemizi sağlar.
  displayName: 'neo4j',

  // Monorepo'nun ortak Jest ayarlarını kullanırız.
  preset: '../../../jest.preset.cjs',

  // Neo4j driver ve NestJS kodları tarayıcıda değil Node.js'te çalışır.
  testEnvironment: 'node',

  // TypeScript testlerini hızlı biçimde JavaScript'e dönüştürür.
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },

  // Kaynak importlarındaki .js uzantısını test sırasında .ts dosyasına eşler.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: 'test-output/jest/coverage',
};
