import assert from "node:assert/strict";
import test from "node:test";

import { createBuyNowController, requestBuyNow } from "./buy-now.ts";

const PRODUCT_ID = "b59c0f86-c7c7-4e39-b3a1-2c10cd734587";
const VARIANT_ID = "91c40139-3204-47ac-a81f-4f1d1e5bd1b2";
const OTHER_VARIANT_ID = "f361eb1d-ab82-43ec-886a-50044f67a7f4";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((selected) => { resolve = selected; });
  return { promise, resolve };
}

test("buy now captures one server-priced item through the exact same-origin cart route", async () => {
  const calls: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
  const result = await requestBuyNow({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async (input, init) => {
      calls.push([input, init]);
      return Response.json({ status: "active", currency: "TRY", totalCents: 19_900, itemCount: 1, version: 1 });
    },
  });

  assert.deepEqual(result, { kind: "ready" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "/api/cart");
  assert.equal(calls[0]?.[1]?.method, "POST");
  assert.equal(calls[0]?.[1]?.credentials, "same-origin");
  assert.equal(calls[0]?.[1]?.cache, "no-store");
  assert.equal(calls[0]?.[1]?.redirect, "error");
  assert.equal(new Headers(calls[0]?.[1]?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]?.[1]?.body)), {
    customer: {},
    items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
  });
});

test("buy now fails closed on invalid identities, response shape, status, and transport", async () => {
  let calls = 0;
  assert.deepEqual(await requestBuyNow({
    productId: "invalid",
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async () => { calls += 1; return Response.json({}); },
  }), { kind: "failed" });
  assert.equal(calls, 0);

  for (const response of [
    Response.json({ status: "active", currency: "USD", totalCents: 19_900, itemCount: 1, version: 1 }),
    Response.json({ status: "active", currency: "TRY", totalCents: 19_900, itemCount: 1, version: 1, detail: "private" }),
    Response.json({ status: "active", currency: "TRY", totalCents: 19_900, itemCount: 1, version: 1 }, { status: 409 }),
    Response.json({ code: "unavailable" }, { status: 503 }),
  ]) assert.deepEqual(await requestBuyNow({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async () => response.clone(),
  }), { kind: "failed" });
});

test("buy now distinguishes an intentional abort", async () => {
  assert.deepEqual(await requestBuyNow({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async () => { throw new DOMException("Aborted", "AbortError"); },
  }), { kind: "aborted" });
});

test("one product controller serializes rapid same- and cross-variant clicks into one request and navigation", async () => {
  const response = deferred<Readonly<{ kind: "ready" }>>();
  const requests: Array<Readonly<{ productId: string; variantId: string; signal: AbortSignal }>> = [];
  const navigations: string[] = [];
  const controller = createBuyNowController({
    productId: PRODUCT_ID,
    request: async (input) => {
      requests.push(input);
      return response.promise;
    },
    navigate: (pathname) => { navigations.push(pathname); },
    onStateChange: () => undefined,
  });

  const first = controller.buy({ variantId: VARIANT_ID, available: true });
  const duplicate = controller.buy({ variantId: VARIANT_ID, available: true });
  const otherVariant = controller.buy({ variantId: OTHER_VARIANT_ID, available: true });
  assert.equal(requests.length, 1);
  assert.deepEqual(
    { productId: requests[0]?.productId, variantId: requests[0]?.variantId },
    { productId: PRODUCT_ID, variantId: VARIANT_ID },
  );
  assert.deepEqual(navigations, []);

  response.resolve({ kind: "ready" });
  await Promise.all([first, duplicate, otherVariant]);
  assert.deepEqual(navigations, ["/odeme"]);

  await controller.buy({ variantId: OTHER_VARIANT_ID, available: true });
  assert.equal(requests.length, 1, "the mutex remains held until the successful navigation unloads the page");
  assert.deepEqual(navigations, ["/odeme"]);
});

test("timeout aborts the active request and ignores a late successful commit", async () => {
  const response = deferred<Readonly<{ kind: "ready" }>>();
  const timers = new Map<number, () => void>();
  const states: unknown[] = [];
  const signals: AbortSignal[] = [];
  const navigations: string[] = [];
  let timerSequence = 0;
  const controller = createBuyNowController({
    productId: PRODUCT_ID,
    request: async (input) => {
      signals.push(input.signal);
      return response.promise;
    },
    navigate: (pathname) => { navigations.push(pathname); },
    onStateChange: (state) => { states.push(state); },
    setTimer: (callback, delayMs) => {
      assert.equal(delayMs, 10_000);
      timerSequence += 1;
      timers.set(timerSequence, callback);
      return timerSequence;
    },
    clearTimer: (timer) => { timers.delete(Number(timer)); },
  });

  const pending = controller.buy({ variantId: VARIANT_ID, available: true });
  assert.equal(signals[0]?.aborted, false);
  assert.deepEqual(states, [{ kind: "pending", variantId: VARIANT_ID }]);
  timers.get(1)?.();
  assert.equal(signals[0]?.aborted, true);
  assert.deepEqual(states.at(-1), { kind: "failed", variantId: VARIANT_ID });

  response.resolve({ kind: "ready" });
  await pending;
  assert.deepEqual(navigations, []);
  assert.deepEqual(states.at(-1), { kind: "failed", variantId: VARIANT_ID });
});

test("navigation waits for the cart response boundary that commits the host-only cookie", async () => {
  const response = deferred<void>();
  let cookieCommitted = false;
  const navigations: string[] = [];
  const controller = createBuyNowController({
    productId: PRODUCT_ID,
    request: async () => {
      await response.promise;
      cookieCommitted = true;
      return { kind: "ready" };
    },
    navigate: (pathname) => {
      assert.equal(cookieCommitted, true);
      navigations.push(pathname);
    },
    onStateChange: () => undefined,
  });

  const pending = controller.buy({ variantId: VARIANT_ID, available: true });
  await Promise.resolve();
  assert.deepEqual(navigations, []);
  response.resolve();
  await pending;
  assert.deepEqual(navigations, ["/odeme"]);
});
