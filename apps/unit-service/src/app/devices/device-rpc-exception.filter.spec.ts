import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { DeviceRpcExceptionFilter } from './device-rpc-exception.filter';

describe('Device RPC validation errors', () => {
  const filter = new DeviceRpcExceptionFilter();
  const host = {} as ArgumentsHost;
  it('controller öncesi DTO doğrulama hatasını 400 ve alan mesajlarıyla taşır', async () => {
    const response = filter.catch(
      new BadRequestException(['role must be MAIN or FEEDER']),
      host,
    );
    await expect(firstValueFrom(response)).rejects.toEqual({
      statusCode: 400,
      message: ['role must be MAIN or FEEDER'],
    });
  });
  it('servisten gelen 409 RpcException bilgisini korur', async () => {
    const response = filter.catch(
      new RpcException({ statusCode: 409, message: 'Active MAIN exists' }),
      host,
    );
    await expect(firstValueFrom(response)).rejects.toEqual({
      statusCode: 409,
      message: 'Active MAIN exists',
    });
  });
});
