
import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';

import { ClientProxy } from '@nestjs/microservices';

import {
  firstValueFrom,
  TimeoutError,
  timeout,
} from 'rxjs';

import {
  CreateReactiveLimitDto,
  UpdateReactiveLimitDto,
} from '@mini-pms/contracts';

@Injectable()
export class ReactiveLimitsService {
  constructor(
    // Unit Service'e bağlı RabbitMQ client.
    @Inject('UNIT_SERVICE')
    private readonly unitClient: ClientProxy,
  ) {}

  /**
   * Ortak RPC request metodu.
   *
   * RabbitMQ'ya mesaj gönderir ve yanıtı bekler.
   * Timeout veya servis hatalarını HTTP hatalarına çevirir.
   */
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
    } catch (error: unknown) {
      // Unit Service 5 saniye içinde cevap vermezse.
      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException(
          'Unit Service timeout',
        );
      }

      // RPC üzerinden iletilen beklenen HTTP hataları.
      if (
        error !== null &&
        typeof error === 'object' &&
        'statusCode' in error &&
        'message' in error
      ) {
        const rpcError = error as {
          statusCode: unknown;
          message: unknown;
        };

        const allowedStatuses: number[] = [
          HttpStatus.BAD_REQUEST,
          HttpStatus.UNAUTHORIZED,
          HttpStatus.FORBIDDEN,
          HttpStatus.NOT_FOUND,
          HttpStatus.CONFLICT,
          HttpStatus.UNPROCESSABLE_ENTITY,
        ];

        if (
          typeof rpcError.statusCode === 'number' &&
          allowedStatuses.includes(rpcError.statusCode) &&
          typeof rpcError.message === 'string'
        ) {
          throw new HttpException(
            {
              statusCode: rpcError.statusCode,
              message: rpcError.message,
            },
            rpcError.statusCode,
          );
        }
      }

      // Beklenmeyen hataların ayrıntılarını dışarıya açmıyoruz.
      console.error(
        'Reactive Limit RPC unexpected error:',
        error,
      );

      throw new BadGatewayException(
        'Reactive Limit request failed',
      );
    }
  }

  /**
   * Yeni reaktif limit oluşturur.
   */
  create(dto: CreateReactiveLimitDto) {
    return this.request(
      'reactiveLimit.create',
      dto,
    );
  }

  /**
   * Reaktif limit değerini günceller.
   */
  update(id: string, dto: UpdateReactiveLimitDto) {
    return this.request(
      'reactiveLimit.update',
      { id, dto },
    );
  }

  /**
   * Birime ait aktif limitleri getirir.
   */
  findActiveByUnitId(unitId: string) {
    return this.request(
      'reactiveLimit.findActiveByUnitId',
      { unitId },
    );
  }

  /**
   * Birime ait bütün limit kayıtlarını getirir.
   */
  findByUnitId(unitId: string) {
    return this.request(
      'reactiveLimit.findByUnitId',
      { unitId },
    );
  }

  /**
   * Belirli bir reaktif limit kaydını getirir.
   */
  findById(id: string) {
    return this.request(
      'reactiveLimit.findById',
      { id },
    );
  }
}
