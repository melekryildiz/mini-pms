import axios from 'axios';

describe('GET /health', () => {
  it('servisin Redis ve Neo4j durumunu raporlar', async () => {
    const res = await axios.get('/health');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      status: 'ok',
      dependencies: {
        redis: expect.objectContaining({ status: 'up' }),
        neo4j: expect.objectContaining({ status: 'up' }),
      },
    });
  });
});
