import type { Metadata } from "next";
import { ProductGrid } from "@/components/ProductGrid";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export async function generateMetadata(): Promise<Metadata> { const selected = await resolveStorefrontPage(); if (selected.kind !== "active") return { title: "Ürünler" }; const { storefront } = selected.context; return { title: `Ürünler | ${storefront.name}`, description: `${storefront.name} aktif ürün koleksiyonu`, alternates: { canonical: new URL("/products", storefront.canonicalUrl).toString() } }; }
export default async function ProductsPage() { const { runtime, storefront } = requireStorefrontPage(await resolveStorefrontPage()); const products = await runtime.repository.listPublicProducts({ storefront, now: new Date(), limit: 48 }); return <StorefrontFrame storefront={storefront}><section className="listing-hero"><div className="store-container"><span>KOLEKSİYON</span><h1>Ürünler</h1><p>{products.items.length} aktif ürün</p></div></section><section className="store-section store-container"><ProductGrid products={products.items} /></section></StorefrontFrame>; }
