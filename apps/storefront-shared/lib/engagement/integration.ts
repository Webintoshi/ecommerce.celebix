import type { PublicCart } from "@celebix/saas-contracts";

export type EngagementCartController = Readonly<{
  storefrontId: string;
  getCart(): PublicCart | null;
  getTrigger?(): HTMLElement | null;
  closeDrawerAndWait(restoreFocus?: boolean): Promise<boolean>;
}>;
export type SuccessfulCartAdd = Readonly<{ storefrontId: string; cart: PublicCart; route: string }>;
type BrowserState = { carts: Map<string, EngagementCartController>; listeners: Set<(event: SuccessfulCartAdd) => void>; memory: Map<string, string> };
// A document-local bridge coordinates the persistent layout with the page's
// existing cart provider, including its owned browser history entry.
const states = new WeakMap<Window, BrowserState>();
function state(): BrowserState | null {
  if (typeof window === "undefined") return null;
  let selected = states.get(window);
  if (!selected) { selected = { carts: new Map(), listeners: new Set(), memory: new Map() }; states.set(window, selected); }
  return selected;
}
export function engagementRouteAllowed(pathname: string): boolean { return !/^\/(?:checkout|account|payments|odeme)(?:\/|$)/i.test(pathname); }
export function registerEngagementCart(controller: EngagementCartController): () => void {
  const selected = state(); selected?.carts.set(controller.storefrontId, controller);
  return () => { if (selected?.carts.get(controller.storefrontId) === controller) selected.carts.delete(controller.storefrontId); };
}
export function getEngagementCart(storefrontId: string): EngagementCartController | null { return state()?.carts.get(storefrontId) ?? null; }
export function subscribeSuccessfulCartAdd(listener: (event: SuccessfulCartAdd) => void): () => void {
  const selected = state(); selected?.listeners.add(listener);
  return () => { selected?.listeners.delete(listener); };
}
export function notifySuccessfulCartAdd(cart: PublicCart): void {
  const selected = state();
  if (!selected || cart.itemCount < 1) return;
  const browser = window, route = `${browser.location.pathname}${browser.location.search}`;
  const controller = [...selected.carts.values()].at(-1);
  if (!controller) return;
  // Let the caller install its successful cart and update drawer visibility.
  browser.setTimeout(() => {
    if (selected.carts.get(controller.storefrontId) !== controller || route !== `${browser.location.pathname}${browser.location.search}`) return;
    const event = Object.freeze({ storefrontId: controller.storefrontId, cart, route });
    for (const listener of selected.listeners) { try { listener(event); } catch { /* Optional tools cannot fail an accepted cart mutation. */ } }
  }, 0);
}
function key(storefrontId: string, suffix: string) { return `celebix:engagement:${window.location.host}:${storefrontId}:${suffix}`; }
function read(storefrontId: string, suffix: string, persistent: boolean): string | null {
  const selected = state(); if (!selected) return null;
  const id = key(storefrontId, suffix);
  try { return (persistent ? window.localStorage : window.sessionStorage).getItem(id) ?? selected.memory.get(id) ?? null; } catch { return selected.memory.get(id) ?? null; }
}
function write(storefrontId: string, suffix: string, value: string | null, persistent: boolean) {
  const selected = state(); if (!selected) return;
  const id = key(storefrontId, suffix);
  if (value === null) selected.memory.delete(id); else selected.memory.set(id, value);
  try { const storage = persistent ? window.localStorage : window.sessionStorage; if (value === null) storage.removeItem(id); else storage.setItem(id, value); } catch { /* Session memory still avoids repeated prompts. */ }
}
export function campaignWasShown(storefrontId: string, campaignId: string, repeatDays: number, now = Date.now()): boolean {
  const raw = read(storefrontId, `shown:${campaignId}`, true);
  if (!raw || !/^\d{1,16}$/.test(raw)) return false;
  const time = Number(raw); return Number.isSafeInteger(time) && now >= time && now - time < repeatDays * 86_400_000;
}
export function markCampaignShown(storefrontId: string, campaignId: string, now = Date.now()): void { write(storefrontId, `shown:${campaignId}`, String(now), true); }
export function rememberPendingCoupon(storefrontId: string, code: string): void { if (/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code)) write(storefrontId, "coupon", code, false); }
export function readPendingCoupon(storefrontId: string): string | null { const code = read(storefrontId, "coupon", false); return code && /^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code) ? code : null; }
export function clearPendingCoupon(storefrontId: string): void { write(storefrontId, "coupon", null, false); }
export function cartContactWasCaptured(storefrontId: string): boolean { return read(storefrontId, "contact-captured", true) === "1"; }
export function markCartContactCaptured(storefrontId: string): void { write(storefrontId, "contact-captured", "1", true); }
