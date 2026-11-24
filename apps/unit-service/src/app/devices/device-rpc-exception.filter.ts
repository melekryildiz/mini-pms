import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';

// ValidationPipe hataları controller metoduna girmeden oluşur.
// RabbitMQ tarafında bunların da 400 olarak Gateway'e ulaşmasını sağla.
@Catch()
export class DeviceRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      return super.catch(
        new RpcException({
          statusCode: error.getStatus(),
          message:
            typeof response === 'object' && 'message' in response
              ? response.message
              : error.message,
        }),
        host,
      );
    }
    return super.catch(error, host);
  }
}
