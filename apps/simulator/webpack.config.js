const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
  },
  plugins: [
    // Nest'in kullanmadığımız transport adaptörlerini bundle'a dahil etme.
    // KafkaJS producer ve RabbitMQ bağımlılıkları dahil kalır.
    new IgnorePlugin({
      resourceRegExp:
        /^(mqtt|nats|@grpc\/grpc-js|@grpc\/proto-loader|@nestjs\/websockets\/socket-module|class-transformer\/storage)$/,
    }),
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
