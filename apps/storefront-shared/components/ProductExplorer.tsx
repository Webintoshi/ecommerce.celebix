"use client";

import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { useMemo, useState } from "react";

import { selectProducts, type ProductExplorerFilter, type ProductExplorerOrder } from "@/lib/product-explorer.ts";
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
}: Readonly<{
  products: readonly PublicProduct[];
  locale: string;
  cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"];
}>) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductExplorerFilter>("all");
  const [order, setOrder] = useState<ProductExplorerOrder>("featured");
  const visible = useMemo(() => selectProducts(products, { query, filter, order }), [products, query, filter, order]);
  return <div className="product-explorer">
    <div className="explorer-toolbar">
      <label className="explorer-search"><span>Ürün ara</span><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Ürün adına göre ara" type="search" /></label>
      <div className="explorer-filters" aria-label="Ürün filtresi">
        {FILTERS.map(([value, label]) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{label}</button>)}
      </div>
      <label className="explorer-order"><span>Sıralama</span><select value={order} onChange={(event) => setOrder(event.currentTarget.value as ProductExplorerOrder)}>
        <option value="featured">Öne çıkanlar</option><option value="title-asc">Ürün adı</option><option value="price-asc">Fiyat: artan</option><option value="price-desc">Fiyat: azalan</option>
      </select></label>
    </div>
    <p className="explorer-count" aria-live="polite">{visible.length} ürün gösteriliyor</p>
    <ProductGrid products={visible} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} emptyMessage={products.length ? "Aramanızla eşleşen ürün bulunamadı." : undefined} />
  </div>;
}
