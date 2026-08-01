"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { PublicCart } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import { SideCartDrawer } from "./SideCartDrawer";

type ReplaceCartOptions = Readonly<{ openDrawer?: boolean; trigger?: HTMLElement | null }>;

export type CartStatus = Readonly<{
  cart: PublicCart | null;
  loading: boolean;
  drawerOpen: boolean;
  refresh(): Promise<void>;
  replaceCart(cart: PublicCart, options?: ReplaceCartOptions): void;
  openDrawer(trigger?: HTMLElement | null): void;
  closeDrawer(): void;
}>;

const Context = createContext<CartStatus | null>(null);

export function CartStatusProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cart, setCart] = useState<PublicCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setCart(await storefrontCartClient.resolve()); }
    catch { setCart(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const openDrawer = useCallback((trigger?: HTMLElement | null) => { triggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    const trigger = triggerRef.current;
    triggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  }, []);
  const replaceCart = useCallback((nextCart: PublicCart, options?: ReplaceCartOptions) => { setCart(nextCart); if (options?.openDrawer) openDrawer(options.trigger); }, [openDrawer]);
  const value = useMemo<CartStatus>(() => Object.freeze({ cart, loading, drawerOpen, refresh, replaceCart, openDrawer, closeDrawer }), [cart, loading, drawerOpen, refresh, replaceCart, openDrawer, closeDrawer]);
  return <Context.Provider value={value}>{children}<SideCartDrawer /><span className="sr-only" aria-live="polite">{loading ? "Sepet yükleniyor" : `${cart?.itemCount ?? 0} ürün sepette`}</span></Context.Provider>;
}

export function useCartStatus(): CartStatus {
  const selected = useContext(Context);
  if (!selected) throw new Error("cart_status_provider_required");
  return selected;
}
