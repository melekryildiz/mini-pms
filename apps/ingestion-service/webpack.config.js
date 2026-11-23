const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');
const { join } = require('path');

module.exports = {
  externals: [{ '@nestjs/microservices': 'commonjs @nestjs/microservices' }],
  // Nest core RabbitMQ sunucusunu runtime'da yükler. RpcException da aynı
  // paket kopyasından gelmeli; bundle içine ikinci sınıf kopyası alma.
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    // Kafka ve RabbitMQ kullanılır; diğer opsiyonel Nest transportları gerekmez.
    new IgnorePlugin({
      resourceRegExp:
        /^(mqtt|nats|@grpc\/grpc-js|@grpc\/proto-loader|@nestjs\/websockets\/socket-module|class-transformer\/storage)$/,
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
