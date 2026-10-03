import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { PublicCart, PublicStarterThemePresentationV2 } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Props = { cart: PublicCart | null; presentation?: PublicStarterThemePresentationV2["cart"] };
const Widget = componentLoader()<{ FreeShippingProgress: React.ComponentType<Props> }>(new URL("./FreeShippingProgress.tsx", import.meta.url)).FreeShippingProgress;
const presentation = { showShippingProgress: true, freeShippingThresholdCents: 125050, showCheckoutReadiness: true, showQuantitySelector: true };
const cart = { currency: "TRY", subtotalCents: 100000, shippingCents: 1489, itemCount: 1, checkoutBlocker: null } as PublicCart;

test("shipping bar displays exact remaining currency and updates its accessible progress at the threshold", async () => {
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Widget, { presentation, cart }));
    assert.match(container.textContent ?? "", /250,50/u);
    const bar = container.querySelector('[role="progressbar"]');
    assert.equal(bar?.getAttribute("aria-valuenow"), "79");
    assert.equal(container.querySelector('[aria-live="polite"]')?.getAttribute("aria-label"), "Ücretsiz kargo");
    await render(React.createElement(Widget, { presentation, cart: { ...cart, subtotalCents: 125050, shippingCents: 0 } }));
    assert.match(container.textContent ?? "", /Ücretsiz kargo kazandınız/u);
    assert.equal(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"), "100");
    await render(React.createElement(Widget, { presentation, cart: { ...cart, checkoutBlocker: "shipping_unavailable" } }));
    assert.equal(container.querySelector('[role="progressbar"]'), null);
    await render(React.createElement(Widget, { presentation: { ...presentation, showShippingProgress: false }, cart }));
    assert.equal(container.textContent, "");
  });
});
