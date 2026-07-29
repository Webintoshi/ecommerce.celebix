import assert from "node:assert/strict";
import test from "node:test";

import { requestCheckoutSubmission } from "./submission.ts";

const body = new URLSearchParams({
  cartVersion: "4",
  checkoutNonce: "C".repeat(43),
  operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  paymentMethodId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  identityNumber: "74300864791",
  distanceSales: "true",
  preInformation: "true",
});

test("JS submit uses one same-origin manual fetch and parses built-in or provider success", async () => {
  for (const location of [
    "/odeme/sonuc",
    "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890&lang=tr",
  ]) {
    const observations: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
    const result = await requestCheckoutSubmission({
      body,
      deliveryReady: true,
      signal: new AbortController().signal,
      fetcher: async (input, init) => {
        observations.push([input, init]);
        return Response.json({ kind: "redirect", location }, { status: 200 });
      },
    });
    assert.deepEqual(result, { kind: "redirect", location });
    const observed = observations[0];
    assert.ok(observed);
    assert.equal(observed?.[0], "/api/checkout/submit");
    assert.equal(observed?.[1]?.method, "POST");
    assert.equal(observed?.[1]?.credentials, "same-origin");
    assert.equal(observed?.[1]?.redirect, "manual");
    assert.equal(new Headers(observed?.[1]?.headers).get("accept"), "application/json");
    assert.equal(
      new Headers(observed?.[1]?.headers).get("content-type"),
      "application/x-www-form-urlencoded",
    );
    assert.equal(observed?.[1]?.body, body.toString());
  }
});

test("JS submit parses processing and finite errors without navigating", async () => {
  for (const [status, code] of [
    [202, "processing"],
    [409, "cart_changed"],
    [503, "unavailable"],
  ] as const) {
    const result = await requestCheckoutSubmission({
      body,
      deliveryReady: true,
      signal: new AbortController().signal,
      fetcher: async () => Response.json({ code }, { status }),
    });
    assert.deepEqual(result, { kind: "failed", code });
  }
});

test("JS submit fails closed on malformed success, open redirect, and extra error detail", async () => {
  for (const response of [
    Response.json({ kind: "redirect", location: "https://evil.test/pay" }),
    Response.json({ kind: "redirect", location: "/odeme/sonuc?next=evil" }),
    Response.json({ kind: "redirect", location: "/odeme/sonuc", token: "secret" }),
    Response.json({ code: "processing", detail: "private" }, { status: 202 }),
  ]) {
    const result = await requestCheckoutSubmission({
      body,
      deliveryReady: true,
      signal: new AbortController().signal,
      fetcher: async () => response.clone(),
    });
    assert.deepEqual(result, { kind: "failed", code: "unavailable" });
  }
});

test("JS submit reports an abort without turning it into a server failure", async () => {
  const result = await requestCheckoutSubmission({
    body,
    deliveryReady: true,
    signal: new AbortController().signal,
    fetcher: async () => { throw new DOMException("Aborted", "AbortError"); },
  });
  assert.deepEqual(result, { kind: "aborted" });
});

test("JS submit makes no network request before delivery authority is clean", async () => {
  let calls = 0;
  const result = await requestCheckoutSubmission({
    body,
    deliveryReady: false,
    signal: new AbortController().signal,
    fetcher: async () => {
      calls += 1;
      return Response.json({ kind: "redirect", location: "/odeme/sonuc" });
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { kind: "delivery_dirty" });
});
