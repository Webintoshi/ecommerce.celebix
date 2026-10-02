"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";

import type { PublicCart, PublicStarterThemePresentationV2 } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import { SideCartDrawer } from "./SideCartDrawer";
import { useHydrated } from "./use-hydrated";
import type { StorefrontVisualTheme } from "../themes/visual-theme.ts";
import { ALPLER_STOREFRONT_ID } from "../themes/alpler/theme.ts";
import { useGuzidePanelHistory } from "../themes/guzide/useGuzidePanelHistory";
import { useSioraPanelHistory } from "../themes/siora/useSioraPanelHistory";

export type CartStatus = Readonly<{
  cart: PublicCart | null;
  loading: boolean;
  unavailable: boolean;
  drawerOpen: boolean;
  visualTheme?: StorefrontVisualTheme;
  showQuantitySelector?: boolean;
  refresh(): Promise<boolean>;
  registerDrawerGate?(gate: () => Promise<boolean> | null): () => void;
  replaceCart(cart: PublicCart): void;
  openDrawer(trigger?: HTMLElement | null): void;
  closeDrawer(event?: MouseEvent<HTMLElement>): void;
  closeDrawerAndWait(restoreFocus?: boolean): Promise<boolean>;
}>;

const Context = createContext<CartStatus | null>(null);
type DrawerHistory = Readonly<{ open(): boolean; close(): Promise<boolean>; navigate(href: string): void }>;

/** Mount history behavior only for Alpler; the other storefront drawers keep their current flow. */
function AlplerCartHistory({ bridge, onClose }: Readonly<{ bridge: RefObject<DrawerHistory | null>; onClose(restoreFocus: boolean): void }>) {
  const router = useRouter();
  const history = useSioraPanelHistory({ storefrontId: ALPLER_STOREFRONT_ID, panel: "cart", onClose: (reason) => onClose(reason === "back") });
  const controller = useMemo<DrawerHistory>(() => ({
    open: history.open,
    close: history.close,
    navigate(href) {
      const sourceRoute = `${window.location.pathname}${window.location.search}`;
      window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` === sourceRoute) router.push(href);
      }, 0);
    },
  }), [history.close, history.open, router]);
  useEffect(() => {
    bridge.current = controller;
    return () => { if (bridge.current === controller) bridge.current = null; };
  }, [bridge, controller]);
  return null;
}

function GuzideCartHistory({ storefrontId, bridge, onClose }: Readonly<{ storefrontId: string; bridge: RefObject<DrawerHistory | null>; onClose(restoreFocus: boolean): void }>) {
  const router = useRouter();
  const history = useGuzidePanelHistory({ storefrontId, panel: "cart", onClose: reason => onClose(reason === "back") });
  const controller = useMemo<DrawerHistory>(() => ({ open: history.open, close: history.close, navigate: href => router.push(href) }), [history.open, history.close, router]);
  useEffect(() => { bridge.current = controller; return () => { if (bridge.current === controller) bridge.current = null; }; }, [bridge, controller]);
  return null;
}

export function CartStatusProvider({ children, presentation, locale, visualTheme, storefrontId }: Readonly<{ storefrontId?: string; children: React.ReactNode; presentation?: PublicStarterThemePresentationV2["cart"]; locale: string; visualTheme?: StorefrontVisualTheme }>) {
  const hydrated = useHydrated();
  const [cart, setCart] = useState<PublicCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const drawerOpenRef = useRef(false);
  const drawerHistoryRef = useRef<DrawerHistory | null>(null);
  const pendingDrawerGateRef = useRef<Promise<boolean> | null>(null);
  const drawerGateRef = useRef<(() => Promise<boolean> | null) | null>(null);
  const registerDrawerGate = useCallback((gate: () => Promise<boolean> | null) => { drawerGateRef.current = gate; return () => { if (drawerGateRef.current === gate) drawerGateRef.current = null; }; }, []);
  const alpler = visualTheme === "alpler-deniz";
  const guzide = visualTheme === "guzide-deniz" && Boolean(storefrontId);
  const showQuantitySelector = presentation?.showQuantitySelector ?? true;
  const refreshGenerationRef = useRef(0);
  const cartEpochRef = useRef(0);
  const refresh = useCallback(async () => {
    const requestGeneration = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = requestGeneration;
    const requestEpoch = cartEpochRef.current;
    let recovered = false;
    setLoading(true);
    try {
      const resolved = await storefrontCartClient.resolve();
      if (requestGeneration === refreshGenerationRef.current && requestEpoch === cartEpochRef.current) {
        setCart(resolved);
        setUnavailable(false);
        recovered = true;
      }
    } catch {
      if (requestGeneration === refreshGenerationRef.current && requestEpoch === cartEpochRef.current) {
        setCart(null);
        setUnavailable(true);
      }
    } finally {
      if (requestGeneration === refreshGenerationRef.current) setLoading(false);
    }
    return recovered;
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const hideDrawer = useCallback((restoreFocus = true) => {
    drawerOpenRef.current = false;
    setDrawerOpen(false);
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (restoreFocus) window.requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  }, []);
  const openDrawer = useCallback((trigger?: HTMLElement | null) => {
    const show = () => {
      if (alpler && !drawerOpenRef.current && !drawerHistoryRef.current?.open()) return;
      if (guzide && !drawerOpenRef.current) drawerHistoryRef.current?.open();
      triggerRef.current = alpler || guzide
        ? trigger?.isConnected ? trigger : (document.activeElement instanceof HTMLElement ? document.activeElement : null)
        : trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      drawerOpenRef.current = true; setDrawerOpen(true);
    };
    if (guzide && pendingDrawerGateRef.current) return;
    const waiting = guzide && !drawerOpenRef.current ? drawerGateRef.current?.() : null;
    if (waiting) {
      pendingDrawerGateRef.current = waiting;
      void waiting.then(sameRoute => { if (sameRoute) show(); }).finally(() => { if (pendingDrawerGateRef.current === waiting) pendingDrawerGateRef.current = null; });
    }
    else show();
  }, [alpler, guzide]);
  const closeDrawerAndWait = useCallback((restoreFocus = true): Promise<boolean> => {
    hideDrawer(restoreFocus);
    if (!alpler && !guzide) return Promise.resolve(true);
    const sourceRoute = `${window.location.pathname}${window.location.search}`;
    return (drawerHistoryRef.current?.close() ?? Promise.resolve(true)).then((sameRoute) => new Promise<boolean>((resolve) => {
      // Finish Next's popstate work before another overlay entry or route is opened.
      window.setTimeout(() => resolve(sameRoute && `${window.location.pathname}${window.location.search}` === sourceRoute), 0);
    }));
  }, [alpler, guzide, hideDrawer]);
  const closeDrawer = useCallback((event?: MouseEvent<HTMLElement>) => {
    const link = event?.currentTarget instanceof HTMLAnchorElement ? event.currentTarget : null;
    if ((alpler || guzide) && event && link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && link.target !== "_blank" && !link.hasAttribute("download")) {
      const href = link.getAttribute("href");
      if (href && (!guzide || (href.startsWith("/") && !href.startsWith("//")))) {
        event.preventDefault();
        void closeDrawerAndWait(false).then((sameRoute) => { if (sameRoute) drawerHistoryRef.current?.navigate(href); });
        return;
      }
    }
    void closeDrawerAndWait();
  }, [alpler, guzide, closeDrawerAndWait]);
  const replaceCart = useCallback((nextCart: PublicCart) => {
    cartEpochRef.current += 1;
    setCart(nextCart);
    setUnavailable(false);
    setLoading(false);
  }, []);
  const value = useMemo<CartStatus>(() => Object.freeze({ cart, loading, unavailable, drawerOpen, visualTheme, showQuantitySelector, refresh, registerDrawerGate: guzide ? registerDrawerGate : undefined, replaceCart, openDrawer, closeDrawer, closeDrawerAndWait }), [cart, loading, unavailable, drawerOpen, visualTheme, showQuantitySelector, refresh, guzide, registerDrawerGate, replaceCart, openDrawer, closeDrawer, closeDrawerAndWait]);
  return <Context.Provider value={value}>{alpler ? <AlplerCartHistory bridge={drawerHistoryRef} onClose={hideDrawer} /> : guzide ? <Suspense fallback={null}><GuzideCartHistory storefrontId={storefrontId!} bridge={drawerHistoryRef} onClose={hideDrawer} /></Suspense> : null}{children}<SideCartDrawer presentation={presentation} locale={locale} visualTheme={visualTheme} /><span className="sr-only" aria-live="polite">{!hydrated || loading ? "Sepet yükleniyor" : unavailable ? "Sepet kullanılamıyor" : `${cart?.itemCount ?? 0} ürün sepette`}</span></Context.Provider>;
}

export function useCartStatus(): CartStatus {
  const selected = useContext(Context);
  if (!selected) throw new Error("cart_status_provider_required");
  return selected;
}
