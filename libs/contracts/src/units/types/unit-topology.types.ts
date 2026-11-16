/**
 * Neo4j ve PostgreSQL sorgularının üretmesi gereken ortak Unit görünümüdür.
 */
export interface UnitTopologyNode {
  id: string;

  parentId: string | null;

  organizationUnitTypeId: string;

  code: string;

  name: string;

  isActive: boolean;
}

/**
 * Tree endpoint'inin recursive response yapısıdır.
 *
 * Her Unit, kendi alt birimlerini children dizisinde taşır.
 */
export interface UnitTreeNode extends UnitTopologyNode {
  children: UnitTreeNode[];
}

/**
 * Neo4j ve PostgreSQL performans/sonuç karşılaştırmasını açıklar.
 */
export interface TopologyQueryComparison {
  /**
   * İki kaynaktan gelen normalize edilmiş sonuçlar aynı mı?
   */
  resultsMatch: boolean;

  /**
   * Neo4j sorgusunun milisaniye cinsinden süresi.
   */
  neo4jDurationMs: number;

  /**
   * PostgreSQL recursive CTE sorgusunun milisaniye cinsinden süresi.
   */
  postgresDurationMs: number;
}

/**
 * GET /units/:id/tree endpoint response'u.
 */
export interface GetUnitTreeResponse {
  data: UnitTreeNode;

  comparison: TopologyQueryComparison;
}

/**
 * GET /units/:id/path endpoint response'u.
 *
 * Dizi root Unit'ten hedef Unit'e doğru sıralanır.
 */
export interface GetUnitPathResponse {
  data: UnitTopologyNode[];

  comparison: TopologyQueryComparison;
}