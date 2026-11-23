const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');
const { join } = require('path');

module.exports = {
  externals: [{ '@nestjs/microservices': 'commonjs @nestjs/microservices' }],
  // Runtime RabbitMQ sunucusu ile aynı RpcException sınıfını kullan.
  target: 'node',

  output: {
    path: join(__dirname, 'dist'),
    clean: true,
  },

  plugins: [
    new IgnorePlugin({
      resourceRegExp:
        /^(kafkajs|mqtt|nats|@grpc\/grpc-js|@grpc\/proto-loader|@nestjs\/websockets\/socket-module|class-transformer\/storage)$/,
    }),
    new NxAppWebpackPlugin({
      target: 'node',
      mergeExternals: true,
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
