import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/ProductGrid";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export async function generateMetadata(): Promise<Metadata> { const selected = await resolveStorefrontPage(); if (selected.kind !== "active") return { title: "Mağaza bulunamadı", robots: { index: false, follow: false } }; const { storefront, design } = selected.context; return { title: storefront.name, description: `${storefront.name} yeni ve aktif ürünleri`, icons: design.brand.favicon ? { icon: design.brand.favicon.url } : undefined, alternates: { canonical: storefront.canonicalUrl }, openGraph: { title: storefront.name, type: "website", url: storefront.canonicalUrl } }; }
export default async function HomePage() { const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage()); const now = new Date(); const products = await runtime.repository.listPublicProducts({ storefront, now, limit: 8 }); return <StorefrontFrame storefront={storefront} design={design} now={now}><section className="store-section store-container"><div className="section-heading"><div><span>SEÇİLİ KOLEKSİYON</span><h2>Yeni Ürünler</h2></div><Link href="/products">Tümünü gör →</Link></div><ProductGrid products={products.items} /></section></StorefrontFrame>; }
