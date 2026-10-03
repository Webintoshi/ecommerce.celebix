import type { PublicStarterThemePresentation, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3, PublicStarterThemePresentationV4 } from "@celebix/saas-contracts";

export function campaignAnnouncement(presentation: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4): Readonly<{ text: string; destination?: string }> | null {
  const announcement = presentation.announcement;
  if (!announcement) return null;
  return Object.freeze({ text: announcement.items.join(" · "), ...(announcement.destination ? { destination: announcement.destination } : {}) });
}

export function campaignFrameSettings(presentation: PublicStarterThemePresentation): Readonly<{
  campaignClass: string;
  cornerClass: string;
  cart?: PublicStarterThemePresentationV2["cart"] | PublicStarterThemePresentationV3["cart"];
}> {
  if (presentation.schemaVersion !== 2 && presentation.schemaVersion !== 3 && presentation.schemaVersion !== 4) return Object.freeze({ campaignClass: "", cornerClass: "", cart: undefined });
  return Object.freeze({ campaignClass: "campaign-storefront", cornerClass: `corners-${presentation.visual.cornerStyle}`, cart: presentation.cart });
}

export function sideCartPresentation(presentation?: PublicStarterThemePresentationV2["cart"]): Readonly<{
  showCheckoutReadiness: boolean;
  showQuantitySelector: boolean;
  trustMessage: string | undefined;
}> {
  return Object.freeze({
    showCheckoutReadiness: presentation?.showCheckoutReadiness ?? true,
    showQuantitySelector: presentation?.showQuantitySelector ?? true,
    trustMessage: presentation?.trustMessage,
  });
}

/** The published design owns the policy; the current server cart proves it can ship. */
export function freeShippingProgress(presentation: Readonly<{ showShippingProgress?: boolean; freeShippingThresholdCents?: number }> | undefined, cart: Readonly<{ currency: string; subtotalCents: number; shippingCents: number; itemCount: number; checkoutBlocker: string | null }> | null): Readonly<{ remainingCents: number; percent: number; achieved: boolean }> | null {
  const threshold = presentation?.freeShippingThresholdCents;
  if (!presentation?.showShippingProgress || !Number.isSafeInteger(threshold) || threshold! < 1 || threshold! > 100_000_000 || !cart || cart.currency !== "TRY" || cart.itemCount < 1 || !Number.isSafeInteger(cart.subtotalCents) || cart.subtotalCents < 0 || cart.checkoutBlocker === "shipping_unavailable" || cart.checkoutBlocker === "stock_unavailable" || cart.checkoutBlocker === "empty_cart") return null;
  const achieved = cart.subtotalCents >= threshold!;
  // A free base tariff needs no progress bar. A stale design/cart pair must not promise a waived fee.
  if ((!achieved && cart.shippingCents === 0) || (achieved && cart.shippingCents !== 0)) return null;
  return Object.freeze({ remainingCents: Math.max(0, threshold! - cart.subtotalCents), percent: Math.min(100, Math.floor(cart.subtotalCents * 100 / threshold!)), achieved });
}
