import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { UnitTopologyNode } from '@mini-pms/contracts';

/**
 * UnitTopologyService, UnitService'i import ettiği için UnitService üzerindeki
 * @InjectRepository decorator'ı da test yüklenirken değerlendirilir.
 *
 * Bu testte NestJS/TypeORM dependency injection mekanizmasını değil, Neo4j ve
 * PostgreSQL sonuçlarının karşılaştırılmasını ölçüyoruz. Ayrıca @nestjs/typeorm
 * paketinin ESM çıktısı mevcut Jest yapılandırmasının dışında kalıyor.
 * Bu nedenle yalnızca decorator'ı etkisiz bir test taklidiyle değiştiriyoruz.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import type { UnitService } from '../units/unit.service.js';

import type { TopologyGraphService } from './topology-graph.service.js';

import { UnitTopologyService } from './unit-topology.service.js';

describe('UnitTopologyService', () => {
  let graphTree: jest.MockedFunction<TopologyGraphService['getUnitTree']>;
  let graphPath: jest.MockedFunction<TopologyGraphService['getUnitPath']>;
  let postgresTree: jest.MockedFunction<UnitService['getUnitTreeWithCte']>;
  let postgresPath: jest.MockedFunction<UnitService['getUnitPathWithCte']>;
  let service: UnitTopologyService;

  beforeEach(() => {
    graphTree = jest.fn();
    graphPath = jest.fn();
    postgresTree = jest.fn();
    postgresPath = jest.fn();

    service = new UnitTopologyService(
      {
        getUnitTree: graphTree,
        getUnitPath: graphPath,
      } as unknown as TopologyGraphService,
      {
        getUnitTreeWithCte: postgresTree,
        getUnitPathWithCte: postgresPath,
      } as unknown as UnitService,
    );
  });

  it('eşit tree sonuçlarını karşılaştırıp recursive children yapısına çevirir', async () => {
    const root = createNode({ id: '1' });
    const transformer = createNode({
      id: '2',
      parentId: '1',
      organizationUnitTypeId: '2',
    });
    const feeder = createNode({
      id: '3',
      parentId: '2',
      organizationUnitTypeId: '3',
    });

    // Sibling/list sırası farklı olsa da tree set karşılaştırması eşit olmalı.
    graphTree.mockResolvedValue([root, transformer, feeder]);
    postgresTree.mockResolvedValue([feeder, root, transformer]);

    const result = await service.getUnitTree('1');

    expect(graphTree).toHaveBeenCalledWith('1');
    expect(postgresTree).toHaveBeenCalledWith('1');
    expect(result.comparison.resultsMatch).toBe(true);
    expect(result.comparison.neo4jDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.comparison.postgresDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.data.id).toBe('1');
    expect(result.data.children[0]?.id).toBe('2');
    expect(result.data.children[0]?.children[0]?.id).toBe('3');
  });

  it('roottan hedefe aynı sıradaki path sonucunu döndürür', async () => {
    const path = [
      createNode({ id: '1' }),
      createNode({ id: '2', parentId: '1' }),
      createNode({ id: '3', parentId: '2' }),
    ];

    graphPath.mockResolvedValue(path);
    postgresPath.mockResolvedValue([...path]);

    const result = await service.getUnitPath('3');

    expect(result.data.map((node) => node.id)).toEqual(['1', '2', '3']);
    expect(result.comparison.resultsMatch).toBe(true);
  });

  it('iki veri kaynağı da boşsa 404 üretir', async () => {
    graphTree.mockResolvedValue([]);
    postgresTree.mockResolvedValue([]);

    await expect(service.getUnitTree('999')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('tree sonuçları farklıysa güvenilir olmayan response yerine 503 üretir', async () => {
    graphTree.mockResolvedValue([createNode({ id: '1' })]);
    postgresTree.mockResolvedValue([
      createNode({ id: '1', name: 'Different name' }),
    ]);

    await expect(service.getUnitTree('1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('path sırası farklıysa sonuçları eşit kabul etmez', async () => {
    const root = createNode({ id: '1' });
    const child = createNode({ id: '2', parentId: '1' });

    graphPath.mockResolvedValue([root, child]);
    postgresPath.mockResolvedValue([child, root]);

    await expect(service.getUnitPath('2')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

function createNode(
  overrides: Partial<UnitTopologyNode> = {},
): UnitTopologyNode {
  return {
    id: '1',
    parentId: null,
    organizationUnitTypeId: '1',
    code: 'UNIT-1',
    name: 'Unit 1',
    isActive: true,
    ...overrides,
  };
}
