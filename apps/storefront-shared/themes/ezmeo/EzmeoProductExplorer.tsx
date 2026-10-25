"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductExplorerProps } from "../../components/ProductExplorer";
import { CatalogProductList } from "../../components/CatalogProductList";
import { useCommercePolicy } from "../../components/CommercePolicyProvider";
import { StoreIcon } from "../../components/StoreIcon";
import { catalogHref, isValidProductCatalogSearch, type ProductCatalogSelection } from "../../lib/product-catalog-query.ts";
import { productIndexPath } from "../../lib/storefront-routes.ts";

export function EzmeoProductExplorer({ selection: initial, ...props }: ProductExplorerProps) {
  const policy = useCommercePolicy();
  const selection: ProductCatalogSelection = policy.hidePrices ? { ...initial, order: initial.order.startsWith("price-") ? "featured" : initial.order, filter: initial.filter === "discounted" ? "all" : initial.filter } : initial;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(selection.query);
  const [order, setOrder] = useState(selection.order);
  useEffect(() => { setQuery(selection.query); setOrder(selection.order); }, [selection.query, selection.order, selection.filter, selection.offset, props.path]);
  const navigate = (next: ProductCatalogSelection) => {
    if (pending || !isValidProductCatalogSearch(next.query)) return;
    startTransition(() => router.push(catalogHref(props.path, { ...next, query: next.query.trim() }, 0), { scroll: false }));
  };
  return <div className="product-explorer ez-catalog" aria-busy={pending}>
    {props.catalog ? <h1 className="ez-catalog-title">{props.catalog.title}</h1> : null}
    <div className="ez-catalog-toolbar">
      <form className="ez-catalog-search" role="search" onSubmit={event => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("q") as HTMLInputElement; navigate({ ...selection, query: input.value, order }); }}>
        <button type="submit" aria-label="Ürünleri ara" disabled={pending}><StoreIcon name="search" /></button>
        <input name="q" aria-label="Ürün ara" type="search" value={query} disabled={pending} placeholder="Ürün ara" maxLength={100} onChange={event => { if (isValidProductCatalogSearch(event.currentTarget.value)) setQuery(event.currentTarget.value); }} />
      </form>
      <label className="ez-catalog-order"><span>Sırala</span><select value={order} disabled={pending} onChange={event => { const next = event.currentTarget.value as typeof order; setOrder(next); navigate({ ...selection, query, order: next }); }}>
        <option value="featured">Öne çıkanlar</option><option value="title-asc">Ürün adı</option>{!policy.hidePrices ? <><option value="price-asc">Fiyat: artan</option><option value="price-desc">Fiyat: azalan</option></> : null}
      </select></label>
    </div>
    <div className="ez-catalog-meta">
      <div className="explorer-filters" role="group" aria-label="Ürün filtresi">{([["all", "Tümü"], ["available", "Stokta"], ["discounted", "İndirimli"]] as const).filter(([value]) => !policy.hidePrices || value !== "discounted").map(([value, label]) => <button type="button" key={value} data-filter={value} disabled={pending} aria-pressed={selection.filter === value} onClick={() => navigate({ ...selection, query, order, filter: value })}>{label}</button>)}</div>
      <p className="explorer-count" aria-live="polite">{props.total} ürün</p>
    </div>
    {props.total === 0 ? <div className="store-empty ez-catalog-empty">
      <h2>Ürün bulunamadı</h2>
      <p>{selection.query || selection.filter !== "all" ? "Aramanızı veya filtrelerinizi değiştirerek yeniden deneyin." : "Şu anda gösterilecek ürün bulunmuyor."}</p>
      <button className="store-button store-button-secondary" type="button" disabled={pending} onClick={() => {
        setQuery("");
        startTransition(() => router.push(productIndexPath(props.locale)));
      }}>Tüm ürünleri gör</button>
    </div> : <CatalogProductList {...props} selection={selection} emptyMessage="Aramanızla eşleşen ürün bulunamadı." />}
  </div>;
}
