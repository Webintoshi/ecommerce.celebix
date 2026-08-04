"use client";

import { useCallback, useEffect, useState } from "react";

import {
  favoritesStorageKey,
  parseFavoriteProductIds,
  toggleFavoriteProductId,
} from "@/lib/favorites.ts";
import { StoreIcon } from "./StoreIcon";

const CHANGE_EVENT = "celebix:storefront:favorites:changed";

export function FavoriteButton({ productId, productTitle }: Readonly<{ productId: string; productTitle: string }>) {
  const [selected, setSelected] = useState(false);
  const synchronize = useCallback(() => {
    try {
      const key = favoritesStorageKey(window.location.hostname);
      setSelected(parseFavoriteProductIds(window.localStorage.getItem(key)).includes(productId));
    } catch { setSelected(false); }
  }, [productId]);

  useEffect(() => {
    synchronize();
    const storage = (event: StorageEvent) => {
      try { if (event.key === favoritesStorageKey(window.location.hostname)) synchronize(); } catch {}
    };
    window.addEventListener("storage", storage);
    window.addEventListener(CHANGE_EVENT, synchronize);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener(CHANGE_EVENT, synchronize); };
  }, [synchronize]);

  const toggle = () => {
    try {
      const key = favoritesStorageKey(window.location.hostname);
      const current = parseFavoriteProductIds(window.localStorage.getItem(key));
      const next = toggleFavoriteProductId(current, productId);
      window.localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
      const token = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-celebix_account_csrf="))?.slice("__Host-celebix_account_csrf=".length) ?? "";
      if (token) void fetch("/api/account/favorites", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-celebix-account-csrf": token }, body: JSON.stringify({ operationId: crypto.randomUUID(), productId, enabled: next.includes(productId) }) }).catch(() => undefined);
    } catch { setSelected(false); }
  };

  return <button className="favorite-button" type="button" aria-label={`${productTitle} ${selected ? "favorilerden çıkar" : "favorilere ekle"}`} aria-pressed={selected} onClick={toggle}><StoreIcon name="heart" /></button>;
}
