jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
import type { Neo4jService } from '@mini-pms/neo4j';
import type { UnitService } from '../units/unit.service';
import { TopologyGraphService } from './topology-graph.service';
import { UnitTopologyService } from './unit-topology.service';

function record(data: Record<string, unknown>) {
  return { toObject: () => data, get: (key: string) => data[key] };
}
describe('Alt ağaç sayaçları', () => {
  let run: jest.Mock;
  let graph: TopologyGraphService;
  beforeEach(() => {
    run = jest.fn();
    graph = new TopologyGraphService({
      executeRead: async (work: Function) => work({ run }),
    } as unknown as Neo4jService);
  });
  it('kök dahil tek graph sorgusu ile sayaçları getirir', async () => {
    const meter = {
      deviceId: '3',
      serialNo: 'M3',
      organizationUnitId: '1',
      unitCode: 'TM',
      unitName: 'Test',
    };
    run.mockResolvedValue({ records: [record(meter)] });
    await expect(graph.getUnitSubtreeMeters('1')).resolves.toEqual([meter]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toContain('[:CONTAINS*0..]');
    expect(run.mock.calls[0][0]).toContain('[:HAS_DEVICE]');
    expect(run.mock.calls[0][1]).toEqual({
      unitId: '1',
      meterRoles: ['MAIN', 'FEEDER'],
    });
  });
  it('graph kökü yoksa 503 döndürür', async () => {
    run.mockResolvedValue({ records: [] });
    await expect(graph.getUnitSubtreeMeters('1')).rejects.toMatchObject({
      status: 503,
    });
  });
  it('sayaç yoksa boş liste döndürür', async () => {
    run.mockResolvedValue({ records: [record({ deviceId: null })] });
    await expect(graph.getUnitSubtreeMeters('1')).resolves.toEqual([]);
  });
  it.each([
    ['missing', 404],
    ['inactive', 400],
  ])('PostgreSQL kök kontrolü: %s', async (kind, status) => {
    const findOne = jest
      .fn()
      .mockResolvedValue(kind === 'missing' ? null : { is_active: false });
    const service = new UnitTopologyService(graph, {
      findOne,
    } as unknown as UnitService);
    await expect(service.getUnitSubtreeMeters('1')).rejects.toMatchObject({
      status,
    });
    expect(run).not.toHaveBeenCalled();
  });
});
