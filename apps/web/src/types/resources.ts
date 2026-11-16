export type PaginatedResult<T> = { data: T[]; total: number };
import type {
  GetUnitChildrenResponse,
  GetUnitPathResponse,
  GetUnitRootsResponse,
  SearchUnitsByCodeResponse,
  UnitNavigationNode,
  UnitTopologyNode,
} from '@mini-pms/contracts';

export type {
  GetUnitChildrenResponse,
  GetUnitPathResponse,
  GetUnitRootsResponse,
  SearchUnitsByCodeResponse,
  UnitNavigationNode,
  UnitTopologyNode,
};
export type Unit = {
  id: string;
  parent_id: string | null;
  organization_unit_type_id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
};

export type Device = {
  id: string;
  organization_unit_id: string;
  serial_no: string;
  role: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
};

export type ReactiveLimit = {
  id: string;
  organization_unit_id: string;
  limit_type: string;
  limit_value: string;
  valid_from: string;
  valid_to: string | null;
};

export type UnitHistory = {
  id: string;
  organization_unit_id: string;
  action: string;
  changes: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
  created_at: string;
  created_by: string;
};

export type UnitTreeNodeState = {
  /** Backend'den gelen gerçek Unit bilgisi. */
  node: UnitNavigationNode;

  /** Kullanıcı düğümü şu anda açık mı? */
  expanded: boolean;

  /** Children isteği devam ediyor mu? */
  loading: boolean;

  /**
   * undefined:
   * Çocuklar henüz istenmedi.
   *
   * []:
   * İstek tamamlandı fakat çocuk bulunamadı.
   *
   * [ ... ]:
   * Yüklenen doğrudan çocuklar.
   */
  children?: UnitTreeNodeState[];

  /** Yalnız bu düğümün children isteğinde oluşan hata. */
  error?: string;
};