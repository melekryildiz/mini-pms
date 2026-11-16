'use client';

import Link from 'next/link';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { apiClient } from '@/lib/api-client';

import type {
  GetUnitRootsResponse,
  SearchUnitsByCodeResponse,
  UnitNavigationNode,
} from '@/types/resources';

import { TopologyTreeNode } from './topology-tree-node';

/**
 * Topoloji ekranının ana bileşeni.
 */
export function TopologyBrowser() {
  const [roots, setRoots] =
    useState<UnitNavigationNode[]>([]);

  const [loadingRoots, setLoadingRoots] =
    useState(true);

  const [rootError, setRootError] =
    useState('');

  const [searchCode, setSearchCode] =
    useState('');

  const [searchResults, setSearchResults] =
    useState<UnitNavigationNode[] | null>(null);

  const [searching, setSearching] =
    useState(false);

  const [searchError, setSearchError] =
    useState('');

  /**
   * Yalnız root seviyesini yükler.
   */
  const loadRoots = useCallback(async () => {
    setLoadingRoots(true);
    setRootError('');

    try {
      const response =
        await apiClient<GetUnitRootsResponse>(
          '/units/navigation/roots',
        );

      setRoots(response.data);
    } catch (requestError) {
      setRootError(
        requestError instanceof Error
          ? requestError.message
          : 'Topoloji kök birimleri yüklenemedi.',
      );
    } finally {
      setLoadingRoots(false);
    }
  }, []);

  /**
   * Component tarayıcıya ilk kez yerleştiğinde yalnız root isteği yapılır.
   */
  useEffect(() => {
    void loadRoots();
  }, [loadRoots]);

  async function search(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedCode = searchCode.trim();

    /**
     * Boş aramayı backend'e göndermiyoruz.
     *
     * DTO backend sınırında yine validation yapacak; bu kontrol yalnızca
     * kullanıcıya daha hızlı geri bildirim sağlar.
     */
    if (!normalizedCode) {
      setSearchError('Aramak için birim kodu girin.');
      setSearchResults(null);
      return;
    }

    setSearching(true);
    setSearchError('');

    try {
      const query = new URLSearchParams({
        code: normalizedCode,
        limit: '20',
      });

      const response =
        await apiClient<SearchUnitsByCodeResponse>(
          `/units/navigation/search?${query.toString()}`,
        );

      setSearchResults(response.data);
    } catch (requestError) {
      setSearchResults(null);
      setSearchError(
        requestError instanceof Error
          ? requestError.message
          : 'Birim araması yapılamadı.',
      );
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchCode('');
    setSearchResults(null);
    setSearchError('');
  }

  return (
    <section className="resource-page topology-page">
      <div className="resource-page-header">
        <div>
          <p className="eyebrow">İzleme</p>
          <h1 className="page-title">Topoloji Ağacı</h1>
          <p className="muted">
            Birimleri hiyerarşik olarak inceleyin. Alt seviyeler yalnız
            düğümleri açtığınızda yüklenir.
          </p>
        </div>

        <button
          className="secondary-action"
          disabled={loadingRoots}
          onClick={() => void loadRoots()}
          type="button"
        >
          Yenile
        </button>
      </div>

      <div className="topology-layout">
        <aside
          aria-label="Birim koduyla arama"
          className="topology-search-card"
        >
          <div>
            <p className="eyebrow">Hızlı erişim</p>
            <h2>Kod ile ara</h2>
            <p className="muted">
              Trafo merkezi, transformatör veya fider kodunu girin.
            </p>
          </div>

          <form
            className="topology-search-form"
            onSubmit={(event) => void search(event)}
          >
            <label htmlFor="topology-code-search">
              Birim kodu
            </label>

            <div className="topology-search-controls">
              <input
                autoComplete="off"
                id="topology-code-search"
                maxLength={64}
                onChange={(event) =>
                  setSearchCode(event.target.value)
                }
                placeholder="Örn. TR-TEST"
                type="search"
                value={searchCode}
              />

              <button
                className="primary-action"
                disabled={searching}
                type="submit"
              >
                {searching ? 'Aranıyor…' : 'Ara'}
              </button>
            </div>
          </form>

          {searchError && (
            <p className="form-alert" role="alert">
              {searchError}
            </p>
          )}

          {searchResults !== null && (
            <div className="topology-search-results">
              <div className="section-heading">
                <h3>Arama sonuçları</h3>

                <button
                  className="table-button"
                  onClick={clearSearch}
                  type="button"
                >
                  Temizle
                </button>
              </div>

              {searchResults.length === 0 ? (
                <p className="empty-state">
                  Bu kodla eşleşen birim bulunamadı.
                </p>
              ) : (
                <ul>
                  {searchResults.map((unit) => (
                    <li key={unit.id}>
                      <Link
                        className="topology-search-result"
                        href={`/units/${unit.id}`}
                      >
                        <span>
                          <strong>{unit.code}</strong>
                          <small>{unit.name}</small>
                        </span>

                        <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        <div className="topology-tree-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Organizasyon</p>
              <h2>Birim hiyerarşisi</h2>
            </div>

            <span className="read-only-note">
              {roots.length} kök birim
            </span>
          </div>

          {rootError ? (
            <div>
              <p className="form-alert" role="alert">
                {rootError}
              </p>

              <button
                className="table-button"
                onClick={() => void loadRoots()}
                type="button"
              >
                Tekrar dene
              </button>
            </div>
          ) : loadingRoots ? (
            <p className="empty-state">
              Kök birimler yükleniyor…
            </p>
          ) : roots.length === 0 ? (
            <p className="empty-state">
              Kök birim bulunamadı.
            </p>
          ) : (
            <ul
              aria-label="Birim topoloji ağacı"
              className="topology-tree"
              role="tree"
            >
              {roots.map((root) => (
                <TopologyTreeNode
                  key={root.id}
                  node={root}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}