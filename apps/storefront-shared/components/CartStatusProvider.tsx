"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { PublicCart } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import { SideCartDrawer } from "./SideCartDrawer";

type ReplaceCartOptions = Readonly<{ openDrawer?: boolean; trigger?: HTMLElement | null }>;

export type CartStatus = Readonly<{
  cart: PublicCart | null;
  loading: boolean;
  unavailable: boolean;
  drawerOpen: boolean;
  refresh(): Promise<boolean>;
  replaceCart(cart: PublicCart, options?: ReplaceCartOptions): void;
  openDrawer(trigger?: HTMLElement | null): void;
  closeDrawer(): void;
}>;

const Context = createContext<CartStatus | null>(null);

export function CartStatusProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cart, setCart] = useState<PublicCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
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
  const openDrawer = useCallback((trigger?: HTMLElement | null) => { triggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    const trigger = triggerRef.current;
    triggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  }, []);
  const replaceCart = useCallback((nextCart: PublicCart, options?: ReplaceCartOptions) => {
    cartEpochRef.current += 1;
    setCart(nextCart);
    setUnavailable(false);
    setLoading(false);
    if (options?.openDrawer) openDrawer(options.trigger);
  }, [openDrawer]);
  const value = useMemo<CartStatus>(() => Object.freeze({ cart, loading, unavailable, drawerOpen, refresh, replaceCart, openDrawer, closeDrawer }), [cart, loading, unavailable, drawerOpen, refresh, replaceCart, openDrawer, closeDrawer]);
  return <Context.Provider value={value}>{children}<SideCartDrawer /><span className="sr-only" aria-live="polite">{loading ? "Sepet yükleniyor" : unavailable ? "Sepet kullanılamıyor" : `${cart?.itemCount ?? 0} ürün sepette`}</span></Context.Provider>;
}

export function useCartStatus(): CartStatus {
  const selected = useContext(Context);
  if (!selected) throw new Error("cart_status_provider_required");
  return selected;
}
