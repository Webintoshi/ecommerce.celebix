"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { catalogHref, isValidProductCatalogSearch, type ProductCatalogSelection } from "@/lib/product-catalog-query.ts";
import { ProductGrid } from "./ProductGrid";

const FILTERS = Object.freeze([
  ["all", "Tümü"],
  ["available", "Stokta"],
  ["discounted", "İndirimli"],
] as const);

export function ProductExplorer({
  products,
  locale,
  cardStyle,
  imageRatio,
  selection,
  total,
  nextOffset,
  path,
}: Readonly<{
  products: readonly PublicProduct[];
  locale: string;
  cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"];
  selection: ProductCatalogSelection;
  total: number;
  nextOffset: number | null;
  path: string;
}>) {
  const router = useRouter();
  const [query, setQuery] = useState(selection.query);
  const [order, setOrder] = useState(selection.order);

  useEffect(() => {
    setQuery(selection.query);
    setOrder(selection.order);
  }, [selection.query, selection.order, selection.filter, selection.offset, path]);

  const apply = () => router.push(catalogHref(path, { ...selection, query: query.trim(), order }, 0));

  return <div className="product-explorer">
    <div className="explorer-toolbar" role="search">
      <label className="explorer-search"><span>Ürün ara</span><input value={query} onChange={(event) => { if (isValidProductCatalogSearch(event.currentTarget.value)) setQuery(event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); apply(); } }} maxLength={100} placeholder="Ürün adına göre ara" type="search" /></label>
      <label className="explorer-order"><span>Sıralama</span><select value={order} onChange={(event) => setOrder(event.currentTarget.value as typeof order)}>
        <option value="featured">Öne çıkanlar</option><option value="title-asc">Ürün adı</option><option value="price-asc">Fiyat: artan</option><option value="price-desc">Fiyat: azalan</option>
      </select></label>
      <button type="button" onClick={apply}>Uygula</button>
    </div>
    <div className="explorer-filters" role="group" aria-label="Ürün filtresi">
      {FILTERS.map(([value, label]) => <button aria-pressed={selection.filter === value} key={value} type="button" onClick={() => router.push(catalogHref(path, { ...selection, query: query.trim(), order, filter: value }, 0))}>{label}</button>)}
    </div>
    <p className="explorer-count" aria-live="polite">{total} ürün bulundu</p>
    <ProductGrid products={products} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} emptyMessage="Aramanızla eşleşen ürün bulunamadı." />
    {selection.offset > 0 || nextOffset !== null ? <nav aria-label="Ürün sayfaları" className="explorer-pagination">
      {selection.offset > 0 ? <a href={catalogHref(path,selection,Math.max(0,selection.offset-24))}>Önceki</a> : null}
      {nextOffset !== null ? <a href={catalogHref(path,selection,nextOffset)}>Sonraki</a> : null}
    </nav> : null}
  </div>;
}
