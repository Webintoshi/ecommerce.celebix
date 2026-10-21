"use client";
import { useMemo } from "react";
import { useCommercePolicy } from "./CommercePolicyProvider";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { catalogHref, isValidProductCatalogSearch, type ProductCatalogSelection } from "@/lib/product-catalog-query.ts";
import { CatalogProductList } from "./CatalogProductList";
import { SioraProductExplorer } from "../themes/siora/SioraProductExplorer";
import { GuzideProductExplorer } from "../themes/guzide/GuzideProductExplorer";
import type { GuzideCatalogContext } from "../themes/guzide/guzide-catalog.ts";
import type { StorefrontVisualTheme } from "../themes/visual-theme.ts";
import { HizliProductExplorer } from "../themes/hizli-kutu/HizliProductExplorer";

const FILTERS = Object.freeze([
  ["all", "Tümü"],
  ["available", "Stokta"],
  ["discounted", "İndirimli"],
] as const);

export type ProductExplorerProps = Readonly<{
  products: readonly PublicProduct[];
  locale: string;
  cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"];
  selection: ProductCatalogSelection;
  total: number;
  nextOffset: number | null;
  path: string;
  preserveOrder?: boolean;
  visualTheme?: StorefrontVisualTheme;
  catalog?: GuzideCatalogContext;
}>;

export function ProductExplorer({ visualTheme, ...props }: ProductExplorerProps) {
  if (visualTheme === "hizli-kutu-deniz") return <HizliProductExplorer {...props} />;
  if (visualTheme === "guzide-deniz") return <GuzideProductExplorer {...props} />;
  return visualTheme === "siora-deniz" || visualTheme === "alpler-deniz" ? <SioraProductExplorer {...props} /> : <StandardProductExplorer {...props} />;
}

function StandardProductExplorer({ products, locale, cardStyle, imageRatio, selection: initialSelection, total, nextOffset, path, preserveOrder = false }: ProductExplorerProps) {
  const policy = useCommercePolicy();
  const selection = useMemo(() => policy.hidePrices ? { ...initialSelection, filter: initialSelection.filter === "discounted" ? "all" as const : initialSelection.filter, order: initialSelection.order.startsWith("price-") ? "featured" as const : initialSelection.order } : initialSelection, [initialSelection, policy.hidePrices]);
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
      <label className="explorer-search"><span>Ürün ara</span><input value={query} onChange={(event) => { if (isValidProductCatalogSearch(event.currentTarget.value)) setQuery(event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); apply(); } }} maxLength={100} placeholder="Ürün adı, kodu veya marka ara" type="search" /></label>
      <label className="explorer-order"><span>Sıralama</span><select value={order} onChange={(event) => setOrder(event.currentTarget.value as typeof order)}>
        <option value="featured">Öne çıkanlar</option><option value="title-asc">Ürün adı</option>{!policy.hidePrices ? <><option value="price-asc">Fiyat: artan</option><option value="price-desc">Fiyat: azalan</option></> : null}
      </select></label>
      <button type="button" onClick={apply}>Uygula</button>
    </div>
    <div className="explorer-filters" role="group" aria-label="Ürün filtresi">
      {FILTERS.filter(([value]) => !policy.hidePrices || value !== "discounted").map(([value, label]) => <button aria-pressed={selection.filter === value} key={value} type="button" onClick={() => router.push(catalogHref(path, { ...selection, query: query.trim(), order, filter: value }, 0))}>{label}</button>)}
    </div>
    <p className="explorer-count" aria-live="polite">{total} ürün bulundu</p>
    <CatalogProductList products={products} preserveOrder={preserveOrder} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} selection={selection} total={total} nextOffset={nextOffset} path={path} emptyMessage="Aramanızla eşleşen ürün bulunamadı." />
  </div>;
}
