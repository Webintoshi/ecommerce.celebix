"use client";

import type { PublicProduct } from "@celebix/saas-contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { favoritesStorageKey, mergeFavoriteProductIds, parseFavoriteProductIds, parseFavoriteResolutionResponse, reconcileFavoriteProductIds, toggleFavoriteProductId } from "../lib/favorites.ts";

type FavoriteStatus = Readonly<{
  count: number;
  ids: readonly string[];
  loading: boolean;
  error: boolean;
  products: readonly PublicProduct[];
  refresh(): Promise<void>;
  toggle(productId: string): void;
}>;

const Context = createContext<FavoriteStatus | null>(null);
const CSRF_COOKIE_PREFIX = "__Host-celebix_account_csrf=";
const FAVORITES_ENDPOINT = "/api/account/favorites";
const EMPTY_IDS: readonly string[] = [];

function accountToken() {
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(CSRF_COOKIE_PREFIX))?.slice(CSRF_COOKIE_PREFIX.length);
}

function withFavorite(ids: readonly string[], productId: string, enabled: boolean) {
  return ids.includes(productId) === enabled ? ids : toggleFavoriteProductId(ids, productId);
}

export function FavoriteStatusProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [ids, setIds] = useState(EMPTY_IDS);
  const [products, setProducts] = useState<readonly PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const visibleIds = useRef(EMPTY_IDS);
  const account = useRef<{ token: string | undefined; ids: readonly string[] }>({ token: undefined, ids: EMPTY_IDS });
  const deviceIds = useRef(EMPTY_IDS);
  const mutations = useRef(new Map<string, Promise<void>>());
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);

  const publish = useCallback((next: readonly string[]) => {
    visibleIds.current = next;
    setIds(next);
  }, []);

  const readDeviceIds = useCallback(() => {
    try {
      deviceIds.current = parseFavoriteProductIds(window.localStorage.getItem(favoritesStorageKey(window.location.hostname)));
    } catch {
      // The current tab can keep favorites while device storage is unavailable.
    }
    return deviceIds.current;
  }, []);

  const updateDeviceIds = useCallback((update: (current: readonly string[]) => readonly string[]) => {
    const current = readDeviceIds();
    const next = update(current);
    deviceIds.current = next;
    if (next === current) return;
    try { window.localStorage.setItem(favoritesStorageKey(window.location.hostname), JSON.stringify(next)); } catch {}
  }, [readDeviceIds]);

  const refresh = useCallback(async () => {
    if (!active.current || mutations.current.size > 0) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    try {
      const local = readDeviceIds();
      const token = accountToken();
      // Account favorites stay separate from device favorites so other devices can remove them.
      const session = await fetch("/api/account/session", { credentials: "same-origin", cache: "no-store", signal })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null) as { outcome?: string; snapshot?: { favorites?: Array<{ productId?: string }> } } | null;
      if (signal.aborted) return;
      if (session?.outcome === "found" && Array.isArray(session.snapshot?.favorites)) {
        const remote = session.snapshot.favorites.flatMap((item) => typeof item?.productId === "string" ? [item.productId] : []);
        account.current = { token, ids: mergeFavoriteProductIds(EMPTY_IDS, remote) };
      } else if (session?.outcome === "unauthenticated" || session?.outcome === "profile_required" || account.current.token !== token) {
        account.current = { token, ids: EMPTY_IDS };
      }
      const next = mergeFavoriteProductIds(local, account.current.ids);
      publish(next);
      if (next.length === 0) {
        setProducts([]);
        setError(false);
        return;
      }
      const response = await fetch("/api/favorites/resolve", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ productIds: next }),
      });
      if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new Error("storefront_favorites_resolution_failed");
      const resolved = parseFavoriteResolutionResponse(await response.json());
      if (signal.aborted) return;
      if (!resolved) throw new Error("storefront_favorites_resolution_failed");
      const canonicalIds = reconcileFavoriteProductIds(next, resolved);
      const unavailable = new Set(next.filter((id) => !canonicalIds.includes(id)));
      if (unavailable.size) {
        account.current.ids = account.current.ids.filter((id) => !unavailable.has(id));
        updateDeviceIds((stored) => stored.filter((id) => !unavailable.has(id)));
      }
      publish(canonicalIds);
      setProducts(resolved);
      setError(false);
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [publish, readDeviceIds, updateDeviceIds]);

  const toggle = useCallback((productId: string) => {
    const current = visibleIds.current;
    const next = toggleFavoriteProductId(current, productId);
    const enabled = next.includes(productId);
    if (enabled === current.includes(productId)) return;
    request.current?.abort();
    publish(next);
    const token = accountToken();
    if (!token && !mutations.current.has(productId)) {
      updateDeviceIds((stored) => withFavorite(stored, productId, enabled));
      void refresh();
      return;
    }
    const previous = mutations.current.get(productId);
    const mutation = Promise.resolve(previous).then(async () => {
      try {
        if (token !== accountToken()) return;
        if (!token) {
          updateDeviceIds((stored) => withFavorite(stored, productId, enabled));
          return;
        }
        const operationId = crypto.randomUUID();
        const response = await fetch(FAVORITES_ENDPOINT, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "content-type": "application/json", "x-celebix-account-csrf": token },
          body: JSON.stringify({ operationId, productId, enabled }),
        });
        if (token !== accountToken()) return;
        if (response.status === 401) {
          account.current = { token, ids: EMPTY_IDS };
          updateDeviceIds((stored) => withFavorite(stored, productId, enabled));
        } else if (response.ok) {
          const result = await response.json() as { outcome?: string } | null;
          if (token !== accountToken() || result?.outcome !== (enabled ? "created" : "removed")) return;
          const accountIds = account.current.token === token ? account.current.ids : EMPTY_IDS;
          account.current = { token, ids: withFavorite(accountIds, productId, enabled) };
          updateDeviceIds((stored) => withFavorite(stored, productId, false));
          try { window.localStorage.setItem(`${favoritesStorageKey(window.location.hostname)}:account-change`, operationId); } catch {}
        }
      } catch {
        // Keep the confirmed selection when the account write fails.
      } finally {
        if (mutations.current.get(productId) === mutation) {
          mutations.current.delete(productId);
          if (active.current) {
            const token = accountToken();
            const selected = readDeviceIds().includes(productId) || (account.current.token === token && account.current.ids.includes(productId));
            publish(withFavorite(visibleIds.current, productId, selected));
            void refresh();
          }
        }
      }
    });
    mutations.current.set(productId, mutation);
  }, [publish, readDeviceIds, refresh, updateDeviceIds]);

  useEffect(() => {
    active.current = true;
    publish(readDeviceIds());
    void refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null) {
        try {
          const key = favoritesStorageKey(window.location.hostname);
          if (event.key !== key && event.key !== `${key}:account-change`) return;
        } catch { return; }
      }
      void refresh();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active.current = false;
      request.current?.abort();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [publish, readDeviceIds, refresh]);

  const value = useMemo<FavoriteStatus>(() => ({
    count: ids.length, ids, loading, error,
    products: products.filter((product) => ids.includes(product.id)),
    refresh, toggle,
  }), [ids, loading, error, products, refresh, toggle]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFavoriteStatus(): FavoriteStatus {
  const selected = useContext(Context);
  if (!selected) throw new Error("favorite_status_provider_required");
  return selected;
}
