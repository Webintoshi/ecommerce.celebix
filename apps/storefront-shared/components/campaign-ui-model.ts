import type { PublicStarterThemePresentation, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";

export function campaignAnnouncement(presentation: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3): Readonly<{ text: string; destination?: string }> | null {
  const announcement = presentation.announcement;
  if (!announcement) return null;
  return Object.freeze({ text: announcement.items.join(" · "), ...(announcement.destination ? { destination: announcement.destination } : {}) });
}

export function campaignFrameSettings(presentation: PublicStarterThemePresentation): Readonly<{
  campaignClass: string;
  cornerClass: string;
  cart?: PublicStarterThemePresentationV2["cart"] | PublicStarterThemePresentationV3["cart"];
}> {
  if (presentation.schemaVersion !== 2 && presentation.schemaVersion !== 3) return Object.freeze({ campaignClass: "", cornerClass: "", cart: undefined });
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
