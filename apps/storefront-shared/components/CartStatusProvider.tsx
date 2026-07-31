"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { PublicCart } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";

type CartStatus = Readonly<{
  cart: PublicCart | null;
  loading: boolean;
  refresh(): Promise<void>;
  replaceCart(cart: PublicCart): void;
}>;

const Context = createContext<CartStatus | null>(null);

export function CartStatusProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cart, setCart] = useState<PublicCart | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setCart(await storefrontCartClient.resolve()); }
    catch { setCart(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo<CartStatus>(() => Object.freeze({ cart, loading, refresh, replaceCart: setCart }), [cart, loading, refresh]);
  return <Context.Provider value={value}>{children}<span className="sr-only" aria-live="polite">{loading ? "Sepet yükleniyor" : `${cart?.itemCount ?? 0} ürün sepette`}</span></Context.Provider>;
}

export function useCartStatus(): CartStatus {
  const selected = useContext(Context);
  if (!selected) throw new Error("cart_status_provider_required");
  return selected;
}
