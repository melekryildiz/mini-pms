
import {
  Injectable,
  Inject,
  GatewayTimeoutException,
  BadGatewayException,
} from '@nestjs/common';

import { ClientProxy } from '@nestjs/microservices';

import {
  firstValueFrom,
  timeout,
  TimeoutError,
} from 'rxjs';

import {
  CreateUnitDto,
  UpdateUnitDto,
  ListUnitsQueryDto,
} from '@mini-pms/contracts';

@Injectable()
export class UnitsService {
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
      console.error('UNIT SERVICE RPC ERROR:', error);

      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException(
          'Unit Service did not respond in time',
        );
      }

      throw new BadGatewayException(
        'Unit Service request failed',
      );
    }
  }

  findOne(id: string) {
    return this.request('unit.findOne', { id });
  }

  findAll(query: ListUnitsQueryDto) {
    return this.request('unit.findAll', query);
  }

  // İşlemi yapan kullanıcıyı da Unit Service'e gönderiyoruz.
  create(dto: CreateUnitDto, username: string) {
    return this.request('unit.create', {
      dto,
      username,
    });
  }

  update(
    id: string,
    dto: UpdateUnitDto,
    username: string,
  ) {
    return this.request('unit.update', {
      id,
      dto,
      username,
    });
  }

  delete(id: string, username: string) {
    return this.request('unit.delete', {
      id,
      username,
    });
  }
}
