import type { Metadata } from "next";

import { ProductGrid } from "@/components/ProductGrid";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Arama", robots: { index: false, follow: false } };
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function query(value: string | string[] | undefined): string | null {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value) || new TextEncoder().encode(value).byteLength > 200) return null;
  return value;
}

export default async function SearchPage({ searchParams }: Readonly<{ searchParams: Promise<{ q?: string | string[] }> }>) {
  const { runtime, storefront } = requireStorefrontPage(await resolveStorefrontPage());
  const selected = query((await searchParams).q);
  const result = selected === null || selected === "" ? null : await runtime.content.search({ hostname: storefront.hostname, now: new Date(), query: selected, limit: 48 });
  const products = result?.items ?? Object.freeze([]);
  const message = selected === null ? "Arama metni geçersiz." : selected === "" ? "Aramak istediğiniz ürünü yazın." : "Aramanızla eşleşen ürün bulunamadı.";
  return <StorefrontFrame storefront={storefront}><section className="listing-hero"><div className="store-container"><span>MAĞAZADA ARA</span><h1>Arama</h1><form action="/search" className="store-search-form" method="get"><label htmlFor="store-search">Ürün adı</label><div><input autoComplete="off" defaultValue={selected ?? ""} id="store-search" maxLength={200} name="q" placeholder="Ne aramıştınız?" type="search" /><button className="store-button" type="submit">Ara</button></div></form></div></section><section className="store-section store-container"><p className="search-result-count" aria-live="polite">{selected ? `${products.length} sonuç` : ""}</p><ProductGrid products={products} cardStyle={storefront.presentation.theme.productCardStyle} imageRatio={storefront.presentation.theme.productImageRatio} emptyMessage={message} /></section></StorefrontFrame>;
}
