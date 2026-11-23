import { Controller, HttpException, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { TimeoutError } from 'rxjs';
import { MeasurementLatestService } from './measurement-latest.service.js';

@Controller()
export class MeasurementRpcController {
  private readonly logger = new Logger(MeasurementRpcController.name);

  constructor(private readonly latestService: MeasurementLatestService) {}

  @MessagePattern('get-unit-instant-values')
  async getUnitInstantValues(@Payload() payload: { unitId: string }) {
    try {
      const unitId = payload?.unitId;
      if (
        typeof unitId !== 'string' ||
        !/^[1-9]\d{0,18}$/.test(unitId) ||
        BigInt(unitId) > 9_223_372_036_854_775_807n
      ) {
        throw new RpcException({
          statusCode: 400,
          message: 'Geçersiz birim kimliği.',
        });
      }
      return await this.latestService.getUnitInstantValues(unitId);
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      if (error instanceof HttpException) {
        throw new RpcException({
          statusCode: error.getStatus(),
          message: error.message,
        });
      }
      if (error instanceof TimeoutError) {
        throw new RpcException({
          statusCode: 504,
          message: 'Unit Service zamanında yanıt vermedi.',
        });
      }
      if (error !== null && typeof error === 'object') {
        const details = error as Record<string, unknown>;
        if (
          typeof details.statusCode === 'number' &&
          [400, 404, 503, 504].includes(details.statusCode) &&
          typeof details.message === 'string'
        ) {
          throw new RpcException({
            statusCode: details.statusCode,
            message: details.message,
          });
        }
      }
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Beklenmeyen anlık değer hatası.',
      );
      throw new RpcException({
        statusCode: 500,
        message: 'Anlık değerler alınamadı.',
      });
    }
  }
}
