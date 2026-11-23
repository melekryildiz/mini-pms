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
  CreateUnitDto,
  UpdateUnitDto,
  ListUnitsQueryDto,
  type SearchUnitsByCodeQueryDto,
  type GetUnitTreeResponse,
  type GetUnitPathResponse,
  type GetUnitRootsResponse,
  type GetUnitChildrenResponse,
  type SearchUnitsByCodeResponse,
  type GetUnitInstantValuesResponse,
} from '@mini-pms/contracts';
import { UnitCacheService } from './unit-cache.service';

//Unit Service'in findOne RPC çağrısından dönen birim detayı.
type UnitDetail = Record<string, unknown>;

@Injectable()
export class UnitsService {
  constructor(
    @Inject('UNIT_SERVICE')
    private readonly unitClient: ClientProxy,
    private readonly unitCacheService: UnitCacheService,
    @Inject('INGESTION_SERVICE')
    private readonly instantClient: ClientProxy,
  ) {}

  private async request<T>(
    pattern: string,
    payload: unknown,
    client: ClientProxy = this.unitClient,
    timeoutMs = 5_000,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        client.send<T>(pattern, payload).pipe(timeout(timeoutMs)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException(
          'İlgili servis zamanında yanıt vermedi.',
        );
      }

      // Core service'in beklenen iş/validation hatalarını 502'ye çevirmek form
      // alanı mesajlarını kaybettirir. Güvenli status kodlarını aynen koruyoruz.
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        'message' in error
      ) {
        const rpcError = error as { statusCode: unknown; message: unknown };
        const allowed = [400, 401, 403, 404, 409, 422, 503, 504];

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

      console.error('SERVICE RPC ERROR:', error);

      throw new BadGatewayException('Servis isteği tamamlanamadı.');
    }
  }

  async findOne(id: string): Promise<UnitDetail | null> {
    const cachedUnit = await this.unitCacheService.get<UnitDetail>(id);

    if (cachedUnit !== null) {
      //Cache hit:
      return cachedUnit;
    }

    //Cache miss:
    const unit = await this.request<UnitDetail | null>('unit.findOne', { id });

    if (unit !== null) {
      await this.unitCacheService.set(id, unit);
    }

    return unit;
  }

  findAll(query: ListUnitsQueryDto) {
    return this.request('unit.findAll', query);
  }

  getUnitInstantValues(unitId: string): Promise<GetUnitInstantValuesResponse> {
    // Birim detay cache'ini kullanma; Ingestion son ölçümleri Redis'ten okur.
    return this.request<GetUnitInstantValuesResponse>(
      'get-unit-instant-values',
      { unitId },
      this.instantClient,
      7_000,
    );
  }

  history(id: string, page = 1, limit = 20) {
    return this.request('unit.history', { id, page, limit });
  }

  // İşlemi yapan kullanıcıyı da Unit Service'e gönderiyoruz.
  create(dto: CreateUnitDto, username: string) {
    return this.request('unit.create', {
      dto,
      username,
    });
  }

  async update(id: string, dto: UpdateUnitDto, username: string) {
    /**
     * Önce gerçek veri kaynağını güncelliyoruz.
     *
     * Cache'i önce silseydik RPC başarısız olduğunda geçerli cache kaydını
     * gereksiz yere kaybetmiş olurduk.
     */
    const updatedUnit = await this.request('unit.update', {
      id,
      dto,
      username,
    });

    /**
     * Bu satıra yalnız RPC başarılı olursa ulaşılır.
     *
     * Eski cache silindiği için sonraki findOne isteği güncel veriyi Unit
     * Service'ten alır ve yeniden cache'ler.
     */
    await this.unitCacheService.invalidate(id);

    return updatedUnit;
  }

  /**
   * Birim silindikten sonra cache'teki eski detayın dönmesini engeller.
   */
  async delete(id: string, username: string) {
    const result = await this.request('unit.delete', {
      id,
      username,
    });

    /**
     * Soft-delete olsa bile normal detay endpointinin eski aktif nesneyi
     * Redis'ten döndürmemesi gerekir.
     */
    await this.unitCacheService.invalidate(id);

    return result;
  }

  getTree(id: string): Promise<GetUnitTreeResponse> {
    return this.request<GetUnitTreeResponse>('unit.getTree', {
      id,
    });
  }
  getPath(id: string): Promise<GetUnitPathResponse> {
    return this.request<GetUnitPathResponse>('unit.getPath', {
      id,
    });
  }
  /**
   * Topoloji ekranının ilk açılışında yalnız root Unit'leri ister.
   */
  getNavigationRoots(): Promise<GetUnitRootsResponse> {
    return this.request<GetUnitRootsResponse>('unit.getNavigationRoots', {});
  }

  /**
   * Kullanıcının açtığı Unit'in yalnızca doğrudan çocuklarını ister.
   */
  getNavigationChildren(parentId: string): Promise<GetUnitChildrenResponse> {
    return this.request<GetUnitChildrenResponse>('unit.getNavigationChildren', {
      parentId,
    });
  }

  /**
   * Unit kodu veya kod parçasıyla navigation araması yapar.
   */
  searchNavigationByCode(
    query: SearchUnitsByCodeQueryDto,
  ): Promise<SearchUnitsByCodeResponse> {
    return this.request<SearchUnitsByCodeResponse>(
      'unit.searchNavigationByCode',
      query,
    );
  }
}
