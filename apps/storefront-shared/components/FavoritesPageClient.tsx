"use client";

import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { useCallback, useEffect, useState } from "react";

import {
  favoritesStorageKey,
  parseFavoriteProductIds,
  reconcileFavoriteProductIds,
} from "@/lib/favorites.ts";
import { ProductGrid } from "./ProductGrid";

type State = Readonly<{ kind: "loading" }> | Readonly<{ kind: "error" }> | Readonly<{ kind: "loaded"; products: readonly PublicProduct[] }>;

function isProduct(value: unknown): value is PublicProduct {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && /^[0-9a-f-]{36}$/.test(row.id)
    && typeof row.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)
    && typeof row.title === "string" && row.title.length > 0 && row.title.length <= 200
    && row.currency === "TRY" && row.status === "active" && Number.isSafeInteger(row.priceCents)
    && typeof row.available === "boolean" && Array.isArray(row.variants) && Array.isArray(row.media);
}

function responseProducts(value: unknown): readonly PublicProduct[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== 1 || !descriptors.items || !("value" in descriptors.items) || !descriptors.items.enumerable || !Array.isArray(descriptors.items.value) || descriptors.items.value.length > 100 || !descriptors.items.value.every(isProduct)) return null;
  return Object.freeze([...descriptors.items.value] as PublicProduct[]);
}

export function FavoritesPageClient({ cardStyle, imageRatio }: Readonly<{ cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"] }>) {
  const [state, setState] = useState<State>(Object.freeze({ kind: "loading" }));
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const key = favoritesStorageKey(window.location.hostname);
      const ids = parseFavoriteProductIds(window.localStorage.getItem(key));
      if (ids.length === 0) { setState(Object.freeze({ kind: "loaded", products: Object.freeze([]) })); return; }
      const response = await fetch("/api/favorites/resolve", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ productIds: ids }), signal });
      if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new Error();
      const products = responseProducts(await response.json());
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
  return <ProductGrid products={state.products} cardStyle={cardStyle} imageRatio={imageRatio} emptyMessage="Henüz favori ürününüz yok." />;
}
