import type { ObjectLiteral } from 'typeorm';

export interface IBaseEntity extends ObjectLiteral {
  id: string;
  deleted_at: Date | null;
  deleted_by: string | null;
  updated_by: string | null;
}