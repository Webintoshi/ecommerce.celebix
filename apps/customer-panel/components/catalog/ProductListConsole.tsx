"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@celebix/saas-contracts";

import { CatalogApiError, catalogApi } from "@/lib/catalog-ui/client";

type Filter = "draft" | "active";

const STATUS_LABELS = Object.freeze({ draft: "Taslak", active: "Aktif", archived: "Arşivlendi" });

function date(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function safeMessage(error: unknown) {
  return error instanceof CatalogApiError ? error.message : "Ürünler yüklenemedi. Lütfen yeniden deneyin.";
}

export function ProductListConsole() {
  const [filter, setFilter] = useState<Filter>("draft");
  const [items, setItems] = useState<readonly Product[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [archiveCandidate, setArchiveCandidate] = useState<Product>();
  const [archiving, setArchiving] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (cursor?: string) => {
    const sequence = ++requestSequence.current;
    cursor === undefined ? setLoading(true) : setLoadingMore(true);
    setError("");
    try {
      const result = await catalogApi.listProducts({ status: filter, ...(cursor === undefined ? {} : { cursor }) });
      if (sequence !== requestSequence.current) return;
      setItems((current) => cursor === undefined ? result.items : Object.freeze([...current, ...result.items]));
      setNextCursor(result.nextCursor);
    } catch (failure) {
      if (sequence !== requestSequence.current) return;
      setError(safeMessage(failure));
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function archive() {
    if (archiveCandidate === undefined) return;
    setArchiving(true);
    setError("");
    try {
      await catalogApi.archiveProduct(archiveCandidate.id, archiveCandidate.version);
      setItems((current) => Object.freeze(current.filter((item) => item.id !== archiveCandidate.id)));
      setArchiveCandidate(undefined);
    } catch (failure) {
      setError(safeMessage(failure));
      setArchiveCandidate(undefined);
      if (failure instanceof CatalogApiError && failure.code === "version_conflict") await load();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <section className="catalog-page" aria-labelledby="products-title">
      <div className="catalog-heading-row">
        <div className="catalog-heading">
          <span className="eyebrow">KATALOG</span>
          <h1 id="products-title">Ürünler</h1>
          <p>Mağazanızdaki ürünleri, fiyatları ve stok durumlarını yönetin.</p>
        </div>
        <Link className="button button-primary" href="/products/new"><span aria-hidden="true">＋</span> Yeni ürün</Link>
      </div>

      <div className="catalog-toolbar">
        <div className="segmented-control" aria-label="Ürün durumu filtresi">
          {(["draft", "active"] as const).map((status) => (
            <button key={status} type="button" className={filter === status ? "is-active" : undefined} onClick={() => setFilter(status)}>
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <span className="result-count">{loading ? "Yükleniyor…" : `${items.length} ürün`}</span>
      </div>

      {error ? (
        <div className="feedback feedback-error" role="alert">
          <div><strong>Bir sorun oluştu</strong><p>{error}</p></div>
          <button className="button button-secondary" type="button" onClick={() => void load()}>Tekrar dene</button>
        </div>
      ) : null}

      {loading ? (
        <div className="catalog-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Ürünler güvenli mağaza bağlamından yükleniyor…
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-mark" aria-hidden="true">◇</span>
          <h2>Henüz ürün yok</h2>
          <p>{filter === "draft" ? "İlk taslak ürününüzü oluşturarak kataloğunuzu hazırlayın." : "Aktif durumda gösterilecek ürün bulunmuyor."}</p>
          <Link className="button button-primary" href="/products/new">İlk ürünü oluştur</Link>
        </div>
      ) : (
        <div className="catalog-table-shell">
          <table className="catalog-table">
            <thead><tr><th>Ürün</th><th>Durum</th><th>Para birimi</th><th>Sürüm</th><th>Güncellendi</th><th><span className="sr-only">İşlemler</span></th></tr></thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id}>
                  <td data-label="Ürün"><Link className="product-link" href={`/products/${product.id}`}><strong>{product.title}</strong><span>/{product.slug}</span></Link></td>
                  <td data-label="Durum"><span className={`status-pill status-${product.status}`}>{STATUS_LABELS[product.status]}</span></td>
                  <td data-label="Para birimi"><span className="mono-value">{product.currency}</span></td>
                  <td data-label="Sürüm"><span className="version-badge">v{product.version}</span></td>
                  <td data-label="Güncellendi"><span className="date-value">{date(product.updatedAt)}</span></td>
                  <td className="row-actions">
                    <Link className="icon-button" href={`/products/${product.id}`} aria-label={`${product.title} ürününü aç`}>→</Link>
                    <button className="icon-button danger" type="button" onClick={() => setArchiveCandidate(product)} aria-label={`${product.title} ürününü arşivle`}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? <button className="button button-secondary load-more" type="button" onClick={() => void load(nextCursor)} disabled={loadingMore}>{loadingMore ? "Yükleniyor…" : "Daha fazla yükle"}</button> : null}

      {archiveCandidate ? (
        <div className="inline-confirmation" role="alertdialog" aria-labelledby="archive-title">
          <div><strong id="archive-title">Arşivlemeyi onayla</strong><p><b>{archiveCandidate.title}</b> varsayılan ürün listesinden kaldırılacak.</p></div>
          <div className="confirmation-actions">
            <button className="button button-secondary" type="button" onClick={() => setArchiveCandidate(undefined)} disabled={archiving}>Vazgeç</button>
            <button className="button button-danger" type="button" onClick={() => void archive()} disabled={archiving}>{archiving ? "Arşivleniyor…" : "Ürünü arşivle"}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
