"use client";

import { useEffect, useRef } from "react";

type ScrollPosition = Readonly<{ x: number; y: number; updatedAt: number }>;
type PendingCatalogRestore = Readonly<{ route: string; position: ScrollPosition; requestedAt: number }>;
const CATALOG_PARAMETERS = new Set(["q", "filter", "sort", "offset", "cursor"]);
const pendingCatalogRestores = new Map<string, PendingCatalogRestore>();

function catalogRouteKey(): string {
  const parameters = new URLSearchParams([...new URLSearchParams(window.location.search)].filter(([key]) => CATALOG_PARAMETERS.has(key)));
  return `${window.location.pathname}${parameters.size ? `?${parameters}` : ""}`;
}
export function isCatalog(pathname: string): boolean {
  return pathname === "/urunler" || pathname === "/products" || pathname === "/search" || pathname.startsWith("/kategori/") || pathname.startsWith("/categories/") || pathname.startsWith("/koleksiyon/") || pathname.startsWith("/collections/");
}

type CatalogReturn = Readonly<{ route: string; productPath: string; requestedAt: number; bound?: boolean }>;

function readSioraCatalogReturn(storefrontId: string): CatalogReturn | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(`celebix:siora:${storefrontId}:catalog-return`) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entry = value as { route?: unknown; productPath?: unknown; requestedAt?: unknown; bound?: unknown };
    if (typeof entry.route !== "string" || typeof entry.productPath !== "string" || entry.productPath !== window.location.pathname || typeof entry.requestedAt !== "number" || !Number.isFinite(entry.requestedAt)) return null;
    const age = Date.now() - entry.requestedAt;
    if (age < 0 || age >= 30 * 60 * 1_000) return null;
    const route = new URL(entry.route, window.location.origin);
    if (route.origin !== window.location.origin || route.hash || !isCatalog(route.pathname) || ![...route.searchParams].every(([key]) => CATALOG_PARAMETERS.has(key))) return null;
    return { route: `${route.pathname}${route.search}`, productPath: entry.productPath, requestedAt: entry.requestedAt, bound: entry.bound === true };
  } catch { return null; }
}

function bindSioraCatalogReturn(storefrontId: string): void {
  const entry = readSioraCatalogReturn(storefrontId);
  if (!entry || entry.bound || Date.now() - entry.requestedAt > 30_000) return;
  try {
    // Consume first so a failed history update cannot bind this token to a later visit.
    window.sessionStorage.setItem(`celebix:siora:${storefrontId}:catalog-return`, JSON.stringify({ ...entry, bound: true }));
    window.history.replaceState({ ...window.history.state, celebixSioraCatalogReturn: { storefrontId, requestedAt: entry.requestedAt } }, "", window.location.href);
  } catch { /* A safe catalog fallback remains available when storage or history is denied. */ }
}

export function sioraCatalogReturnRoute(storefrontId: string): string | null {
  const entry = readSioraCatalogReturn(storefrontId);
  if (!entry?.bound) return null;
  try {
    const marker = window.history.state?.celebixSioraCatalogReturn;
    return marker?.storefrontId === storefrontId && marker.requestedAt === entry.requestedAt ? entry.route : null;
  } catch { return null; }
}

// Store catalog coordinates only; account, cart and checkout contents never enter this cache.
export function useCatalogScrollRestoration(storefrontId: string, pathname: string, overlayOpen: boolean, storagePrefix = "siora") {
  const overlayRef = useRef(overlayOpen);
  overlayRef.current = overlayOpen;
  const pendingRef = useRef<PendingCatalogRestore | null>(null);
  const departingRouteRef = useRef<string | null>(null);
  const restoreRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (storagePrefix === "siora") bindSioraCatalogReturn(storefrontId);
    const storageKey = `celebix:${storagePrefix}:${storefrontId}:catalog-scroll`;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let departureTimer: ReturnType<typeof setTimeout> | undefined;
    let restoreFrame = 0;
    const read = (): Record<string, ScrollPosition> => {
      try {
        const value: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        return Object.fromEntries(Object.entries(value).filter(([route, item]) => {
          const position = item as Partial<ScrollPosition> | null;
          return isCatalog(route.split("?", 1)[0]) && [...new URLSearchParams(route.split("?").slice(1).join("?"))].every(([key]) => CATALOG_PARAMETERS.has(key)) && position && typeof position.x === "number" && Number.isFinite(position.x) && position.x >= 0 && typeof position.y === "number" && Number.isFinite(position.y) && position.y >= 0 && position.y < 10_000_000 && typeof position.updatedAt === "number" && Date.now() - position.updatedAt < 86_400_000;
        })) as Record<string, ScrollPosition>;
      } catch { return {}; }
    };
    const save = () => {
      if (!isCatalog(window.location.pathname) || overlayRef.current || pendingRef.current || departingRouteRef.current === catalogRouteKey()) return;
      try {
        const positions = { ...read(), [catalogRouteKey()]: { x: window.scrollX, y: window.scrollY, updatedAt: Date.now() } };
        const recent = Object.entries(positions).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 20);
        window.sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(recent)));
      } catch { /* Catalog browsing still works when storage is unavailable. */ }
    };
    const clearDeparture = () => { clearTimeout(departureTimer); departingRouteRef.current = null; };
    const cancelRestore = () => { window.cancelAnimationFrame(restoreFrame); pendingRef.current = null; pendingCatalogRestores.delete(storefrontId); };
    const restore = () => {
      window.cancelAnimationFrame(restoreFrame);
      let attempts = 0;
      let stableFrames = 0;
      const tick = () => {
        const pending = pendingRef.current;
        if (!pending || pending.route !== catalogRouteKey() || overlayRef.current) { cancelRestore(); return; }
        attempts += 1;
        const availableHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
        if (availableHeight >= pending.position.y || attempts >= 90) {
          window.scrollTo({ left: pending.position.x, top: pending.position.y, behavior: "instant" });
          stableFrames += 1;
        }
        if (stableFrames >= 8 || attempts >= 100) { cancelRestore(); return; }
        restoreFrame = window.requestAnimationFrame(tick);
      };
      restoreFrame = window.requestAnimationFrame(() => { restoreFrame = window.requestAnimationFrame(tick); });
    };
    restoreRef.current = restore;
    const initialPending = pendingCatalogRestores.get(storefrontId);
    if (initialPending && initialPending.route === catalogRouteKey() && Date.now() - initialPending.requestedAt < 5_000) { pendingRef.current = initialPending; restore(); }
    else pendingCatalogRestores.delete(storefrontId);
    const onPop = () => {
      clearTimeout(saveTimer);
      clearDeparture();
      cancelRestore();
      if (!isCatalog(window.location.pathname)) return;
      const route = catalogRouteKey();
      const position = read()[route];
      if (position) { pendingRef.current = { route, position, requestedAt: Date.now() }; pendingCatalogRestores.set(storefrontId, pendingRef.current); restore(); }
    };
    const onScroll = () => {
      if (departingRouteRef.current && departingRouteRef.current !== catalogRouteKey()) clearDeparture();
      clearTimeout(saveTimer); saveTimer = setTimeout(save, 100);
    };
    const onClick = (event: globalThis.MouseEvent) => {
      clearTimeout(saveTimer);
      clearDeparture();
      save();
      if (!isCatalog(window.location.pathname) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname || !(destination.pathname.startsWith("/urun/") || destination.pathname.startsWith("/products/"))) return;
      const route = catalogRouteKey();
      try {
        window.sessionStorage.setItem(`celebix:${storagePrefix}:${storefrontId}:catalog-return`, JSON.stringify({ route, productPath: destination.pathname, requestedAt: Date.now(), bound: false }));
      } catch { /* Product navigation still works when storage is unavailable. */ }
      // Keep the click coordinate while Next begins leaving this catalog URL.
      departingRouteRef.current = route;
      departureTimer = setTimeout(clearDeparture, 3_000);
    };
    const onPageHide = () => { clearTimeout(saveTimer); save(); };
    const onUserInput = () => { clearDeparture(); cancelRestore(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onPop(); };
    const onKey = (event: KeyboardEvent) => { clearDeparture(); if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancelRestore(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("click", onClick, true);
    window.addEventListener("wheel", onUserInput, { passive: true });
    window.addEventListener("touchstart", onUserInput, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(saveTimer); clearDeparture(); window.cancelAnimationFrame(restoreFrame); pendingRef.current = null; restoreRef.current = null;
      window.removeEventListener("scroll", onScroll); window.removeEventListener("popstate", onPop);
      window.removeEventListener("pageshow", onPageShow); window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("click", onClick, true); window.removeEventListener("wheel", onUserInput);
      window.removeEventListener("touchstart", onUserInput); window.removeEventListener("keydown", onKey);
    };
  }, [storagePrefix, storefrontId]);

  useEffect(() => {
    if (departingRouteRef.current !== catalogRouteKey()) departingRouteRef.current = null;
    if (pendingRef.current?.route === catalogRouteKey()) restoreRef.current?.();
  }, [pathname]);
}

