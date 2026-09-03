import { readCurrentCommerceTouch } from "./attribution.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type Browser = Readonly<{
  location: Readonly<{ protocol: string; hostname: string; pathname: string; href?: string }>;
  document: Readonly<{ title: string; referrer: string }>;
  umami?: Readonly<{ track(payload: Readonly<Record<string, unknown>>): void }>;
}>;

export interface SafeUmamiTracker {
  readonly websiteId: string;
  readonly hostname: string;
  track(payload: Readonly<Record<string, unknown>>): void;
}

const trackerBrowsers = new WeakMap<SafeUmamiTracker, Browser>();

export function createSafeUmamiTracker(input: { websiteId: string; hostname: string; browser?: Browser }): SafeUmamiTracker {
  if (!UUID.test(input?.websiteId) || !HOST.test(input?.hostname)) throw new Error("storefront_analytics_invalid");
  const browser = input.browser ?? (globalThis.window as unknown as Browser);
  const tracker = Object.freeze<SafeUmamiTracker>({
    websiteId: input.websiteId,
    hostname: input.hostname,
    track(payload) {
      try {
        browser.umami?.track(Object.freeze({ ...payload }));
      } catch {}
    },
  });
  trackerBrowsers.set(tracker, browser);
  return tracker;
}

export function trackPageview(tracker: SafeUmamiTracker, selectedBrowser?: Browser): void {
  try {
    const browser = selectedBrowser ?? trackerBrowsers.get(tracker) ?? (globalThis.window as unknown as Browser);
    if (!browser || browser.location.protocol !== "https:" || browser.location.hostname !== tracker.hostname) return;
    const title = browser.document.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200) || "Storefront";
    let referrer = "direct";
    if (browser.document.referrer) {
      const selected = new URL(browser.document.referrer);
      if (selected.protocol === "https:" && !selected.username && !selected.password && !selected.port) referrer = selected.origin;
    }
    const touch = readCurrentCommerceTouch({ location: new URL(browser.location.href??`https://${browser.location.hostname}${browser.location.pathname}`), document: browser.document });
    const query = new URLSearchParams({ utm_source: touch.source, utm_medium: touch.medium });
    if (touch.campaign) query.set("utm_campaign", touch.campaign);
    tracker.track(Object.freeze({ website: tracker.websiteId, hostname: tracker.hostname, url: `${browser.location.pathname}?${query}`, title, referrer }));
  } catch {}
}
