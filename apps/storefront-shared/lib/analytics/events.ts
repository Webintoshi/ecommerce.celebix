import {
  parseBrowserCommerceEvent,
  parsePublicCheckoutQuoteV2,
  type BrowserCommerceEventName,
  type PublicProduct,
} from "@celebix/saas-contracts";
import type { SafeUmamiTracker } from "./tracker-client.ts";
import {
  readAnonymousCommerceSessionRef,
  readCurrentCommerceTouch,
} from "./attribution.ts";

type Data = Readonly<{
  anonymousSessionRef?: string;
  productId?: string;
  variantId?: string;
  categoryId?: string;
  quantity?: number;
  currency?: string;
  valueMinor?: number;
  paymentMethod?: string;
  shippingMethod?: string;
  campaign?: string;
  source?: string;
  medium?: string;
  safeErrorCode?: string;
}>;
export type PublicCommerceEvent = Readonly<{
  name: BrowserCommerceEventName;
  data: Data;
}>;
type EventBrowser = Readonly<{
  location: Readonly<{
    protocol: string;
    hostname: string;
    pathname: string;
    href?: string;
  }>;
  document?: Readonly<{ referrer: string }>;
  sessionStorage?: Readonly<{
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  }>;
  crypto?: Pick<Crypto, "getRandomValues">;
  now?: () => Date;
  dispatchEvent?: (event: Event) => boolean;
}>;
export const STOREFRONT_COMMERCE_EVENT = "celebix:commerce-event";
export const PRODUCT_VIEW_EVENT: PublicCommerceEvent = Object.freeze({
  name: "product_view",
  data: Object.freeze({}),
});
export const CHECKOUT_STARTED_EVENT: PublicCommerceEvent = Object.freeze({
  name: "begin_checkout",
  data: Object.freeze({ source: "quick_order" }),
});
export function couponAppliedEvent(
  quote: unknown,
  normalizedCode: string,
): PublicCommerceEvent | null {
  try {
    const parsed = parsePublicCheckoutQuoteV2(quote);
    if (
      !parsed.appliedPromotions.some(
        (promotion) => promotion.normalizedCode === normalizedCode,
      )
    )
      return null;
    return Object.freeze({
      name: "coupon_applied",
      data: Object.freeze({}),
    });
  } catch {
    return null;
  }
}
export function productViewEvent(
  productId: string,
  variantId?: string,
  categoryId?: string,
  currency?: PublicProduct["currency"],
  valueMinor?: number,
): PublicCommerceEvent {
  return Object.freeze({
    name: "product_view",
    data: Object.freeze({
      productId,
      ...(variantId ? { variantId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(currency ? { currency } : {}),
      ...(valueMinor !== undefined ? { valueMinor } : {}),
    }),
  });
}

function parseEvent(
  value: PublicCommerceEvent,
  occurredAt: string,
): PublicCommerceEvent {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "data,name" ||
      !value.data ||
      typeof value.data !== "object" ||
      Array.isArray(value.data)
    )
      throw Error();
    const parsed = parseBrowserCommerceEvent({
      schemaVersion: 1,
      eventName: value.name,
      occurredAt,
      ...value.data,
    });
    const { schemaVersion: _schema, eventName, ...rest } = parsed;
    const { occurredAt: _occurred, ...data } = rest;
    return Object.freeze({ name: eventName, data: Object.freeze(data) });
  } catch {
    throw new Error("storefront_analytics_event_invalid");
  }
}
function now(browser: EventBrowser) {
  try {
    const selected = browser.now?.() ?? new Date();
    if (!(selected instanceof Date) || !Number.isFinite(selected.getTime()))
      throw Error();
    return selected.toISOString();
  } catch {
    throw new Error("storefront_analytics_event_invalid");
  }
}
function providerData(event: PublicCommerceEvent, occurredAt: string) {
  const output: Record<string, unknown> = {
    schema_version: 1,
    occurred_at: occurredAt,
  };
  const mapping = {
    anonymousSessionRef: "anonymous_session_ref",
    productId: "product_id",
    variantId: "variant_id",
    categoryId: "category_id",
    quantity: "quantity",
    currency: "currency",
    valueMinor: "value_minor",
    paymentMethod: "payment_method",
    shippingMethod: "shipping_method",
    campaign: "campaign",
    source: "source",
    medium: "medium",
    safeErrorCode: "safe_error_code",
  } as const;
  for (const [key, target] of Object.entries(mapping) as Array<
    [keyof Data, string]
  >)
    if (event.data[key] !== undefined) output[target] = event.data[key];
  return Object.freeze(output);
}

export function trackCommerceEvent(
  tracker: SafeUmamiTracker,
  event: PublicCommerceEvent,
  selectedBrowser?: EventBrowser,
): void {
  const browser =
      selectedBrowser ?? (globalThis.window as unknown as EventBrowser),
    occurredAt = now(browser),
    parsed = parseEvent(event, occurredAt);
  try {
    if (
      !browser ||
      browser.location.protocol !== "https:" ||
      browser.location.hostname !== tracker.hostname
    )
      return;
    const selected = new URL(
      browser.location.pathname,
      `https://${tracker.hostname}`,
    );
    selected.search = "";
    selected.hash = "";
    if (
      selected.hostname !== tracker.hostname ||
      selected.protocol !== "https:"
    )
      return;
    let touch: Readonly<{
      source: string;
      medium: string;
      campaign?: string;
    }> | null = null;
    if (browser.location.href && browser.document)
      touch = readCurrentCommerceTouch({
        location: new URL(browser.location.href),
        document: browser.document,
      });
    if (touch) {
      selected.searchParams.set("utm_source", touch.source);
      selected.searchParams.set("utm_medium", touch.medium);
      if (touch.campaign)
        selected.searchParams.set("utm_campaign", touch.campaign);
    }
    const anonymousSessionRef = browser.sessionStorage
      ? readAnonymousCommerceSessionRef(
          browser as Required<Pick<EventBrowser, "sessionStorage">> &
            Pick<EventBrowser, "crypto">,
        )
      : undefined;
    const enriched: PublicCommerceEvent = Object.freeze({
      name: parsed.name,
      data: Object.freeze({
        ...parsed.data,
        ...(touch
          ? {
              source: parsed.data.source ?? touch.source,
              medium: parsed.data.medium ?? touch.medium,
              ...(parsed.data.campaign || !touch.campaign
                ? {}
                : { campaign: touch.campaign }),
            }
          : {}),
        ...(anonymousSessionRef ? { anonymousSessionRef } : {}),
      }),
    });
    tracker.track(
      Object.freeze({
        website: tracker.websiteId,
        hostname: tracker.hostname,
        url: `${selected.pathname}${selected.search}`,
        name: enriched.name,
        data: providerData(enriched, occurredAt),
      }),
    );
  } catch {}
}

export function emitStorefrontCommerceEvent(
  event: PublicCommerceEvent,
  selectedBrowser?: Pick<EventBrowser, "dispatchEvent">,
): void {
  try {
    const browser =
        selectedBrowser ?? (globalThis.window as unknown as EventBrowser),
      parsed = parseEvent(event, new Date().toISOString());
    browser.dispatchEvent?.(
      new CustomEvent(STOREFRONT_COMMERCE_EVENT, { detail: parsed }),
    );
  } catch {}
}
