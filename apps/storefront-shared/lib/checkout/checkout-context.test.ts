import assert from "node:assert/strict";
import test from "node:test";

const policy = await import("./checkout-context.ts").catch(() => null);
const CONTEXT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CREDENTIAL = `h1.current_01.${"A".repeat(43)}`;

test("checkout context paths carry a canonical selector without granting URL authority", () => {
  assert.equal(policy?.parseCheckoutContextId(CONTEXT), CONTEXT);
  assert.equal(policy?.checkoutContextPaymentPath(CONTEXT), `/checkout/payment/${CONTEXT}`);
  assert.equal(policy?.checkoutContextResultPath(CONTEXT), `/checkout/payment/${CONTEXT}/result`);
  for (const value of [null, {}, "", CONTEXT.toUpperCase().replace("1111-4111", "AAAA-4111"), `${CONTEXT}/result`, `${CONTEXT}?x=1`]) {
    assert.equal(policy?.parseCheckoutContextId(value), null);
  }
  assert.throws(() => policy!.checkoutContextPaymentPath("not-a-context"), /checkout_context_invalid/);
});

test("only exact legacy or context payment destinations are admitted", () => {
  assert.equal(typeof policy?.isCheckoutContextDestination, "function");
  for (const path of ["/checkout/payment", "/checkout/payment/result", `/checkout/payment/${CONTEXT}`, `/checkout/payment/${CONTEXT}/result`]) {
    assert.equal(policy!.isCheckoutContextDestination(path), true, path);
  }
  for (const path of ["//attacker.example", `https://shop.example/checkout/payment/${CONTEXT}`, `/checkout/payment/${CONTEXT}/`, `/checkout/payment/${CONTEXT}?x=1`, `/checkout/payment/${CONTEXT}/result#x`, `/checkout/payment/%31${CONTEXT.slice(1)}`, "/checkout/payment/result/extra", null]) {
    assert.equal(policy!.isCheckoutContextDestination(path), false, String(path));
  }
  assert.equal(policy!.isCheckoutContextPaymentPath(`/checkout/payment/${CONTEXT}`), true);
  assert.equal(policy!.isCheckoutContextPaymentPath(`/checkout/payment/${CONTEXT}/result`), false);
});

test("each checkout receives the existing credential in its own secure cookie path", () => {
  assert.equal(typeof policy?.serializeCheckoutContextCookie, "function");
  assert.equal(policy!.serializeCheckoutContextCookie(CONTEXT, CREDENTIAL), `__Secure-celebix_hosted_checkout=${CREDENTIAL}; Path=/checkout/payment/${CONTEXT}; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`);
  assert.match(policy!.serializeCheckoutContextCookie(OTHER, CREDENTIAL), new RegExp(`Path=/checkout/payment/${OTHER};`));
  for (const [context, value] of [["invalid", CREDENTIAL], [CONTEXT, "not-a-credential"], [CONTEXT, `${CREDENTIAL}; Path=/`]]) {
    assert.throws(() => policy!.serializeCheckoutContextCookie(context!, value!), /checkout_context_invalid/);
  }
});

test("context cookie selection never borrows the browser-wide hosted credential", () => {
  assert.equal(typeof policy?.readCheckoutContextCookie, "function");
  assert.deepEqual(policy!.readCheckoutContextCookie(null), { kind: "missing" });
  assert.deepEqual(policy!.readCheckoutContextCookie(`__Host-celebix_hosted_checkout=${CREDENTIAL}`), { kind: "missing" });
  assert.deepEqual(policy!.readCheckoutContextCookie(`other=fixture; __Secure-celebix_hosted_checkout=${CREDENTIAL}`), { kind: "present", value: CREDENTIAL });
  for (const header of [`__Secure-celebix_hosted_checkout=${CREDENTIAL}; __Secure-celebix_hosted_checkout=${CREDENTIAL}`, "__Secure-celebix_hosted_checkout=invalid", `__Secure-celebix_hosted_checkout=h1.current_01.${"A".repeat(42)}B`, "x=" + "a".repeat(4096), "x=fixture\n"]) {
    assert.deepEqual(policy!.readCheckoutContextCookie(header), { kind: "invalid" });
  }
});
