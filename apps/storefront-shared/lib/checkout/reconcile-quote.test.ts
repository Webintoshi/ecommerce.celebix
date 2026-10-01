import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parsePublicCheckoutQuoteV2 } from "@celebix/saas-contracts";
import { createCheckoutQuoteQueue } from "./quote-queue.ts";

const modulePromise = import("./reconcile-quote.ts").catch(() => null);
function serverQuote(rejectedCodes: readonly string[]) {
  const quote = parsePublicCheckoutQuoteV2({
    cart: { version: 1, currency: "TRY", itemCount: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0,
      checkoutReady: false, checkoutBlocker: "empty_cart", items: [], lineDiscountCents: 0, shippingDiscountCents: 0, discountCents: 0 },
    paymentMethods: [], promotionStatus: { kind: "evaluated" }, appliedPromotions: [],
    rejectedPromotions: rejectedCodes.map(normalizedCode => ({ normalizedCode, reason: "invalid_code" })), gifts: [], progressMessages: [],
  });
  return Object.freeze({ quote, quoteDigest: createHash("sha256").update(JSON.stringify(quote)).digest("hex") });
}

test("coupon reconciliation retains rejection feedback and confirms the exact submitted candidate set", async () => {
  const module = await modulePromise;
  assert.ok(module);
  const requested: string[][] = [];
  const final = await module.reconcileCheckoutQuote(async (_intent, codes) => {
    requested.push([...codes]);
    return serverQuote(codes.includes("BAD") ? ["BAD"] : []);
  }, "cart", ["BAD", "GOOD"]);
  assert.deepEqual(requested, [["BAD", "GOOD"], ["GOOD"]]);
  assert.deepEqual(final.normalizedCodes, ["GOOD"]);
  assert.deepEqual(final.rejectedCodes, ["BAD"]);
  assert.deepEqual(final.quote.rejectedPromotions, []);
  assert.equal(final.quoteDigest, serverQuote([]).quoteDigest);
  assert.notEqual(final.quoteDigest, serverQuote(["BAD"]).quoteDigest);
});

test("five independently rejected candidates settle in at most six server quotes", async () => {
  const module = await modulePromise;
  assert.ok(module);
  const counts: number[] = [];
  const final = await module.reconcileCheckoutQuote(async (_intent, codes) => {
    counts.push(codes.length);
    return serverQuote(codes.length ? [codes[0]!] : []);
  }, "buy_now", ["ONE", "TWO", "THREE", "FOUR", "FIVE"]);
  assert.deepEqual(counts, [5, 4, 3, 2, 1, 0]);
  assert.deepEqual(final.normalizedCodes, []);
  assert.deepEqual(final.rejectedCodes, ["ONE", "TWO", "THREE", "FOUR", "FIVE"]);
});

test("the entire canonical retry finishes before a newer queued cart quote can write the cookie", async () => {
  const module = await modulePromise;
  assert.ok(module);
  const started: string[] = [];
  let finishFirst: (() => void) | undefined;
  const request = async (intent: "cart" | "buy_now", codes: readonly string[]) => {
    started.push(`${intent}:${codes.join(".")}`);
    if (codes.includes("BAD")) await new Promise<void>(resolve => { finishFirst = resolve; });
    return serverQuote(codes.includes("BAD") ? ["BAD"] : []);
  };
  const queue = createCheckoutQuoteQueue((intent, codes) => module.reconcileCheckoutQuote(request, intent, codes));
  const first = queue("cart", ["BAD", "GOOD"]);
  const second = queue("buy_now", ["NEW"]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(started, ["cart:BAD.GOOD"]);
  finishFirst?.();
  assert.deepEqual((await first).normalizedCodes, ["GOOD"]);
  await second;
  assert.deepEqual(started, ["cart:BAD.GOOD", "cart:GOOD", "buy_now:NEW"]);
});

test("an unconfirmed canonical retry or unexpected rejection never returns a usable old digest", async () => {
  const module = await modulePromise;
  assert.ok(module);
  await assert.rejects(module.reconcileCheckoutQuote(async (_intent, codes) => {
    if (codes.includes("BAD")) return serverQuote(["BAD"]);
    throw new Error("unavailable");
  }, "cart", ["BAD"]), /unavailable/u);
  await assert.rejects(module.reconcileCheckoutQuote(async () => serverQuote(["STRAY"]), "cart", ["GOOD"]), /checkout_quote_rejection_invalid/u);
});
