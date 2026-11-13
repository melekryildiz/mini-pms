import {
  Controller,
  Get,
  HttpStatus,
  Res,
} from '@nestjs/common';

import {
  HealthService,
  type UnitServiceHealthResult,
} from './health.service.js';

/**
 * Health controller'ın response üzerinde ihtiyaç duyduğu minimum yüzey.
 *
 * Express'in bütün Response tipine bağımlı olmak yerine yalnızca status
 * metodunu tanımlarız. Böylece controller kullanılan HTTP adapter'ına
 * gereksiz yere bağlanmaz ve ayrıca @types/express bağımlılığı gerekmez.
 */
interface StatusResponse {
  status(code: number): unknown;
}

/**
 * Unit Service altyapı durumunu dışarı sunar.
 *
 * Endpoint herhangi bir secret veya ham hata döndürmediği için monitoring
 * sistemleri tarafından authentication olmadan çağrılabilir.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
  ) {}

  @Get()
  async check(
    /**
     * passthrough=true kullanınca NestJS response body serialization
     * davranışını korur; biz yalnızca HTTP status kodunu seçeriz.
     */
    @Res({ passthrough: true })
    response: StatusResponse,
  ): Promise<UnitServiceHealthResult> {
    const result = await this.healthService.check();

    /**
     * Her iki bağımlılık çalışıyorsa monitoring sistemine 200 döner.
     *
     * Redis veya Neo4j down ise response body yine bütün sonuçları içerir
     * fakat readiness açısından 503 döner.
     */
    response.status(
      result.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return result;
  }
}
