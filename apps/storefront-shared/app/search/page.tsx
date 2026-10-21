import type { Metadata } from "next";
import Link from "next/link";
import { isCatalogSearchCursor } from "@celebix/saas-data";
import { StorefrontSearchForm } from "@/components/StorefrontSearchForm";

import { ProductGrid } from "@/components/ProductGrid";
import { CommercePageEvent } from "@/components/CommercePageEvent";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";
import { guzideThemeFor } from "../../themes/guzide/theme.ts";
import { hizliThemeFor } from "../../themes/hizli-kutu/theme.ts";
import { HizliProductExplorer } from "../../themes/hizli-kutu/HizliProductExplorer";
import { parseProductCatalogQuery, PRODUCT_CATALOG_PAGE_SIZE } from "../../lib/product-catalog-query.ts";
import guzideCatalogStyles from "../../themes/guzide/guzide-product-explorer.module.css";

export const metadata: Metadata = {
  title: "Arama",
  robots: { index: false, follow: false },
};
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function query(value: string | string[] | undefined): string | null {
  if (value === undefined || value === "") return "";
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    new TextEncoder().encode(value).byteLength > 100
  )
    return null;
  return value;
}

export default async function SearchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  const parameters = await searchParams;
  const selected = query(parameters.q);
  if (hizliThemeFor(storefront)) {
    const selection = parseProductCatalogQuery(parameters);
    if (!selected) return <StorefrontFrame storefront={storefront} design={design}><section className="hk-container hk-section"><h1 className="hk-search-title">Ürün ara</h1><StorefrontSearchForm defaultValue={selected ?? ""} clientNavigation />{selected === null ? <p role="alert">Arama metni geçersiz.</p> : null}</section></StorefrontFrame>;
    if (!runtime.repository.queryPublicCatalog) throw new Error("public_catalog_query_unavailable");
    const result = await runtime.repository.queryPublicCatalog({ storefront, now: new Date(), categorySlug: null, query: selection.query, filter: selection.filter, order: selection.order, offset: selection.offset, limit: PRODUCT_CATALOG_PAGE_SIZE });
    return <StorefrontFrame storefront={storefront} design={design}><section className="hk-container hk-section"><CommercePageEvent event={{ name: "search", data: {} }} /><HizliProductExplorer products={result.items} total={result.total} nextOffset={result.nextOffset} selection={selection} path="/search" locale={storefront.locale} cardStyle={storefront.presentation.theme.productCardStyle} imageRatio={storefront.presentation.theme.productImageRatio} /></section></StorefrontFrame>;
  }
  const cursor =
    typeof parameters.cursor === "string" && isCatalogSearchCursor(parameters.cursor)
      ? parameters.cursor
      : undefined;
  let failed = false;
  const result =
    selected === null ||
    selected === "" ||
    (parameters.cursor !== undefined && cursor === undefined)
      ? null
      : await runtime.content.search({
          hostname: storefront.hostname,
          now: new Date(),
          query: selected,
          limit: 48,
          ...(cursor ? { cursor } : {}),
        }).catch(() => { failed = true; return null; });
  const products = result?.items ?? Object.freeze([]);
  const guzide = guzideThemeFor(storefront);
  const message =
    selected === null
      ? "Arama metni geçersiz."
      : selected === ""
        ? "Aramak istediğiniz ürünü yazın."
        : "Aramanızla eşleşen ürün bulunamadı.";
  const grid = <ProductGrid
    preserveOrder
    products={products}
    locale={storefront.locale}
    cardStyle={storefront.presentation.theme.productCardStyle}
    imageRatio={storefront.presentation.theme.productImageRatio}
    emptyMessage={failed ? "Lütfen aramayı tekrar deneyin." : message}
  />;
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      {selected && !cursor ? <CommercePageEvent event={{ name: "search", data: {} }} /> : null}
      <section className={`store-section store-container${guzide ? ` ${guzideCatalogStyles.catalog}` : ""}`}>
        <h1 className="sr-only">Arama</h1>
        <StorefrontSearchForm key={selected ?? ""} defaultValue={selected ?? ""} clientNavigation={!!guzide} />
        <p className="search-result-count" aria-live="polite">
          {selected && !failed ? `${products.length} ürün gösteriliyor${result?.nextCursor ? " · Daha fazla sonuç var" : ""}` : ""}
        </p>
        {failed ? <p role="alert">Arama şu anda tamamlanamadı. <Link href={`/search?q=${encodeURIComponent(selected ?? "")}`}>Aramayı yeniden başlat</Link></p> : null}
        {guzide ? <div className={guzideCatalogStyles.products}>{grid}</div> : grid}
        {result?.nextCursor && selected ? (
          <Link
            className="store-button search-next"
            href={`/search?q=${encodeURIComponent(selected)}&cursor=${encodeURIComponent(result.nextCursor)}`}
          >
            Sonraki sonuçlar
          </Link>
        ) : null}
      </section>
    </StorefrontFrame>
  );
}
