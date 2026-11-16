/**
 * Lazy-loading topoloji ağacında gösterilecek tek bir Unit düğümü.
 */
export interface UnitNavigationNode {
  id: string;
  parentId: string | null;

  organizationUnitTypeId: string;
  code: string;
  name: string;
  isActive: boolean;
  hasChildren: boolean;
}

/**
 * İlk sayfa açılışında dönen root birimler.
 *
 * Sonucun wrapper içinde tutulması, ileride toplam root sayısı veya başka
 * metadata eklemeyi kolaylaştırır.
 */
export interface GetUnitRootsResponse {
  data: UnitNavigationNode[];
}


export interface GetUnitChildrenResponse {
  parentId: string;
  data: UnitNavigationNode[];
}

/**
 * Kod aramasının response biçimi.
 */
export interface SearchUnitsByCodeResponse {
  query: string;
  data: UnitNavigationNode[];
}