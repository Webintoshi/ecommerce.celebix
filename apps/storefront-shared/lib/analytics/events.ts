import type { SafeUmamiTracker } from "./tracker-client.ts";

export type PublicCommerceEvent =
  | Readonly<{ name: "product_view"; data: Readonly<{ product: "catalog_item" }> }>
  | Readonly<{ name: "checkout_started"; data: Readonly<{ source: "quick_order" }> }>;

type EventBrowser = Readonly<{ location: Readonly<{ protocol: string; hostname: string; pathname: string }> }>;

export const PRODUCT_VIEW_EVENT: PublicCommerceEvent = Object.freeze({ name: "product_view", data: Object.freeze({ product: "catalog_item" }) });
export const CHECKOUT_STARTED_EVENT: PublicCommerceEvent = Object.freeze({ name: "checkout_started", data: Object.freeze({ source: "quick_order" }) });

function parseEvent(value: PublicCommerceEvent): PublicCommerceEvent {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "data,name" || !value.data || typeof value.data !== "object" || Array.isArray(value.data)) {
    throw new Error("storefront_analytics_event_invalid");
  }
  if (value.name === "product_view" && Object.keys(value.data).join(",") === "product" && value.data.product === "catalog_item") return PRODUCT_VIEW_EVENT;
  if (value.name === "checkout_started" && Object.keys(value.data).join(",") === "source" && value.data.source === "quick_order") return CHECKOUT_STARTED_EVENT;
  throw new Error("storefront_analytics_event_invalid");
}

export function trackCommerceEvent(tracker: SafeUmamiTracker, event: PublicCommerceEvent, selectedBrowser?: EventBrowser): void {
  const parsed = parseEvent(event);
  try {
    const browser = selectedBrowser ?? (globalThis.window as unknown as EventBrowser);
    if (!browser || browser.location.protocol !== "https:" || browser.location.hostname !== tracker.hostname) return;
    const selected = new URL(browser.location.pathname, `https://${tracker.hostname}`);
    if (selected.hostname !== tracker.hostname || selected.protocol !== "https:") return;
    tracker.track(Object.freeze({ website: tracker.websiteId, hostname: tracker.hostname, url: selected.pathname, name: parsed.name, data: parsed.data }));
  } catch {}
}
