
import {
  Controller,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import {
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';

import { ReactiveLimitService } from './reactive-limit.service.js';
import { ReactiveLimitOrchestrator } from './reactive-limit.orchestrator.js';

import {
  CreateReactiveLimitDto,
  UpdateReactiveLimitDto,
} from '@mini-pms/contracts';

@Controller()
export class ReactiveLimitRpcController {
  constructor(
    private readonly reactiveLimitService: ReactiveLimitService,
    private readonly reactiveLimitOrchestrator: ReactiveLimitOrchestrator,
  ) {}

  /**
   * HTTP hatalarını RabbitMQ üzerinden taşınabilecek
   * RPC hatalarına dönüştürür.
   *
   * Örneğin:
   * 400 -> Geçersiz veri
   * 404 -> Kayıt bulunamadı
   * 409 -> Çakışan kayıt
   */
  private async handleRpc<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) {
        throw new RpcException({
          statusCode: error.getStatus(),
          message: error.message,
        });
      }

      // Beklenmeyen hatayı logluyoruz.
      console.error(
        'Reactive Limit RPC unexpected error:',
        error,
      );

      throw new RpcException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    }
  }

  /**
   * CREATE
   *
   * Yeni bir reaktif limit oluşturur.
   *
   * DTO'dan gelen tarih alanları string'dir.
   * Orchestrator'a göndermeden önce Date'e çeviriyoruz.
   */
  @MessagePattern('reactiveLimit.create')
  create(
    @Payload() data: CreateReactiveLimitDto,
  ) {
    return this.handleRpc(() =>
      this.reactiveLimitOrchestrator.create({
        organization_unit_id: data.organization_unit_id,
        limit_type: data.limit_type,
        limit_value: data.limit_value,
        valid_from: new Date(data.valid_from),
        valid_to: data.valid_to
          ? new Date(data.valid_to)
          : null,
      }),
    );
  }

  /**
   * UPDATE
   *
   * Belirtilen reaktif limitin değerini günceller.
   *
   * Mevcut DTO yalnızca limit_value alanının
   * değiştirilmesine izin veriyor.
   */
  @MessagePattern('reactiveLimit.update')
  update(
    @Payload()
    payload: {
      id: string;
      dto: UpdateReactiveLimitDto;
    },
  ) {
    return this.handleRpc(() =>
      this.reactiveLimitOrchestrator.update(
        payload.id,
        {
          limit_value: payload.dto.limit_value,
        },
      ),
    );
  }

  /**
   * FIND ACTIVE BY UNIT ID
   *
   * Belirtilen organizasyon biriminin
   * aktif reaktif limitlerini getirir.
   */
  @MessagePattern('reactiveLimit.findActiveByUnitId')
  findActiveByUnitId(
    @Payload() payload: { unitId: string },
  ) {
    return this.handleRpc(() =>
      this.reactiveLimitService.findActiveByUnitId(
        payload.unitId,
      ),
    );
  }

  /**
   * FIND BY UNIT ID
   *
   * Belirtilen organizasyon birimine ait
   * reaktif limit kayıtlarını getirir.
   */
  @MessagePattern('reactiveLimit.findByUnitId')
  findByUnitId(
    @Payload() payload: { unitId: string },
  ) {
    return this.handleRpc(() =>
      this.reactiveLimitService.findByUnitId(
        payload.unitId,
      ),
    );
  }

  /**
   * FIND BY ID
   *
   * Reaktif limit kaydını kendi ID'siyle getirir.
   */
  @MessagePattern('reactiveLimit.findById')
  findById(
    @Payload() payload: { id: string },
  ) {
    return this.handleRpc(() =>
      this.reactiveLimitService.findById(
        payload.id,
      ),
    );
  }
}
