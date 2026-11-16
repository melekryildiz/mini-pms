import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { RedisService } from '@mini-pms/redis';

import type { GatewayCacheConfig } from '../config/cache.config';
import { UnitCacheService } from './unit-cache.service';

describe('UnitCacheService', () => {
  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  const cacheConfig: GatewayCacheConfig = {
    redis: {
      host: '127.0.0.1',
      port: 6379,
    },
    unitDetail: {
      ttlSeconds: 60,
    },
  };

  const configService = {
    getOrThrow: jest.fn().mockReturnValue(cacheConfig),
  };

  let service: UnitCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    redisService.get.mockResolvedValue(null);
    redisService.set.mockResolvedValue(undefined);
    redisService.delete.mockResolvedValue(0);

    // Beklenen Redis kesintisi/bozuk JSON testlerinin terminal çıktısını
    // kirletmemesi için yalnız bu test süresince warning logunu susturuyoruz.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    service = new UnitCacheService(
      redisService as unknown as RedisService,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cache miss durumunda null döndürür', async () => {
    await expect(service.get('5')).resolves.toBeNull();

    expect(redisService.get).toHaveBeenCalledWith(
      'gateway:unit:detail:5',
    );
  });

  it('cache hit durumunda JSON değerini tipli nesneye çevirir', async () => {
    redisService.get.mockResolvedValue(
      JSON.stringify({ id: '5', name: 'Cached Unit' }),
    );

    await expect(
      service.get<{ id: string; name: string }>('5'),
    ).resolves.toEqual({
      id: '5',
      name: 'Cached Unit',
    });
  });

  it('birim detayını config TTL değeriyle yazar', async () => {
    await service.set('5', { id: '5', name: 'Unit 5' });

    expect(redisService.set).toHaveBeenCalledWith(
      'gateway:unit:detail:5',
      JSON.stringify({ id: '5', name: 'Unit 5' }),
      60,
    );
  });

  it('bozuk JSON kaydını silip cache miss gibi davranır', async () => {
    redisService.get.mockResolvedValue('{invalid-json');

    await expect(service.get('5')).resolves.toBeNull();

    expect(redisService.delete).toHaveBeenCalledWith(
      'gateway:unit:detail:5',
    );
  });

  it('Redis okuma hatasında ana veri kaynağına geçilebilmesi için null döndürür', async () => {
    redisService.get.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.get('5')).resolves.toBeNull();
  });

  it('update/delete invalidation için doğru keyi siler', async () => {
    await service.invalidate('unit:5');

    expect(redisService.delete).toHaveBeenCalledWith(
      'gateway:unit:detail:unit%3A5',
    );
  });

  it('Redis yazma veya silme hatasını kullanıcı isteğine yansıtmaz', async () => {
    redisService.set.mockRejectedValue(new Error('Redis unavailable'));
    redisService.delete.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.set('5', { id: '5' })).resolves.toBeUndefined();
    await expect(service.invalidate('5')).resolves.toBeUndefined();
  });
});
