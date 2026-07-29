"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createBuyNowController,
  type BuyNowController,
  type BuyNowState,
} from "@/lib/buy-now.ts";

type BuyNowContextValue = Readonly<{
  controller: BuyNowController;
  state: BuyNowState;
}>;

const BuyNowContext = createContext<BuyNowContextValue | null>(null);
const IDLE_STATE = Object.freeze({ kind: "idle" } as const);

export function BuyNowProvider({ productId, children }: Readonly<{
  productId: string;
  children: ReactNode;
}>) {
  const [state, setState] = useState<BuyNowState>(IDLE_STATE);
  const controllerRef = useRef<BuyNowController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createBuyNowController({
      productId,
      navigate: (pathname) => window.location.assign(pathname),
      onStateChange: setState,
      setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimer: (timer) => window.clearTimeout(Number(timer)),
    });
  }
  const controller = controllerRef.current;
  useEffect(() => () => controller.dispose(), [controller]);
  const value = useMemo(() => Object.freeze({ controller, state }), [controller, state]);
  return <BuyNowContext.Provider value={value}>{children}</BuyNowContext.Provider>;
}

export function BuyNowButton({ variantId, available }: Readonly<{
  variantId: string;
  available: boolean;
}>) {
  const context = useContext(BuyNowContext);
  if (context === null) return null;
  const pending = context.state.kind === "pending";
  const selectedPending = pending && context.state.variantId === variantId;
  const selectedFailed = context.state.kind === "failed" && context.state.variantId === variantId;

  return <div className="variant-buy">
    <button
      type="button"
      className="store-button"
      disabled={!available || pending}
      onClick={() => { void context.controller.buy({ variantId, available }); }}
    >
      {selectedPending ? "Sepet hazırlanıyor…" : available ? "Satın al" : "Tükendi"}
    </button>
    {selectedFailed ? <p role="alert">Sepet hazırlanamadı. Lütfen yeniden deneyin.</p> : null}
  </div>;
}
