"use client";

import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { useCallback, useEffect, useState } from "react";

import {
  favoritesStorageKey,
  parseFavoriteProductIds,
  parseFavoriteResolutionResponse,
  reconcileFavoriteProductIds,
} from "@/lib/favorites.ts";
import { ProductGrid } from "./ProductGrid";

type State = Readonly<{ kind: "loading" }> | Readonly<{ kind: "error" }> | Readonly<{ kind: "loaded"; products: readonly PublicProduct[] }>;

export function FavoritesPageClient({ locale, cardStyle, imageRatio }: Readonly<{ locale: string; cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"] }>) {
  const [state, setState] = useState<State>(Object.freeze({ kind: "loading" }));
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const key = favoritesStorageKey(window.location.hostname);
      let ids = parseFavoriteProductIds(window.localStorage.getItem(key));
      const session = await fetch("/api/account/session", { method: "GET", credentials: "same-origin", cache: "no-store", signal }).then((response) => response.ok ? response.json() : null).catch(() => null) as { outcome?: string; snapshot?: { favorites?: Array<{ productId?: string }> } } | null;
      if (session?.outcome === "found" && Array.isArray(session.snapshot?.favorites)) {
        const remote = session.snapshot.favorites.flatMap((item) => typeof item.productId === "string" ? [item.productId] : []);
        ids = parseFavoriteProductIds(JSON.stringify([...ids, ...remote]));
        window.localStorage.setItem(key, JSON.stringify(ids));
      }
      if (ids.length === 0) { setState(Object.freeze({ kind: "loaded", products: Object.freeze([]) })); return; }
      const response = await fetch("/api/favorites/resolve", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ productIds: ids }), signal });
      if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new Error();
      const products = parseFavoriteResolutionResponse(await response.json());
      if (!products) throw new Error();
      const canonicalIds = reconcileFavoriteProductIds(ids, products);
      window.localStorage.setItem(key, JSON.stringify(canonicalIds));
      setState(Object.freeze({ kind: "loaded", products }));
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setState(Object.freeze({ kind: "error" })); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const refresh = () => void load();
    window.addEventListener("storage", refresh);
    window.addEventListener("celebix:storefront:favorites:changed", refresh);
    return () => { controller.abort(); window.removeEventListener("storage", refresh); window.removeEventListener("celebix:storefront:favorites:changed", refresh); };
  }, [load]);

  if (state.kind === "loading") return <p className="store-status" role="status">Favoriler yükleniyor…</p>;
  if (state.kind === "error") return <div className="store-empty" role="alert"><span>◇</span><h2>Favoriler yüklenemedi</h2><p>Lütfen yeniden deneyin.</p><button className="store-button" type="button" onClick={() => void load()}>Yeniden dene</button></div>;
  return <ProductGrid products={state.products} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} emptyMessage="Henüz favori ürününüz yok." />;
}
