'use client';

import Link from 'next/link';
import { useState } from 'react';

import { apiClient } from '@/lib/api-client';

import type {
  GetUnitChildrenResponse,
  UnitNavigationNode,
} from '@/types/resources';

type TopologyTreeNodeProps = {
  node: UnitNavigationNode;

  // Recursive bileşen her seviyede girintiyi artırır.

  level?: number;
};

export function TopologyTreeNode({ node, level = 0 }: TopologyTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const [children, setChildren] = useState<UnitNavigationNode[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    /**
     * Backend çocuk olmadığını zaten söylediyse gereksiz HTTP isteği yapmayız.
     */
    if (!node.hasChildren) {
      return;
    }

    /**
     * Açık düğüme tıklanırsa yalnızca görünümü kapatırız.
     *
     * children state'ini silmiyoruz. Kullanıcı tekrar açtığında aynı çocuklar
     * için ikinci bir HTTP isteği yapılmayacak.
     */
    if (expanded) {
      setExpanded(false);
      return;
    }

    /**
     * Çocuklar daha önce yüklendiyse cache benzeri şekilde lokal state'ten
     * tekrar gösteririz.
     */
    if (children !== null) {
      setExpanded(true);
      return;
    }

    setLoading(true);
    setError('');

    try {
      /**
       * Yalnız açılan düğümün doğrudan çocuklarını istiyoruz.
       *
       * encodeURIComponent beklenmeyen URL karakterlerinin route yapısını
       * bozmasını engeller.
       */
      const response = await apiClient<GetUnitChildrenResponse>(
        `/units/${encodeURIComponent(node.id)}/navigation-children`,
      );

      setChildren(response.data);
      setExpanded(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Alt birimler yüklenemedi.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <li
      aria-expanded={node.hasChildren ? expanded : undefined}
      className="topology-tree-item"
      role="treeitem"
    >
      <div
        className="topology-node"
        style={{
          /**
           * Sabit CSS class üretmek yerine recursive level değerinden girinti
           * hesaplıyoruz. Böylece ağacın derinliği önceden bilinmek zorunda değil.
           */
          paddingInlineStart: `${level * 1.25}rem`,
        }}
      >
        {node.hasChildren ? (
          <button
            aria-label={
              expanded
                ? `${node.name} alt birimlerini kapat`
                : `${node.name} alt birimlerini aç`
            }
            aria-expanded={expanded}
            className="topology-toggle"
            disabled={loading}
            onClick={() => void toggle()}
            type="button"
          >
            {loading ? '…' : expanded ? '−' : '+'}
          </button>
        ) : (
          /**
           * Çocuğu olmayan düğümlerde de metin hizasının bozulmaması için
           * toggle butonuyla aynı genişlikte pasif bir alan bırakıyoruz.
           */
          <span aria-hidden="true" className="topology-toggle-placeholder">
            •
          </span>
        )}

        <div className="topology-node-copy">
          <Link className="topology-node-link" href={`/units/${node.id}`}>
            <strong>{node.code}</strong>
            <span>{node.name}</span>
          </Link>

          <span
            className={
              node.isActive
                ? 'topology-node-status active'
                : 'topology-node-status'
            }
          >
            {node.isActive ? 'Aktif' : 'Pasif'}
          </span>
        </div>
      </div>

      {error && (
        <p className="topology-node-error" role="alert">
          {error}
        </p>
      )}

      {expanded && children !== null && (
        <ul className="topology-tree-group" role="group">
          {children.map((child) => (
            <TopologyTreeNode key={child.id} level={level + 1} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
