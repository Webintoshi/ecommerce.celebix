"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { favoritesStorageKey, parseFavoriteProductIds, parseFavoriteResolutionResponse, reconcileFavoriteProductIds } from "@/lib/favorites.ts";

type FavoriteStatus = Readonly<{ count: number; loading: boolean; refresh(): Promise<void> }>;

const Context = createContext<FavoriteStatus | null>(null);

export function FavoriteStatusProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const key = favoritesStorageKey(window.location.hostname);
      const ids = parseFavoriteProductIds(window.localStorage.getItem(key));
      if (ids.length === 0) { setCount(0); return; }
      const response = await fetch("/api/favorites/resolve", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ productIds: ids }), signal });
      if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new Error("storefront_favorites_resolution_failed");
      const products = parseFavoriteResolutionResponse(await response.json());
      if (!products) throw new Error("storefront_favorites_resolution_failed");
      const canonicalIds = reconcileFavoriteProductIds(ids, products);
      window.localStorage.setItem(key, JSON.stringify(canonicalIds));
      setCount(canonicalIds.length);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setCount(0);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const synchronize = () => void refresh(controller.signal);
    synchronize();
    window.addEventListener("storage", synchronize);
    window.addEventListener("celebix:storefront:favorites:changed", synchronize);
    return () => { controller.abort(); window.removeEventListener("storage", synchronize); window.removeEventListener("celebix:storefront:favorites:changed", synchronize); };
  }, [refresh]);
  const value = useMemo<FavoriteStatus>(() => Object.freeze({ count, loading, refresh: async () => refresh() }), [count, loading, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFavoriteStatus(): FavoriteStatus {
  const selected = useContext(Context);
  if (!selected) throw new Error("favorite_status_provider_required");
  return selected;
}
