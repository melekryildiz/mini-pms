import { ValidationPipe } from '@nestjs/common';
import {
  ListDevicesQueryDto,
  ListReactiveLimitsQueryDto,
  ListUnitsQueryDto,
} from '@mini-pms/contracts';

const queryMetadata = (metatype: new () => object) => ({
  type: 'query' as const,
  metatype,
  data: undefined,
});

describe('list query validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it.each([ListUnitsQueryDto, ListDevicesQueryDto])(
    'accepts page=1 and limit=10 for %p',
    async (Dto) => {
      const result = await pipe.transform(
        { page: '1', limit: '10' },
        queryMetadata(Dto),
      );

      // HTTP query parametreleri string kalır; RPC handler sayıya açıkça çevirir.
      expect(result).toMatchObject({ page: '1', limit: '10' });
    },
  );

  it('accepts filters used by the frontend', async () => {
    await expect(
      pipe.transform(
        { page: '2', limit: '25', is_active: 'false' },
        queryMetadata(ListUnitsQueryDto),
      ),
    ).resolves.toMatchObject({
      page: '2',
      limit: '25',
      is_active: 'false',
    });
  });

  it('keeps the upper pagination limit enforced', async () => {
    await expect(
      pipe.transform(
        { page: '1', limit: '101' },
        queryMetadata(ListDevicesQueryDto),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('validates reactive-limit pagination with the same contract', async () => {
    await expect(
      pipe.transform(
        { organization_unit_id: '5', page: '1', limit: '10' },
        queryMetadata(ListReactiveLimitsQueryDto),
      ),
    ).resolves.toMatchObject({ page: '1', limit: '10' });
  });
});
