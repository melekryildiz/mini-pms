import {
  Controller,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';

import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';

import { DeviceService } from './device.service.js';
import { DeviceOrchestrator } from './device.orchestrator.js';

import {
  CreateDeviceDto,
  UpdateDeviceDto,
  ListDevicesQueryDto,
} from '@mini-pms/contracts';

@Controller()
export class DeviceRpcController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly deviceOrchestrator: DeviceOrchestrator,
  ) {}

  /**
   * RPC ERROR HANDLER
   *
   * RabbitMQ üzerinden yapılan işlemlerde oluşan
   * HTTP hatalarını RPC formatına dönüştürür.
   *
   * Örneğin:
   * BadRequestException (400) -> RpcException (400)
   * NotFoundException (404)   -> RpcException (404)
   * ConflictException (409)   -> RpcException (409)
   *
   * Böylece API Gateway hatanın gerçek sebebini
   * öğrenebilir ve istemciye doğru HTTP kodunu dönebilir.
   */
  private async handleRpc<T>(operation: () => Promise<T>): Promise<T> {
    try {
      // İlgili servis işlemini çalıştırıyoruz.
      return await operation();
    } catch (error) {
      // NestJS HTTP hatalarını status koduyla birlikte iletiyoruz.
      if (error instanceof HttpException) {
        throw new RpcException({
          statusCode: error.getStatus(),
          message: error.message,
        });
      }

      // Beklenmeyen hataları sunucu loglarına yazıyoruz.
      // İç hata detaylarını istemciye göndermiyoruz.
      console.error('Device RPC unexpected error:', error);

      throw new RpcException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    }
  }

  /**
   * FIND ALL
   *
   * Gateway'den gelen device.findAll mesajını karşılar.
   * Cihazları sayfalama bilgilerine göre listeler.
   */
  @MessagePattern('device.findAll')
  findAll(
    @Payload()
    query: ListDevicesQueryDto,
  ) {
    return this.handleRpc(() =>
      this.deviceService.getList(
        Number(query?.page ?? '1'),
        Number(query?.limit ?? '10'),
        query.sortBy,
        query.sortOrder,
        {
          ...(query.organization_unit_id && {
            organization_unit_id: query.organization_unit_id,
          }),
          ...(query.is_active !== undefined && {
            is_active: query.is_active === 'true',
          }),
        },
      ),
    );
  }

  /**
   * FIND ONE
   *
   * Belirtilen ID'ye sahip cihazı getirir.
   * Cihaz bulunamazsa 404 hatası oluşturur.
   */
  @MessagePattern('device.findOne')
  findOne(@Payload() payload: { id: string }) {
    return this.handleRpc(async () => {
      const device = await this.deviceService.findOne(payload.id);

      if (!device) {
        throw new NotFoundException('Device not found');
      }

      return device;
    });
  }

  /**
   * CREATE
   *
   * Yeni cihaz oluşturma isteğini karşılar.
   *
   * DeviceOrchestrator üzerinden:
   * - Unit kontrolü yapılır.
   * - Seri numarası kontrol edilir.
   * - Cihaz oluşturulur.
   * - Audit log kaydedilir.
   *
   * İşlemler transaction kapsamında yürütülür.
   */
  @MessagePattern('device.create')
  create(@Payload() dto: CreateDeviceDto) {
    return this.handleRpc(() => this.deviceOrchestrator.create(dto, 'system'));
  }

  /**
   * UPDATE
   *
   * Var olan cihazın bilgilerini günceller.
   *
   * Gateway'den:
   * {
   *   id: string,
   *   dto: UpdateDeviceDto
   * }
   *
   * formatında veri bekler.
   *
   * Güncelleme ve audit log işlemleri
   * DeviceOrchestrator tarafından yönetilir.
   */
  @MessagePattern('device.update')
  update(
    @Payload()
    payload: {
      id: string;
      dto: UpdateDeviceDto;
    },
  ) {
    return this.handleRpc(() =>
      this.deviceOrchestrator.update(payload.id, payload.dto, 'system'),
    );
  }

  /**
   * DELETE
   *
   * Cihazı fiziksel olarak silmez.
   *
   * Soft delete işlemiyle:
   * - is_deleted = true
   * - is_active = false
   * - deleted_at ve deleted_by alanları doldurulur.
   *
   * Audit log işlemi de orchestrator üzerinden yapılır.
   */
  @MessagePattern('device.delete')
  delete(@Payload() payload: { id: string }) {
    return this.handleRpc(() =>
      this.deviceOrchestrator.softDelete(payload.id, 'system'),
    );
  }
}
