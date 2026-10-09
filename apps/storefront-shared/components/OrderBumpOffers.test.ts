import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const cart = { version: 4, currency: "TRY", itemCount: 1, subtotalCents: 10000, shippingCents: 0, totalCents: 10000, checkoutReady: true, checkoutBlocker: null, items: [{ productId: "10000000-0000-4000-8000-000000000001", variantId: "20000000-0000-4000-8000-000000000001", slug: "first", title: "İlk ürün", variantTitle: "Varsayılan", quantity: 1, unitPriceCents: 10000, lineTotalCents: 10000, available: true }] };
const offer = { ruleId: "30000000-0000-4000-8000-000000000001", productId: "10000000-0000-4000-8000-000000000002", variantId: "20000000-0000-4000-8000-000000000002", slug: "ikinci", title: "İkinci ürün", variantTitle: "Kahve / M", priceCents: 2500, currency: "TRY", media: null };
const offers = { cartVersion: 4, heading: "Birlikte iyi gider", offers: [offer] };
type Component = React.ComponentType<Record<string, unknown>>;
function fixture(options: { read?: (...input: unknown[]) => Promise<unknown>; add?: (...input: unknown[]) => Promise<unknown>; resolve?: () => Promise<unknown> } = {}) {
  const added: unknown[] = [], replaced: unknown[] = [];
  let resolutions = 0;
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("a", props, children) },
    "../lib/order-bumps/client.ts": { readOrderBumpOffers: options.read ?? (async () => offers) },
    "../lib/cart/client.ts": { storefrontCartClient: { async add(input: unknown) { added.push(input); return options.add ? options.add(input) : { ...cart, version: 5, itemCount: 2, subtotalCents: 12500, totalCents: 12500, items: [...cart.items, { ...cart.items[0], productId: offer.productId, variantId: offer.variantId, slug: offer.slug, title: offer.title, variantTitle: offer.variantTitle, unitPriceCents: 2500, lineTotalCents: 2500 }] }; }, async resolve() { resolutions++; return options.resolve ? options.resolve() : cart; } } },
    "./CartStatusProvider": { useCartStatus: () => ({ replaceCart(value: unknown) { replaced.push(value); } }) },
    "../lib/format.ts": { formatTry: (cents: number) => `₺${cents / 100}` },
  });
  const Offers = load<{ OrderBumpOffers: Component }>(new URL("./OrderBumpOffers.tsx", import.meta.url)).OrderBumpOffers;
  return { Offers, added, replaced, resolutions: () => resolutions };
}

test("an optional recommendation failure leaves no broken section or add control", async () => {
  const { Offers } = fixture({ read: async () => { throw new Error("unavailable"); } });
  await withProductBrowser(async ({ container, render }) => { await render(React.createElement(Offers, { cart, placement: "side_cart" })); assert.equal(container.querySelector("section"), null); });
});

test("offer links follow the storefront locale without changing the selected variant", async () => {
  const { Offers } = fixture();
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Offers, { cart, placement: "side_cart", locale: "tr" }));
    assert.equal(container.querySelector("a")?.getAttribute("href"), "/urun/ikinci");
    await render(React.createElement(Offers, { cart, placement: "side_cart", locale: "en" }));
    assert.equal(container.querySelector("a")?.getAttribute("href"), "/products/ikinci");
  });
});

test("a response for an older cart version is never offered or accepted", async () => {
  const { Offers } = fixture({ read: async () => ({ ...offers, cartVersion: 3 }) });
  await withProductBrowser(async ({ container, render }) => { await render(React.createElement(Offers, { cart, placement: "side_cart" })); assert.equal(container.querySelector("button"), null); });
});

test("one explicit acceptance binds the actual variant to the displayed cart version and uses canonical totals", async () => {
  let complete!: (value: unknown) => void;
  const next = { ...cart, version: 5, subtotalCents: 13123, shippingCents: 456, totalCents: 13579 };
  const { Offers, added, replaced } = fixture({ add: async () => new Promise(resolve => { complete = resolve; }) });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Offers, { cart, placement: "side_cart" }));
    assert.match(container.textContent ?? "", /Kahve \/ M/u);
    await click(".order-bump-add"); await click(".order-bump-add");
    assert.deepEqual(added, [{ productId: offer.productId, variantId: offer.variantId, quantity: 1, expectedVersion: 4 }]);
    assert.equal(container.querySelector<HTMLButtonElement>(".order-bump-add")?.disabled, true);
    await React.act(async () => complete(next)); assert.deepEqual(replaced, [next]);
  });
});

test("an ambiguous add is recovered by one read only resolve and never replayed", async () => {
  const { Offers, added, replaced, resolutions } = fixture({ add: async () => { throw new Error("lost response"); } });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Offers, { cart, placement: "side_cart" })); await click(".order-bump-add");
    assert.equal(added.length, 1); assert.equal(resolutions(), 1); assert.deepEqual(replaced, [cart]);
    assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /sepet/u);
    assert.equal(container.querySelector(".order-bump-add"), null, "uncertain acceptance cannot be repeated through the old offer");
  });
});

test("checkout fences synchronously before add and waits for the replacement quote before becoming idle", async () => {
  let settle!: () => void;
  const order: string[] = [];
  const { Offers, added } = fixture({ add: async () => { order.push("add"); return { ...cart, version: 5 }; } });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Offers, { cart, placement: "checkout", beforeAdd() { order.push("fence"); return true; }, afterAdd: async () => { order.push("quote"); await new Promise<void>(resolve => { settle = resolve; }); } }));
    await click(".order-bump-add"); assert.deepEqual(order, ["fence", "add", "quote"]); assert.equal(added.length, 1);
    assert.equal(container.querySelector(".order-bump-offers")?.getAttribute("aria-busy"), "true");
    await React.act(async () => settle());
  });
});

test("a late response cannot restore offers after the cart changed", async () => {
  let finish!: (value: unknown) => void;
  const { Offers } = fixture({ read: async () => new Promise(resolve => { finish = resolve; }) });
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Offers, { cart, placement: "side_cart" }));
    const first = finish;
    await render(React.createElement(Offers, { cart: { ...cart, version: 5 }, placement: "side_cart" }));
    await React.act(async () => first(offers)); assert.equal(container.querySelector(".order-bump-add"), null);
    await React.act(async () => finish({ ...offers, cartVersion: 5 })); assert.ok(container.querySelector(".order-bump-add"));
  });
});

test("an inactive placement or empty cart does not request suggestions", async () => {
  let reads = 0;
  const { Offers } = fixture({ read: async () => { reads++; return offers; } });
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Offers, { cart, placement: "checkout", active: false }));
    await render(React.createElement(Offers, { cart: { ...cart, items: [], itemCount: 0 }, placement: "side_cart" }));
    assert.equal(reads, 0); assert.equal(container.querySelector("section"), null);
  });
});

test("a payment fence refusal prevents cart mutation", async () => {
  const { Offers, added } = fixture();
  await withProductBrowser(async ({ render, click }) => { await render(React.createElement(Offers, { cart, placement: "checkout", beforeAdd: () => false })); await click(".order-bump-add"); assert.deepEqual(added, []); });
});
