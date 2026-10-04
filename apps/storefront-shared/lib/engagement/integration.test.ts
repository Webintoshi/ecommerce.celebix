import assert from "node:assert/strict";
import test from "node:test";
import type { PublicCart } from "@celebix/saas-contracts";

const cart = { version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: [] } as unknown as PublicCart;
async function api() {
  const module = await import("./integration.ts").catch(() => null);
  assert.equal(typeof module?.notifySuccessfulCartAdd, "function", "successful add bridge must exist");
  return module!;
}
function browser() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  return { location: { host: "shop.example", pathname: "/products/one", search: "" }, setTimeout, sessionStorage: storage, localStorage: storage, values };
}
test("successful add waits for caller drawer updates and never crosses a route or retired provider", async () => {
  const module = await api(), selected = browser(), previous = globalThis.window;
  Object.assign(globalThis, { window: selected });
  try {
    const received: string[] = [];
    const retire = module.registerEngagementCart({ storefrontId: "shop", getCart: () => cart, closeDrawerAndWait: async () => true });
    const unsubscribe = module.subscribeSuccessfulCartAdd(event => received.push(event.storefrontId));
    module.notifySuccessfulCartAdd(cart); assert.deepEqual(received, []);
    await new Promise(resolve => setTimeout(resolve, 5)); assert.deepEqual(received, ["shop"]);
    module.notifySuccessfulCartAdd(cart); selected.location.pathname = "/checkout";
    await new Promise(resolve => setTimeout(resolve, 5)); assert.deepEqual(received, ["shop"]);
    selected.location.pathname = "/products/one"; module.notifySuccessfulCartAdd(cart); retire();
    await new Promise(resolve => setTimeout(resolve, 5)); assert.deepEqual(received, ["shop"]);
    unsubscribe();
  } finally { Object.assign(globalThis, { window: previous }); }
});
test("pending coupons and frequency use only host/store scoped opaque data", async () => {
  const module = await api(), selected = browser(), previous = globalThis.window;
  Object.assign(globalThis, { window: selected });
  try {
    module.rememberPendingCoupon("one", "MERHABA10");
    assert.equal(module.readPendingCoupon("one"), "MERHABA10");
    assert.equal(module.readPendingCoupon("two"), null);
    selected.location.host = "other.example"; assert.equal(module.readPendingCoupon("one"), null);
    selected.location.host = "shop.example";
    module.markCampaignShown("one", "campaign", 1000);
    assert.equal(module.campaignWasShown("one", "campaign", 7, 1001), true);
    assert.equal(module.campaignWasShown("one", "campaign", 7, 1000 + 8 * 86400000), false);
    module.clearPendingCoupon("one"); assert.equal(module.readPendingCoupon("one"), null);
    assert.doesNotMatch(JSON.stringify([...selected.values]), /email|phone|customerId/i);
  } finally { Object.assign(globalThis, { window: previous }); }
});
