import {
  Injectable,
  Inject,
  GatewayTimeoutException,
  BadGatewayException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import {
  CreateDeviceDto,
  ListDevicesQueryDto,
  UpdateDeviceDto,
} from '@mini-pms/contracts';

@Injectable()
export class DevicesService {
  constructor(
    @Inject('UNIT_SERVICE')
    private readonly unitClient: ClientProxy,
  ) {}

  private async request<T>(pattern: string, payload: unknown): Promise<T> {
    try {
      return await firstValueFrom(
        this.unitClient.send<T>(pattern, payload).pipe(timeout(5000)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException(
          'Unit Service did not respond in time',
        );
      }

      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        'message' in error
      ) {
        const rpcError = error as { statusCode: unknown; message: unknown };
        const allowed = [400, 401, 403, 404, 409, 422];

        if (
          typeof rpcError.statusCode === 'number' &&
          allowed.includes(rpcError.statusCode) &&
          (typeof rpcError.message === 'string' ||
            (Array.isArray(rpcError.message) &&
              rpcError.message.every((item) => typeof item === 'string')))
        ) {
          throw new HttpException(
            { statusCode: rpcError.statusCode, message: rpcError.message },
            rpcError.statusCode as HttpStatus,
          );
        }
      }

      console.error('DEVICE RPC ERROR:', error);

      throw new BadGatewayException('Device request failed');
    }
  }

  findAll(query: ListDevicesQueryDto) {
    return this.request('device.findAll', query);
  }

  findOne(id: string) {
    return this.request('device.findOne', { id });
  }

  create(dto: CreateDeviceDto) {
    return this.request('device.create', dto);
  }

  update(id: string, dto: UpdateDeviceDto) {
    return this.request('device.update', { id, dto });
  }

  delete(id: string) {
    return this.request('device.delete', { id });
  }
}
