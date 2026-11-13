import {
  infrastructureConfig,
} from './infrastructure.config.js';

describe('infrastructureConfig', () => {
  /**
   * Testler makinenin gerçek environment değerlerinden tamamen izole
   * çalışır. Referansı saklıyor fakat hiçbir secret değeri okumuyor,
   * yazdırmıyor veya assertion mesajına eklemiyoruz.
   */
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = {};
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('local bağlantı değerlerini ve zorunlu parolayı tipli confige dönüştürür', () => {
    process.env.NEO4J_PASSWORD = 'test-only-password';

    const config = infrastructureConfig();

    expect(config).toEqual({
      redis: {
        host: '127.0.0.1',
        port: 6379,
      },
      neo4j: {
        uri: 'bolt://127.0.0.1:7687',
        username: 'neo4j',
        password: 'test-only-password',
        database: 'neo4j',
      },
    });
  });

  it('environment ile verilen bağlantı değerlerini kullanır', () => {
    process.env.REDIS_HOST = 'redis';
    process.env.REDIS_PORT = '6380';
    process.env.NEO4J_URI = 'neo4j://neo4j:7687';
    process.env.NEO4J_USERNAME = 'application-user';
    process.env.NEO4J_PASSWORD = 'test-only-password';
    process.env.NEO4J_DATABASE = 'mini-pms';

    const config = infrastructureConfig();

    expect(config.redis).toEqual({
      host: 'redis',
      port: 6380,
    });

    expect(config.neo4j).toEqual({
      uri: 'neo4j://neo4j:7687',
      username: 'application-user',
      password: 'test-only-password',
      database: 'mini-pms',
    });
  });

  it('Neo4j parolası eksikse secretı göstermeden başlangıcı reddeder', () => {
    expect(() => infrastructureConfig()).toThrow(
      'Required environment variable NEO4J_PASSWORD is missing',
    );
  });

  it.each([
    '0',
    '-1',
    '65536',
    'not-a-number',
    '12.5',
  ])('geçersiz Redis portunu reddeder: %s', (port) => {
    process.env.NEO4J_PASSWORD = 'test-only-password';
    process.env.REDIS_PORT = port;

    expect(() => infrastructureConfig()).toThrow(
      'Environment variable REDIS_PORT must be a valid TCP port',
    );
  });

  it('yalnızca boşluk içeren opsiyonel değerlerde varsayılanları kullanır', () => {
    process.env.NEO4J_PASSWORD = 'test-only-password';
    process.env.REDIS_HOST = '   ';
    process.env.NEO4J_DATABASE = '   ';

    const config = infrastructureConfig();

    expect(config.redis.host).toBe('127.0.0.1');
    expect(config.neo4j.database).toBe('neo4j');
  });
});
