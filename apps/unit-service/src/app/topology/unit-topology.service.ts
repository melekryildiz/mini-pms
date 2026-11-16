import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { performance } from 'node:perf_hooks';

import type {
  GetUnitPathResponse,
  GetUnitTreeResponse,
  TopologyQueryComparison,
  UnitTopologyNode,
  UnitTreeNode,
} from '@mini-pms/contracts';

import { UnitService } from '../units/unit.service.js';

import { TopologyGraphService } from './topology-graph.service.js';

/**
 * Neo4j ve PostgreSQL topology sorgularını birlikte çalıştıran uygulama
 * servisidir.
 */
@Injectable()
export class UnitTopologyService {
  constructor(
    private readonly topologyGraphService: TopologyGraphService,

    private readonly unitService: UnitService,
  ) {}

  /**
   * Verilen Unit'in alt ağacını Neo4j ve PostgreSQL üzerinden sorgular.
   */
  async getUnitTree(unitId: string): Promise<GetUnitTreeResponse> {
    const [neo4jMeasurement, postgresMeasurement] = await Promise.all([
      measureQuery(() => this.topologyGraphService.getUnitTree(unitId)),

      measureQuery(() => this.unitService.getUnitTreeWithCte(unitId)),
    ]);

    const neo4jNodes = neo4jMeasurement.result;
    const postgresNodes = postgresMeasurement.result;

    /**
     * Her iki veri kaynağı da boş sonuç döndürdüyse Unit gerçekten yoktur
     */
    if (neo4jNodes.length === 0 && postgresNodes.length === 0) {
      throw new NotFoundException('Unit not found');
    }

    /**
    karşılaştırmadan önce id ile sıralıyoruz.
     */
    const resultsMatch = topologySetsMatch(neo4jNodes, postgresNodes);

    /**
     * 503 seçmemizin nedeni bunun request hatası değil, projection
     * tutarsızlığı olmasıdır. sync-topology komutu ile onarılabilir.
     */
    if (!resultsMatch) {
      throw new ServiceUnavailableException(
        'Neo4j and PostgreSQL topology results do not match',
      );
    }

    /**
     * Neo4j'den gelen düz node listesini recursive children yapısına
     * dönüştürüyoruz.
     */
    const tree = buildUnitTree(neo4jNodes, unitId);

    if (!tree) {
      throw new NotFoundException('Unit not found');
    }

    return {
      data: tree,

      comparison: createComparison(
        true,
        neo4jMeasurement.durationMs,
        postgresMeasurement.durationMs,
      ),
    };
  }

  /**
   * Root Unit'ten hedef Unit'e kadar olan yolu iki veri kaynağından getirir.
   */
  async getUnitPath(unitId: string): Promise<GetUnitPathResponse> {
    const [neo4jMeasurement, postgresMeasurement] = await Promise.all([
      measureQuery(() => this.topologyGraphService.getUnitPath(unitId)),

      measureQuery(() => this.unitService.getUnitPathWithCte(unitId)),
    ]);

    const neo4jPath = neo4jMeasurement.result;
    const postgresPath = postgresMeasurement.result;

    if (neo4jPath.length === 0 && postgresPath.length === 0) {
      throw new NotFoundException('Unit not found');
    }

    const resultsMatch = orderedTopologyResultsMatch(neo4jPath, postgresPath);

    if (!resultsMatch) {
      throw new ServiceUnavailableException(
        'Neo4j and PostgreSQL topology results do not match',
      );
    }

    return {
      data: neo4jPath,

      comparison: createComparison(
        true,
        neo4jMeasurement.durationMs,
        postgresMeasurement.durationMs,
      ),
    };
  }
}

/**
 * Bir async sorgunun sonucunu ve çalışma süresini birlikte döndürür.
 *
 * Generic T sayesinde aynı yardımcı hem tree hem path sorgularında
 * kullanılabilir.
 */
async function measureQuery<T>(
  operation: () => Promise<T>,
): Promise<QueryMeasurement<T>> {
  const startedAt = performance.now();

  const result = await operation();

  const finishedAt = performance.now();

  return {
    result,
    durationMs: finishedAt - startedAt,
  };
}

interface QueryMeasurement<T> {
  result: T;
  durationMs: number;
}

/**
 * Tree sonuçlarını id sırasına göre normalize edip karşılaştırır.
 *
 * Orijinal dizileri değiştirmemek için spread ile kopya oluşturuyoruz.
 * Array.sort() kendisine verilen array'i yerinde değiştirir.
 */
function topologySetsMatch(
  neo4jNodes: readonly UnitTopologyNode[],
  postgresNodes: readonly UnitTopologyNode[],
): boolean {
  const normalizedNeo4j = [...neo4jNodes].sort(compareNodesById);

  const normalizedPostgres = [...postgresNodes].sort(compareNodesById);

  return orderedTopologyResultsMatch(normalizedNeo4j, normalizedPostgres);
}

/**
 * İki topology listesini aynı sırada karşılaştırır.
 */
function orderedTopologyResultsMatch(
  left: readonly UnitTopologyNode[],
  right: readonly UnitTopologyNode[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftNode, index) => {
    const rightNode = right[index];

    return (
      rightNode !== undefined &&
      leftNode.id === rightNode.id &&
      leftNode.parentId === rightNode.parentId &&
      leftNode.organizationUnitTypeId === rightNode.organizationUnitTypeId &&
      leftNode.code === rightNode.code &&
      leftNode.name === rightNode.name &&
      leftNode.isActive === rightNode.isActive
    );
  });
}

function compareNodesById(
  left: UnitTopologyNode,
  right: UnitTopologyNode,
): number {
  return left.id.localeCompare(right.id, undefined, {
    numeric: true,
  });
}

/**
 * Düz Unit listesini recursive tree yapısına dönüştürür.
 */
function buildUnitTree(
  nodes: readonly UnitTopologyNode[],
  rootUnitId: string,
): UnitTreeNode | null {
  /**
   * Her Unit için yeni bir tree node oluşturuyoruz.
   *
   * Orijinal query sonucuna children alanı ekleyerek mutation yapmıyoruz.
   */
  const nodesById = new Map<string, UnitTreeNode>(
    nodes.map((node) => [
      node.id,
      {
        ...node,
        children: [],
      },
    ]),
  );

  const root = nodesById.get(rootUnitId);

  if (!root) {
    return null;
  }

  for (const node of nodesById.values()) {
    /**
     * Başlangıç Unit'i, sorgulanan subtree'nin root'udur.
     */
    if (node.id === rootUnitId) {
      continue;
    }

    if (node.parentId === null) {
      continue;
    }

    const parent = nodesById.get(node.parentId);

    /**
     * Parent aynı subtree sonucu içinde bulunuyorsa child bağlantısını kur.
     */
    parent?.children.push(node);
  }

  sortTreeChildren(root);

  return root;
}

/**
 * Her seviyedeki children listesini deterministik id sırasına koyar.
 */
function sortTreeChildren(node: UnitTreeNode): void {
  node.children.sort(compareNodesById);

  for (const child of node.children) {
    sortTreeChildren(child);
  }
}

function createComparison(
  resultsMatch: boolean,
  neo4jDurationMs: number,
  postgresDurationMs: number,
): TopologyQueryComparison {
  return {
    resultsMatch,

    neo4jDurationMs: roundMilliseconds(neo4jDurationMs),

    postgresDurationMs: roundMilliseconds(postgresDurationMs),
  };
}

function roundMilliseconds(value: number): number {
  return Number(value.toFixed(3));
}
