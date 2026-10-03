"use client";

import { useEffect, useRef } from "react";
import { guzideThemeFor } from "./theme.ts";

type BrowseEntry = Readonly<{ scope: string; id: string; route: string }>;
type ScrollPosition = Readonly<{ entry: BrowseEntry; x: number; y: number; updatedAt: number }>;
type ProductReturn = Readonly<{ scope: string; id: string; source: BrowseEntry; productRoute: string; requestedAt: number; bound: boolean }>;
type PendingRestore = Readonly<{ position: ScrollPosition; requestedAt: number }>;
const ENTRY_KEY = "__celebixGuzideBrowse";
const RETURN_KEY = "__celebixGuzideReturn";
const pendingRestores = new Map<string, PendingRestore>();
const MAX_AGE = 24 * 60 * 60 * 1_000;

function currentRoute(): string { return `${window.location.pathname}${window.location.search}`; }
function mobile(): boolean { return window.matchMedia("(max-width: 1024px)").matches; }
function browseRoute(route: string): boolean {
  const pathname = route.split("?", 1)[0];
  return /^(?:\/(?:tr|en))?\/?$/u.test(pathname)
    || /^(?:\/(?:tr|en))?\/(?:urunler|products|search)$/u.test(pathname)
    || /^(?:\/(?:tr|en))?\/(?:kategori|categories|koleksiyon|collections)\/[^/]+$/u.test(pathname);
}
function productRoute(route: string): boolean { return /^(?:\/(?:tr|en))?\/(?:urun|products)\/[^/?]+(?:\?|$)/u.test(route); }
function safeRoute(route: unknown, predicate: (value: string) => boolean): route is string {
  if (typeof route !== "string" || route.length > 2048 || !route.startsWith("/") || route.startsWith("//")) return false;
  try { const url = new URL(route, window.location.origin); return url.origin === window.location.origin && !url.hash && `${url.pathname}${url.search}` === route && predicate(route); }
  catch { return false; }
}
export function guzideBrowserScope(storefrontId: string): string | null {
  return typeof window !== "undefined" && guzideThemeFor({ id: storefrontId }) ? `celebix:guzide:${window.location.host}:${storefrontId}` : null;
}
function validEntry(value: unknown, scope: string): value is BrowseEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<BrowseEntry>;
  return entry.scope === scope && typeof entry.id === "string" && entry.id.length > 0 && safeRoute(entry.route, browseRoute);
}
function currentEntry(scope: string): BrowseEntry | null {
  const entry: unknown = window.history.state?.[ENTRY_KEY];
  return validEntry(entry, scope) && entry.route === currentRoute() ? entry : null;
}
function identifier(): string { return `${Date.now()}:${Math.random().toString(36).slice(2)}`; }
function ensureBrowseEntry(scope: string): void {
  if (!safeRoute(currentRoute(), browseRoute) || currentEntry(scope)) return;
  try { window.history.replaceState({ ...window.history.state, [ENTRY_KEY]: { scope, id: identifier(), route: currentRoute() } }, "", window.location.href); }
  catch { /* Native history remains usable when state cannot be written. */ }
}
function readPositions(scope: string): Record<string, ScrollPosition> {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(`${scope}:scroll`) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, raw]) => {
      const position = raw as Partial<ScrollPosition> | null;
      return position && validEntry(position.entry, scope) && position.entry.id === id
        && typeof position.x === "number" && Number.isFinite(position.x) && position.x >= 0 && position.x < 10_000_000
        && typeof position.y === "number" && Number.isFinite(position.y) && position.y >= 0 && position.y < 10_000_000
        && typeof position.updatedAt === "number" && Date.now() - position.updatedAt >= 0 && Date.now() - position.updatedAt < MAX_AGE;
    })) as Record<string, ScrollPosition>;
  } catch { return {}; }
}
function readReturn(scope: string): ProductReturn | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(`${scope}:return`) ?? "null");
    if (!value || typeof value !== "object") return null;
    const token = value as Partial<ProductReturn>;
    const age = Date.now() - (token.requestedAt ?? Number.NaN);
    return token.scope === scope && typeof token.id === "string" && validEntry(token.source, scope)
      && safeRoute(token.productRoute, productRoute) && token.productRoute === currentRoute()
      && Number.isFinite(age) && age >= 0 && age < 30 * 60_000 && typeof token.bound === "boolean"
      ? token as ProductReturn : null;
  } catch { return null; }
}
function bindReturn(scope: string): void {
  const token = readReturn(scope);
  if (!token || token.bound || Date.now() - token.requestedAt > 30_000) return;
  try {
    // Consume before binding: checkout or a new product visit cannot reuse this click.
    window.sessionStorage.setItem(`${scope}:return`, JSON.stringify({ ...token, bound: true }));
    window.history.replaceState({ ...window.history.state, [RETURN_KEY]: { scope, id: token.id, productRoute: token.productRoute } }, "", window.location.href);
  } catch { /* A normal category link is the safe fallback. */ }
}
export function guzideBrowsingReturnRoute(storefrontId: string): string | null {
  const scope = guzideBrowserScope(storefrontId);
  if (!scope || !mobile()) return null;
  const token = readReturn(scope), marker = window.history.state?.[RETURN_KEY];
  return token?.bound && marker?.scope === scope && marker.id === token.id && marker.productRoute === currentRoute() ? token.source.route : null;
}

/** Preserve each mobile browsing history entry, rather than applying stale URL coordinates on every visit. */
export function useGuzideBrowsingContinuity({ storefrontId, pathname, query, overlayOpen = false }: Readonly<{ storefrontId: string; pathname: string; query: string; overlayOpen?: boolean }>): void {
  const overlayRef = useRef(overlayOpen);
  overlayRef.current = overlayOpen;
  const syncRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const scope = guzideBrowserScope(storefrontId);
    if (!scope) return;
    let frame = 0, saveTimer: ReturnType<typeof setTimeout> | undefined, departureTimer: ReturnType<typeof setTimeout> | undefined;
    let pending: PendingRestore | null = null, departing: string | null = null, activeEntry: BrowseEntry | null = null;
    const blocked = () => overlayRef.current || document.body.style.overflow === "hidden";
    const clearDeparture = () => { clearTimeout(departureTimer); departing = null; };
    const cancelRestore = () => { window.cancelAnimationFrame(frame); frame = 0; pending = null; pendingRestores.delete(scope); };
    const save = () => {
      const entry = currentEntry(scope);
      if (!mobile() || !entry || blocked() || pending || departing === entry.id) return;
      try {
        const positions = { ...readPositions(scope), [entry.id]: { entry, x: window.scrollX, y: window.scrollY, updatedAt: Date.now() } };
        const recent = Object.entries(positions).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, 30);
        window.sessionStorage.setItem(`${scope}:scroll`, JSON.stringify(Object.fromEntries(recent)));
      } catch { /* Browsing works when session storage is unavailable. */ }
    };
    const restore = () => {
      window.cancelAnimationFrame(frame);
      let attempts = 0, settled = 0;
      const tick = () => {
        const entry = currentEntry(scope);
        if (!pending || !mobile() || blocked() || entry?.id !== pending.position.entry.id || entry.route !== pending.position.entry.route) { cancelRestore(); return; }
        attempts += 1;
        const availableHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
        if (availableHeight >= pending.position.y || attempts >= 90) { window.scrollTo({ left: pending.position.x, top: pending.position.y, behavior: "instant" }); settled += 1; }
        if (settled >= 4 || attempts >= 100) { cancelRestore(); return; }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(tick); });
    };
    const sync = () => {
      if (!mobile()) { cancelRestore(); return; }
      ensureBrowseEntry(scope); bindReturn(scope);
      const handoff = pendingRestores.get(scope), entry = currentEntry(scope);
      activeEntry = entry;
      if (handoff && entry?.id === handoff.position.entry.id && Date.now() - handoff.requestedAt < 5_000) { pending = handoff; restore(); }
      else if (pending && entry?.id !== pending.position.entry.id) cancelRestore();
      if (departing && entry?.id !== departing) clearDeparture();
    };
    syncRef.current = sync;
    const onPop = () => {
      clearTimeout(saveTimer); clearDeparture(); cancelRestore();
      if (!mobile() || blocked()) return;
      const entry = currentEntry(scope);
      const sameBrowsingEntry = entry && entry.id === activeEntry?.id && entry.route === activeEntry.route;
      activeEntry = entry;
      // Consuming a menu/cart entry on this page must not rewind a later user scroll.
      if (sameBrowsingEntry) return;
      const position = entry && readPositions(scope)[entry.id];
      if (position && position.entry.route === entry.route) { pending = { position, requestedAt: Date.now() }; pendingRestores.set(scope, pending); restore(); }
    };
    const onScroll = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 100); };
    const onClick = (event: MouseEvent) => {
      if (!mobile() || blocked() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.hash) return;
      clearTimeout(saveTimer); clearDeparture(); save();
      const source = currentEntry(scope), target = `${destination.pathname}${destination.search}`;
      if (!source || !safeRoute(target, productRoute)) return;
      try { window.sessionStorage.setItem(`${scope}:return`, JSON.stringify({ scope, id: identifier(), source, productRoute: target, requestedAt: Date.now(), bound: false })); }
      catch { /* The destination remains usable without a return token. */ }
      departing = source.id; departureTimer = setTimeout(clearDeparture, 3_000);
    };
    const onInput = () => { clearDeparture(); cancelRestore(); };
    const onKey = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) onInput(); };
    const onPageHide = () => { clearTimeout(saveTimer); save(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onPop(); };
    const media = window.matchMedia("(max-width: 1024px)");
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("popstate", onPop);
    window.addEventListener("pagehide", onPageHide); window.addEventListener("pageshow", onPageShow);
    document.addEventListener("click", onClick, true); window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("wheel", onInput, { passive: true }); window.addEventListener("keydown", onKey); media.addEventListener("change", sync);
    sync();
    return () => {
      clearTimeout(saveTimer); clearDeparture(); window.cancelAnimationFrame(frame); syncRef.current = null;
      window.removeEventListener("scroll", onScroll); window.removeEventListener("popstate", onPop);
      window.removeEventListener("pagehide", onPageHide); window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("click", onClick, true); window.removeEventListener("touchstart", onInput);
      window.removeEventListener("wheel", onInput); window.removeEventListener("keydown", onKey); media.removeEventListener("change", sync);
    };
  }, [storefrontId]);
  useEffect(() => { syncRef.current?.(); }, [pathname, query]);
}
