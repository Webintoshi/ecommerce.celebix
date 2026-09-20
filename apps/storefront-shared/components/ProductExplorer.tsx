"use client";

import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { catalogHref, type ProductCatalogSelection } from "@/lib/product-catalog-query.ts";
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
  return <div className="product-explorer">
    <form action={path} className="explorer-toolbar" method="get">
      <label className="explorer-search"><span>Ürün ara</span><input defaultValue={selection.query} maxLength={100} name="q" placeholder="Ürün adına göre ara" type="search" /></label>
      <input name="filter" type="hidden" value={selection.filter} />
      <label className="explorer-order"><span>Sıralama</span><select defaultValue={selection.order} name="sort">
        <option value="featured">Öne çıkanlar</option><option value="title-asc">Ürün adı</option><option value="price-asc">Fiyat: artan</option><option value="price-desc">Fiyat: azalan</option>
      </select></label>
      <button type="submit">Uygula</button>
    </form>
    <form action={path} className="explorer-filters" method="get" aria-label="Ürün filtresi">
      <input name="q" type="hidden" value={selection.query} />
      <input name="sort" type="hidden" value={selection.order} />
      {FILTERS.map(([value, label]) => <button aria-pressed={selection.filter === value} key={value} name="filter" type="submit" value={value}>{label}</button>)}
    </form>
    <p className="explorer-count" aria-live="polite">{total} ürün bulundu</p>
    <ProductGrid products={products} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} emptyMessage="Aramanızla eşleşen ürün bulunamadı." />
    {selection.offset > 0 || nextOffset !== null ? <nav aria-label="Ürün sayfaları" className="explorer-pagination">
      {selection.offset > 0 ? <a href={catalogHref(path,selection,Math.max(0,selection.offset-24))}>Önceki</a> : null}
      {nextOffset !== null ? <a href={catalogHref(path,selection,nextOffset)}>Sonraki</a> : null}
    </nav> : null}
  </div>;
}
