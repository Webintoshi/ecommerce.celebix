import assert from "node:assert/strict";
import test from "node:test";

import type { PublicCart, PublicCheckoutQuote } from "@celebix/saas-contracts";

import * as readiness from "./checkout-readiness.ts";

const CART = Object.freeze({
  version: 3,
  currency: "TRY",
  itemCount: 1,
  subtotalCents: 10_404_00,
  shippingCents: 0,
  totalCents: 10_404_00,
  checkoutReady: true,
  checkoutBlocker: null,
  items: Object.freeze([]),
}) satisfies PublicCart;

const QUOTE_CART = Object.freeze({ ...CART, version: 4 });
const QUOTE = Object.freeze({ cart: QUOTE_CART, paymentMethods: Object.freeze([]) }) satisfies PublicCheckoutQuote;

type Resolver = (
  intentKind: "cart" | "buy_now",
  quote: PublicCheckoutQuote | null,
  cart: PublicCart | null,
  settled: boolean,
) => Readonly<{ kind: "loading" }> | Readonly<{ kind: "summary"; cart: PublicCart }> | Readonly<{ kind: "unavailable" }>;

const resolver = (readiness as Readonly<Record<string, unknown>>).resolveCheckoutSummaryState as Resolver | undefined;

test("cart checkout keeps its canonical cart summary when payment quote is unavailable", () => {
  assert.deepEqual(resolver?.("cart", null, CART, true), { kind: "summary", cart: CART });
});

test("buy-now checkout never substitutes the unrelated regular cart", () => {
  assert.deepEqual(resolver?.("buy_now", null, CART, true), { kind: "unavailable" });
});

test("checkout distinguishes pending quote from a settled unavailable quote", () => {
  assert.deepEqual(resolver?.("cart", null, null, false), { kind: "loading" });
  assert.deepEqual(resolver?.("cart", null, null, true), { kind: "unavailable" });
  assert.deepEqual(resolver?.("buy_now", QUOTE, CART, true), { kind: "summary", cart: QUOTE_CART });
});
