"use client";
import { useCommercePolicy } from "./CommercePolicyProvider";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { parsePublicProduct, type PublicProduct } from "@celebix/saas-contracts";
import { catalogHref, PRODUCT_CATALOG_PAGE_SIZE } from "../lib/product-catalog-query.ts";
import { productIndexPath } from "../lib/storefront-routes.ts";
import type { ProductExplorerProps } from "./ProductExplorer";
import { ProductGrid } from "./ProductGrid";

type Page = Readonly<{ items: readonly PublicProduct[]; total: number; nextOffset: number | null }>;
type Snapshot = Page & Readonly<{ updatedAt: number; baseIds: readonly string[] }>;
// Tab-memory only, keyed by merchant host, commerce policy and complete catalog selection.
const snapshots = new Map<string, Snapshot>();
const TTL = 5 * 60 * 1000;
function append(first: readonly PublicProduct[], next: readonly PublicProduct[]) {
  const ids = new Set(first.map(product => product.id));
  return [...first, ...next.filter(product => { if (ids.has(product.id)) return false; ids.add(product.id); return true; })];
}
function readPage(value: unknown, offset: number): Page {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_catalog_page");
  const page = value as Page;
  if (!Array.isArray(page.items) || page.items.length > PRODUCT_CATALOG_PAGE_SIZE || !Number.isSafeInteger(page.total) || page.total < 0 || (page.nextOffset !== null && (!Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset || page.nextOffset > 10000 || page.nextOffset % PRODUCT_CATALOG_PAGE_SIZE !== 0))) throw new Error("invalid_catalog_page");
  return { items: page.items.map(parsePublicProduct), total: page.total, nextOffset: page.nextOffset };
}

export function CatalogProductList(props: ProductExplorerProps & Readonly<{ emptyMessage?: string }>) {
  const policy = useCommercePolicy();
  const policyKey = `${policy.version}:${Number(policy.enabled)}:${Number(policy.hidePrices)}:${Number(policy.hideAddToCart)}:${Number(policy.checkoutAllowed)}`;
  const key = `${catalogHref(props.path, props.selection, props.selection.offset)}:commerce:${policyKey}`;
  return <InfiniteProducts key={key} {...props} catalogKey={key} />;
}

function InfiniteProducts({ products, selection, total, nextOffset, path, locale, cardStyle, imageRatio, emptyMessage, catalogKey }: ProductExplorerProps & Readonly<{ emptyMessage?: string; catalogKey: string }>) {
  const [page, setPage] = useState<Page>({ items: products, total, nextOffset });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [manual, setManual] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const appendPosition = useRef<{ x: number; y: number } | null>(null);
  const current = useRef({ page, error });
  current.current = { page, error };
  const live = useRef(true);
  const request = useRef<{ controller: AbortController; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cacheKey = typeof window === "undefined" ? catalogKey : `${window.location.host}:${catalogKey}`;

  // Restore list height before the existing catalog scroll-restoration loop runs.
  useLayoutEffect(() => {
    const snapshot = snapshots.get(cacheKey);
    if (snapshot && Date.now() - snapshot.updatedAt < TTL && snapshot.total === total && snapshot.baseIds.join(",") === products.map(product => product.id).join(",")) {
      const initialIds = new Set(snapshot.baseIds);
      setPage({ items: append(products, snapshot.items.filter(item => !initialIds.has(item.id))), total, nextOffset: snapshot.nextOffset });
    } else snapshots.delete(cacheKey);
  }, [cacheKey, products, total]);
  useEffect(() => {
    if (page.items.length <= products.length) return;
    snapshots.delete(cacheKey);
    snapshots.set(cacheKey, { ...page, updatedAt: Date.now(), baseIds: products.map(product => product.id) });
    while (snapshots.size > 6) snapshots.delete(snapshots.keys().next().value!);
  }, [cacheKey, page, products]);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; if (request.current) { clearTimeout(request.current.timer); request.current.controller.abort(); request.current = null; } };
  }, []);
  useLayoutEffect(() => {
    const position = appendPosition.current;
    if (!position) return;
    // Flush the expanded list's layout, then suppress footer scroll anchoring.
    // This runs only on append; browser Back remains owned by theme restoration.
    sentinel.current?.getBoundingClientRect();
    window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
    appendPosition.current = null;
  }, [page.items]);

  const load = useCallback(async () => {
    const offset = current.current.page.nextOffset;
    if (!live.current || request.current || appendPosition.current || offset === null) return;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    request.current = { controller, timer };
    setLoading(true); setError(false);
    try {
      const params = new URLSearchParams(catalogHref(path, selection, offset).split("?")[1] ?? "");
      params.set("path", path === "/search" ? productIndexPath(locale) : path);
      const response = await fetch(`/api/catalog/page?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("application/json")) throw new Error("catalog_unavailable");
      const next = readPage(await response.json(), offset);
      if (controller.signal.aborted || !live.current) return;
      appendPosition.current = { x: window.scrollX, y: window.scrollY };
      const expanded = { ...next, items: append(current.current.page.items, next.items) };
      current.current = { page: expanded, error: false };
      setPage(expanded);
    } catch {
      if (live.current && (!controller.signal.aborted || timedOut)) setError(true);
    } finally {
      clearTimeout(timer);
      if (request.current?.controller === controller) request.current = null;
      if (live.current) setLoading(false);
    }
  }, [path, locale, selection]);
  useEffect(() => {
    if (!window.IntersectionObserver) { setManual(true); return; }
    if (!sentinel.current || page.nextOffset === null || error) return;
    const observer = new window.IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !current.current.error) void load();
    }, { rootMargin: "320px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [page.nextOffset, error, load]);

  return <>
    <ProductGrid products={page.items} preserveOrder locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} emptyMessage={emptyMessage} />
    <div className="catalog-continuation" ref={sentinel} data-catalog-continuation aria-busy={loading}>
      <p className="sr-only" role="status">{loading ? "Diğer ürünler yükleniyor…" : `${page.items.length} / ${page.total} ürün gösteriliyor`}</p>
      {loading ? <span className="catalog-loading-mark" aria-hidden="true" /> : null}
      {error ? <><p>Diğer ürünler yüklenemedi.</p><button type="button" data-catalog-retry onClick={() => void load()}>Yeniden dene</button></> : manual && page.nextOffset !== null ? <button type="button" disabled={loading} onClick={() => void load()}>Daha fazla ürün göster</button> : null}
    </div>
    {page.nextOffset !== null ? <noscript><a href={catalogHref(path, selection, page.nextOffset)}>Diğer ürünleri gör</a></noscript> : null}
  </>;
}
