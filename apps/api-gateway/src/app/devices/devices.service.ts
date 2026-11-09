
import {
  Injectable,
  Inject,
  GatewayTimeoutException,
  BadGatewayException,
} from '@nestjs/common';

import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import {
  CreateDeviceDto,
  UpdateDeviceDto,
} from '@mini-pms/contracts';

@Injectable()
export class DevicesService {
  constructor(
    @Inject('UNIT_SERVICE')
    private readonly unitClient: ClientProxy,
  ) {}

  private async request<T>(
    pattern: string,
    payload: unknown,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        this.unitClient
          .send<T>(pattern, payload)
          .pipe(timeout(5000)),
      );
    } catch (error) {
      console.error('DEVICE RPC ERROR:', error);

      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException(
          'Unit Service did not respond in time',
        );
      }

      throw new BadGatewayException(
        'Device request failed',
      );
    }
  }

  findAll(query: { page?: number; limit?: number }) {
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
