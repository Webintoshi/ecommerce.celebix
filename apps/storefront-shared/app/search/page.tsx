import type { Metadata } from "next";
import Link from "next/link";

import { ProductGrid } from "@/components/ProductGrid";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Arama", robots: { index: false, follow: false } };
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CURSOR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function query(value: string | string[] | undefined): string | null {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value) || new TextEncoder().encode(value).byteLength > 100) return null;
  return value;
}

export default async function SearchPage({ searchParams }: Readonly<{ searchParams: Promise<{ q?: string | string[]; cursor?: string | string[] }> }>) {
  const { runtime, storefront } = requireStorefrontPage(await resolveStorefrontPage());
  const parameters = await searchParams;
  const selected = query(parameters.q);
  const cursor = typeof parameters.cursor === "string" && CURSOR.test(parameters.cursor) ? parameters.cursor : undefined;
  const result = selected === null || selected === "" || parameters.cursor !== undefined && cursor === undefined ? null : await runtime.content.search({ hostname: storefront.hostname, now: new Date(), query: selected, limit: 48, ...(cursor ? { cursor } : {}) });
  const products = result?.items ?? Object.freeze([]);
  const message = selected === null ? "Arama metni geçersiz." : selected === "" ? "Aramak istediğiniz ürünü yazın." : "Aramanızla eşleşen ürün bulunamadı.";
  return <StorefrontFrame storefront={storefront}><section className="listing-hero"><div className="store-container"><span>MAĞAZADA ARA</span><h1>Arama</h1><form action="/search" className="store-search-form" method="get"><label htmlFor="store-search">Ürün adı, SKU, marka, kategori veya etiket</label><div><input autoComplete="off" defaultValue={selected ?? ""} id="store-search" maxLength={100} name="q" placeholder="Ne aramıştınız?" type="search" /><button className="store-button" type="submit">Ara</button></div></form></div></section><section className="store-section store-container"><p className="search-result-count" aria-live="polite">{selected ? `${products.length} sonuç` : ""}</p><ProductGrid products={products} cardStyle={storefront.presentation.theme.productCardStyle} imageRatio={storefront.presentation.theme.productImageRatio} emptyMessage={message} />{result?.nextCursor && selected ? <Link className="store-button search-next" href={`/search?q=${encodeURIComponent(selected)}&cursor=${encodeURIComponent(result.nextCursor)}`}>Sonraki sonuçlar</Link> : null}</section></StorefrontFrame>;
}
