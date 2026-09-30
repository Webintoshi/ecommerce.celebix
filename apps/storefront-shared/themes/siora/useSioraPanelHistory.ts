"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type OwnedPanelEntry = Readonly<{ owner: string; route: string }>;
export type SioraPanelCloseReason = "back" | "dismiss" | "route";
const HISTORY_KEY = "__celebixSioraPanel";

function currentRoute(): string { return `${window.location.pathname}${window.location.search}`; }
function currentOwner(): unknown { return window.history.state?.[HISTORY_KEY]?.owner; }
function removeOwnedMarker(owner: string): void {
  if (currentOwner() !== owner) return;
  const state = { ...window.history.state };
  delete state[HISTORY_KEY];
  window.history.replaceState(state, "", window.location.href);
}

/** Consume a panel's own history entry before navigating to the next public route. */
export function useSioraPanelHistory({ storefrontId, panel, onClose }: Readonly<{ storefrontId: string; panel: string; onClose(reason: SioraPanelCloseReason): void }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const entryRef = useRef<OwnedPanelEntry | null>(null);
  const waitingRef = useRef<{ promise: Promise<boolean>; resolve(sameRoute: boolean): void } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const ownsEntry = useCallback(() => {
    const entry = entryRef.current;
    return Boolean(entry && currentOwner() === entry.owner && currentRoute() === entry.route);
  }, []);

  const open = useCallback((): boolean => {
    if (waitingRef.current) return false;
    if (ownsEntry()) return true;
    const entry = { owner: `siora:${storefrontId}:${panel}:${Date.now()}:${Math.random().toString(36).slice(2)}`, route: currentRoute() };
    try {
      // Copy all Next state, including its router tree, without patching router methods.
      window.history.pushState({ ...window.history.state, [HISTORY_KEY]: entry }, "", window.location.href);
      entryRef.current = entry;
    } catch { entryRef.current = null; }
    return true;
  }, [ownsEntry, panel, storefrontId]);

  const close = useCallback((): Promise<boolean> => {
    if (waitingRef.current) return waitingRef.current.promise;
    const entry = entryRef.current;
    if (!entry) return Promise.resolve(true);
    if (!ownsEntry()) {
      removeOwnedMarker(entry.owner);
      entryRef.current = null;
      onCloseRef.current("route");
      return Promise.resolve(currentRoute() === entry.route);
    }
    let resolve!: (sameRoute: boolean) => void;
    const promise = new Promise<boolean>((complete) => { resolve = complete; });
    waitingRef.current = { promise, resolve };
    window.history.back();
    return promise;
  }, [ownsEntry]);

  useEffect(() => {
    const onPop = () => {
      const entry = entryRef.current;
      if (!entry || currentOwner() === entry.owner) return;
      const waiting = waitingRef.current;
      waitingRef.current = null;
      entryRef.current = null;
      onCloseRef.current(waiting ? "dismiss" : "back");
      waiting?.resolve(currentRoute() === entry.route);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const entry = entryRef.current;
      const consumedOnSameRoute = Boolean(entry && currentOwner() !== entry.owner && currentRoute() === entry.route);
      if (entry) removeOwnedMarker(entry.owner);
      entryRef.current = null;
      waitingRef.current?.resolve(consumedOnSameRoute);
      waitingRef.current = null;
    };
  }, []);

  useEffect(() => {
    const entry = entryRef.current;
    if (!entry || entry.route === currentRoute()) return;
    removeOwnedMarker(entry.owner);
    entryRef.current = null;
    const waiting = waitingRef.current;
    waitingRef.current = null;
    onCloseRef.current("route");
    waiting?.resolve(false);
  }, [pathname, query]);

  return { open, close, ownsEntry };
}
