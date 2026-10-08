import { parseBrowserCommerceEvent } from "@celebix/saas-contracts";
import { parsePublicGoogleMarketingProjection, type PublicGoogleMarketingProjection } from "../../../packages/saas-contracts/src/google-marketing/index.ts";
import type { PublicCommerceEvent } from "./analytics/events.ts";

export type GoogleConsent = "undecided" | "denied" | "granted";
export type GoogleConfirmedPurchase = Readonly<{ transactionId: string; valueCents: number; currency: string }>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Script = Pick<HTMLScriptElement, "src" | "nonce" | "async" | "onload" | "onerror" | "remove">;
type Browser = { location: Pick<Location, "protocol" | "hostname">; localStorage?: Storage; dataLayer?: unknown[];
  document: { cookie: string; createElement(tag: "script"): Script; head: { appendChild(script: Script): unknown } } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EMPTY = Object.freeze({ gtmContainerId: null, ads: null, verificationToken: null });
const DEFAULTS = Object.freeze({ ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
export function parseGoogleConfirmedPurchase(value: unknown): GoogleConfirmedPurchase | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== 3 || ["transactionId", "valueCents", "currency"].some((key) => !descriptors[key] || !("value" in descriptors[key]!))) return null;
  const transactionId = descriptors.transactionId!.value, valueCents = descriptors.valueCents!.value, currency = descriptors.currency!.value;
  if (typeof transactionId !== "string" || !UUID.test(transactionId) || !Number.isSafeInteger(valueCents) || valueCents <= 0 || typeof currency !== "string" || !/^[A-Z]{3}$/u.test(currency)) return null;
  return Object.freeze({ transactionId, valueCents, currency });
}
function safeProjection(value: unknown): PublicGoogleMarketingProjection { try { return parsePublicGoogleMarketingProjection(value); } catch { return EMPTY; } }
export function hasGoogleMarketingTags(value: unknown): boolean { const parsed = safeProjection(value); return parsed.gtmContainerId !== null || parsed.ads !== null; }

/** Finite destinations for the approved native Google tags. Preview and custom tags are excluded. */
export function googleMarketingCspSources(value: unknown) {
  const parsed = safeProjection(value);
  if (!hasGoogleMarketingTags(parsed)) return { script: [], connect: [], image: [], frame: [] };
  const ads = ["https://www.googleadservices.com", "https://googleads.g.doubleclick.net", "https://pagead2.googlesyndication.com", "https://www.google.com", "https://www.google.com.tr"];
  const analytics = parsed.gtmContainerId ? ["https://www.google-analytics.com", "https://region1.google-analytics.com"] : [];
  return { script: ["https://www.googletagmanager.com", "https://www.googleadservices.com", "https://www.google.com"],
    connect: ["https://www.googletagmanager.com", ...analytics, ...ads, "https://ad.doubleclick.net"],
    image: ["https://www.googletagmanager.com", ...analytics, ...ads], frame: ["https://www.googletagmanager.com"] };
}
export type GoogleMarketingClient = Readonly<{ consent(): GoogleConsent; setConsent(value: "granted" | "denied"): void;
  commerce(value: PublicCommerceEvent): boolean; purchase(value: unknown): boolean; onReady(callback: () => void): () => void;
  hasStarted(): boolean; dispose(): void }>;

export function createGoogleMarketingClient(input: Readonly<{ storeId: string; hostname: string; nonce: string; projection: unknown; browser: Browser }>): GoogleMarketingClient {
  const projection = safeProjection(input.projection), browser = input.browser;
  const safe = UUID.test(input.storeId) && browser.location.protocol === "https:" && browser.location.hostname === input.hostname && /^[A-Za-z0-9+/=_-]{16,128}$/u.test(input.nonce);
  const consentKey = `celebix:google-consent:v1:${input.storeId}:${input.hostname}`;
  const purchaseKey = `celebix:google-purchases:v1:${input.storeId}:${projection.gtmContainerId ?? projection.ads?.tagId ?? "disabled"}:${projection.ads?.conversionLabel ?? ""}`;
  let consent: GoogleConsent = "undecided", script: Script | null = null, ready = false, started = false, disposed = false;
  const seen = new Set<string>(), listeners = new Set<() => void>(), pendingCommerce: unknown[] = [];
  if (!Array.isArray(browser.dataLayer)) browser.dataLayer = [];
  const layer = browser.dataLayer;
  function command(..._args: unknown[]) { layer.push(arguments); }
  if (safe && hasGoogleMarketingTags(projection)) {
    command("consent", "default", DEFAULTS);
    layer.push({ "gtm.allowlist": ["google", "googtag"], "gtm.blocklist": ["customScripts", "customPixels", "nonGoogleScripts", "nonGooglePixels", "nonGoogleIframes", "sandboxedScripts"] });
  }
  function load() {
    if (disposed || !safe || !hasGoogleMarketingTags(projection) || script || consent !== "granted") return;
    script = browser.document.createElement("script"); script.async = true; script.nonce = input.nonce;
    if (projection.gtmContainerId) {
      layer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      script.src = `https://www.googletagmanager.com/gtm.js?id=${projection.gtmContainerId}`;
    } else if (projection.ads) {
      command("js", new Date()); command("config", projection.ads.tagId, { allow_enhanced_conversions: false });
      script.src = `https://www.googletagmanager.com/gtag/js?id=${projection.ads.tagId}`;
    }
    script.onload = () => { if (disposed || consent !== "granted") return; ready = true; layer.push(...pendingCommerce.splice(0)); for (const listener of listeners) listener(); };
    script.onerror = () => { if (disposed) return; ready = false; script?.remove(); script = null; };
    started = true;
    browser.document.head.appendChild(script);
  }
  function setConsent(value: "granted" | "denied") {
    if (disposed || !safe || value !== "granted" && value !== "denied") return;
    consent = value;
    try { browser.localStorage?.setItem(consentKey, JSON.stringify({ version: 1, value, expires: Date.now() + 180 * 86_400_000 })); } catch { /* choice remains effective in this page */ }
    if (hasGoogleMarketingTags(projection)) command("consent", "update", value === "granted" ? { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" } : DEFAULTS);
    if (value === "granted") load();
    else { ready = false; pendingCommerce.length = 0; script?.remove(); script = null;
      for (const cookie of browser.document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        if (name && /^_(?:ga(?:_[A-Za-z0-9]+)?|gcl_[A-Za-z0-9]+)$/u.test(name)) {
          browser.document.cookie = `${name}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
          browser.document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${input.hostname}; Secure; SameSite=Lax`;
        }
      }
    }
  }
  try { const stored = JSON.parse(browser.localStorage?.getItem(consentKey) ?? "null"); if (stored?.version === 1 && Number.isFinite(stored.expires) && stored.expires > Date.now() && ["granted", "denied"].includes(stored.value)) setConsent(stored.value); } catch { /* missing or corrupt consent means no permission */ }
  return Object.freeze({ consent: () => consent, setConsent,
    hasStarted: () => started,
    dispose() {
      if (disposed) return;
      disposed = true; ready = false; listeners.clear(); pendingCommerce.length = 0;
      if (script) { script.onload = null; script.onerror = null; script.remove(); script = null; }
      // Stop measurement in this document without changing the visitor's saved choice.
      if (started) command("consent", "update", DEFAULTS);
    },
    onReady(callback: () => void) { if (disposed) return () => {}; listeners.add(callback); if (ready && consent === "granted") callback(); return () => { listeners.delete(callback); }; },
    commerce(value: PublicCommerceEvent) {
      if (disposed || !safe || consent !== "granted" || !projection.gtmContainerId) return false;
      try {
        if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "data,name") return false;
        const event = parseBrowserCommerceEvent({ ...value.data, schemaVersion: 1, eventName: value.name, occurredAt: new Date().toISOString() });
        const eventName = ({ product_view: "view_item", add_to_cart: "add_to_cart", begin_checkout: "begin_checkout" } as Record<string, string>)[event.eventName];
        if (!eventName) return false;
        const price = event.valueMinor !== undefined ? event.valueMinor / 100 : undefined;
        const approved = { event: eventName, ...(event.currency ? { currency: event.currency } : {}), ...(price !== undefined ? { value: price } : {}),
          ...(event.productId ? { items: [{ item_id: event.productId, ...(event.variantId ? { item_variant: event.variantId } : {}), ...(event.quantity ? { quantity: event.quantity } : {}), ...(price !== undefined ? { price } : {}) }] } : {}) };
        if (ready) layer.push(approved);
        else { if (pendingCommerce.length === 50) pendingCommerce.shift(); pendingCommerce.push(approved); }
        return true;
      } catch { return false; }
    },
    purchase(value: unknown) {
      if (disposed || !safe || consent !== "granted" || !ready) return false;
      const purchase = parseGoogleConfirmedPurchase(value); if (!purchase) return false;
      try { const stored = JSON.parse(browser.localStorage?.getItem(purchaseKey) ?? "[]"); if (Array.isArray(stored) && stored.length <= 100 && stored.every((id) => typeof id === "string" && UUID.test(id))) for (const id of stored) seen.add(id); } catch { /* transaction_id still gives provider dedup when storage is unavailable */ }
      if (seen.has(purchase.transactionId)) return false;
      const data = { transaction_id: purchase.transactionId, value: purchase.valueCents / 100, currency: purchase.currency };
      if (projection.gtmContainerId) {
        layer.push({ event: "purchase", ...data });
        if (projection.ads) layer.push({ event: "celebix_paid_web_purchase", google_ads_destination: `${projection.ads.tagId}/${projection.ads.conversionLabel}`, ...data });
      }
      else if (projection.ads) command("event", "conversion", { send_to: `${projection.ads.tagId}/${projection.ads.conversionLabel}`, ...data });
      else return false;
      seen.add(purchase.transactionId); try { browser.localStorage?.setItem(purchaseKey, JSON.stringify([...seen].slice(-100))); } catch {}
      return true;
    },
  });
}
