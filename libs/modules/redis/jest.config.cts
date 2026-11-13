// Node.js'in dosya okuma yardımcısını CommonJS biçiminde alıyoruz.
// Jest config dosyası .cts olduğu için require kullanabilir.
const { readFileSync } = require('fs');

// Redis testleri için hazırladığımız SWC ayarlarını okuyoruz.
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// SWC'nin başka klasörlerde .swcrc aramasını engelliyoruz.
// Yalnızca bu pakete ait test ayarı kullanılacak.
swcJestConfig.swcrc = false;

module.exports = {
  // Nx ve terminal çıktısında test paketinin görünen adı.
  displayName: 'redis',

  // Monorepo'nun ortak Nx/Jest ayarları.
  preset: '../../../jest.preset.cjs',

  // Redis ve NestJS kodu tarayıcı değil Node.js üzerinde çalışır.
  testEnvironment: 'node',

  // TypeScript dosyalarını SWC ile JavaScript'e dönüştürür.
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },

  // Kaynak kod NodeNext için `.js` uzantısı kullanıyor; test sırasında aynı
  // import'un yanındaki TypeScript kaynak dosyasını bulmasını sağlıyoruz.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  moduleFileExtensions: ['ts', 'js', 'json'],

  // Coverage çıktısını Redis paketinin altında tutar.
  coverageDirectory: 'test-output/jest/coverage',
};
