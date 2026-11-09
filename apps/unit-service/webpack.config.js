
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');
const { join } = require('path');

module.exports = {
  target: 'node',

  output: {
    path: join(__dirname, 'dist'),
    clean: true,
  },

  plugins: [
    new IgnorePlugin({
  resourceRegExp:
    /^(kafkajs|mqtt|nats|ioredis|@grpc\/grpc-js|@grpc\/proto-loader|@nestjs\/websockets\/socket-module|class-transformer\/storage)$/,
}),
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
