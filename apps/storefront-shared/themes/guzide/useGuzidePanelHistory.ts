"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { guzideBrowserScope } from "./useGuzideBrowsingContinuity";

export type GuzidePanelCloseReason = "back" | "navigate";
type PanelEntry = Readonly<{ scope: string; owner: string; route: string }>;
const KEY = "__celebixGuzidePanel";
function currentRoute(): string { return `${window.location.pathname}${window.location.search}`; }
function currentOwner(): unknown { return window.history.state?.[KEY]?.owner; }
function removeMarker(entry: PanelEntry): void {
  if (currentOwner() !== entry.owner) return;
  try { const state = { ...window.history.state }; delete state[KEY]; window.history.replaceState(state, "", window.location.href); }
  catch { /* A route change still closes the layer if history is unavailable. */ }
}

/** Add only a visible layer's entry, consume it before route navigation, and retain all Next router state. */
export function useGuzidePanelHistory({ storefrontId, panel, onClose, onBackWithinPanel }: Readonly<{ storefrontId: string; panel: string; onClose(reason: GuzidePanelCloseReason): void; onBackWithinPanel?(): boolean }>) {
  const pathname = usePathname(), query = useSearchParams().toString();
  const entryRef = useRef<PanelEntry | null>(null);
  const waitingRef = useRef<{ promise: Promise<boolean>; resolve(sameRoute: boolean): void } | null>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const withinPanelRef = useRef(onBackWithinPanel); withinPanelRef.current = onBackWithinPanel;
  const ownsEntry = useCallback(() => {
    const entry = entryRef.current;
    return Boolean(entry && currentOwner() === entry.owner && entry.route === currentRoute());
  }, []);
  const open = useCallback(() => {
    const scope = guzideBrowserScope(storefrontId);
    if (!scope || !window.matchMedia("(max-width: 1024px)").matches || waitingRef.current) return false;
    if (ownsEntry()) return true;
    const entry = { scope, owner: `${scope}:${panel}:${Date.now()}:${Math.random().toString(36).slice(2)}`, route: currentRoute() };
    try { window.history.pushState({ ...window.history.state, [KEY]: entry }, "", window.location.href); entryRef.current = entry; return true; }
    catch { entryRef.current = null; return false; }
  }, [ownsEntry, panel, storefrontId]);
  const close = useCallback((): Promise<boolean> => {
    if (waitingRef.current) return waitingRef.current.promise;
    const entry = entryRef.current;
    if (!entry) return Promise.resolve(true);
    if (!ownsEntry()) { removeMarker(entry); entryRef.current = null; closeRef.current("navigate"); return Promise.resolve(currentRoute() === entry.route); }
    let resolve!: (sameRoute: boolean) => void;
    const promise = new Promise<boolean>(complete => { resolve = complete; });
    waitingRef.current = { promise, resolve };
    try { window.history.back(); }
    catch { removeMarker(entry); entryRef.current = null; waitingRef.current = null; closeRef.current("navigate"); resolve(false); }
    return promise;
  }, [ownsEntry]);
  useEffect(() => {
    const onPop = () => {
      const entry = entryRef.current;
      if (!entry || currentOwner() === entry.owner) return;
      if (!waitingRef.current && entry.route === currentRoute() && withinPanelRef.current?.()) {
        try {
          // One modal entry remains while Back changes its visible child pane.
          window.history.pushState({ ...window.history.state, [KEY]: entry }, "", window.location.href);
          return;
        } catch { /* If history is denied, close the layer rather than trapping Back. */ }
      }
      const waiting = waitingRef.current; waitingRef.current = null; entryRef.current = null;
      closeRef.current(waiting ? "navigate" : "back"); waiting?.resolve(currentRoute() === entry.route);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const entry = entryRef.current;
      if (entry) removeMarker(entry);
      entryRef.current = null; waitingRef.current?.resolve(false); waitingRef.current = null;
    };
  }, [storefrontId]);
  useEffect(() => {
    const entry = entryRef.current;
    if (!entry || entry.route === currentRoute()) return;
    removeMarker(entry); entryRef.current = null;
    const waiting = waitingRef.current; waitingRef.current = null; closeRef.current("navigate"); waiting?.resolve(false);
  }, [pathname, query]);
  return { open, close, ownsEntry };
}
