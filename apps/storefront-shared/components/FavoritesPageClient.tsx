"use client";

import type { PublicStarterThemePresentation } from "@celebix/saas-contracts";
import Link from "next/link";
import { productIndexPath } from "../lib/storefront-routes.ts";

import { useFavoriteStatus } from "./FavoriteStatusProvider";
import { ProductGrid } from "./ProductGrid";

export function FavoritesPageClient({ locale, cardStyle, imageRatio }: Readonly<{ locale: string; cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"] }>) {
  const { loading, error, products, refresh } = useFavoriteStatus();
  if (loading) return <p className="store-status" role="status">Favoriler yükleniyor…</p>;
  if (error) return <div className="store-empty" role="alert"><span>◇</span><h2>Favoriler yüklenemedi</h2><p>Lütfen yeniden deneyin.</p><button className="store-button" type="button" onClick={() => void refresh()}>Yeniden dene</button></div>;
  if (!products.length) return <div className="store-empty favorites-empty"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg><h2>Favorileriniz sizi bekliyor</h2><p>Beğendiğiniz ürünlerdeki kalbe dokunun; favorilerinizi burada bir araya getirelim.</p><Link className="store-button" href={productIndexPath(locale)}>Tüm ürünleri gör</Link></div>;
  return <ProductGrid products={products} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} emptyMessage="Henüz favori ürününüz yok." />;
}
