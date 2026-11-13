const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');
const { join } = require('path');

/**
 * sync-topology bakım komutu için ayrı Webpack giriş noktası.
 *
 * Normal webpack.config.js main.ts dosyasını paketler. Bu yapılandırma ise
 * HTTP/RabbitMQ bootstrap'ını içermeyen sync-topology.ts dosyasını paketler.
 */
module.exports = {
  target: 'node',

  output: {
    // Normal servis çıktısını silmemek için farklı bir klasör kullanılır.
    path: join(__dirname, 'dist-sync-topology'),
    clean: true,
  },

  plugins: [
    new IgnorePlugin({
      resourceRegExp:
        /^(kafkajs|mqtt|nats|@grpc\/grpc-js|@grpc\/proto-loader|@nestjs\/websockets\/socket-module|class-transformer\/storage)$/,
    }),

    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/sync-topology.ts',
      tsConfig: './tsconfig.app.json',
      assets: [],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
