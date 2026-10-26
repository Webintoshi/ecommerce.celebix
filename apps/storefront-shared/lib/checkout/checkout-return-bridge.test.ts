import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

const bridge = await import("./checkout-return-bridge.ts").catch(() => null);
const CONTEXT = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://shop.example.test";

test("a scoped parent accepts only its own iframe's same-origin fixed navigation message", () => {
  assert.equal(typeof bridge?.checkoutContextFrameReturnScript, "function");
  let listener: ((event: unknown) => void) | undefined;
  const frame = { contentWindow: {} }, destinations: string[] = [];
  vm.runInNewContext(bridge!.checkoutContextFrameReturnScript(CONTEXT), {
    window: { location: { origin: ORIGIN, replace: (path: string) => destinations.push(path) }, addEventListener: (_name: string, fn: (event: unknown) => void) => { listener = fn; } },
    document: { getElementById: () => frame },
  });
  assert.ok(listener);
  for (const event of [
    { origin: "https://attacker.example", source: frame.contentWindow, data: "celebix:checkout-result-check" },
    { origin: ORIGIN, source: {}, data: "celebix:checkout-result-check" },
    { origin: ORIGIN, source: frame.contentWindow, data: { status: "captured" } },
    { origin: ORIGIN, source: frame.contentWindow, data: "captured" },
  ]) listener(event);
  assert.deepEqual(destinations, []);
  listener({ origin: ORIGIN, source: frame.contentWindow, data: "celebix:checkout-result-check" });
  assert.deepEqual(destinations, [`/checkout/payment/${CONTEXT}/result`]);
  assert.throws(() => bridge!.checkoutContextFrameReturnScript("//attacker.example"), /checkout_context_invalid/);
});

test("a same-origin scoped iframe return emits only a fixed marker and never a legacy redirect", () => {
  assert.equal(typeof bridge?.checkoutResultBridgeScript, "function");
  const messages: unknown[] = [], destinations: string[] = [];
  const parent = { location: { origin: ORIGIN, pathname: `/checkout/payment/${CONTEXT}` }, postMessage: (...args: unknown[]) => messages.push(args) };
  const window = { location: { origin: ORIGIN, replace: (path: string) => destinations.push(path) }, parent, top: { location: { replace: (path: string) => destinations.push(path) } } };
  vm.runInNewContext(bridge!.checkoutResultBridgeScript("/checkout/payment/result"), { window });
  assert.deepEqual(messages, [["celebix:checkout-result-check", ORIGIN]]);
  assert.deepEqual(destinations, []);
});

test("legacy top-level and cross-origin iframe navigation retain their fixed existing behavior", () => {
  assert.equal(typeof bridge?.checkoutResultBridgeScript, "function");
  const destinations: string[] = [];
  const window = { location: { origin: ORIGIN, replace: (path: string) => destinations.push(path) } } as Record<string, unknown>;
  window.parent = window; window.top = window;
  vm.runInNewContext(bridge!.checkoutResultBridgeScript("/checkout/payment/result"), { window });
  assert.deepEqual(destinations, ["/checkout/payment/result"]);
  destinations.length = 0;
  const crossOriginParent = { get location(): never { throw new Error("cross origin"); } };
  window.parent = crossOriginParent;
  window.top = { location: { replace: (path: string) => destinations.push(path) } };
  vm.runInNewContext(bridge!.checkoutResultBridgeScript("/checkout/payment/result"), { window });
  assert.deepEqual(destinations, ["/checkout/payment/result"]);
  destinations.length = 0;
  vm.runInNewContext(bridge!.checkoutResultBridgeScript(), { window });
  assert.deepEqual(destinations, []);
  assert.throws(() => bridge!.checkoutResultBridgeScript("https://attacker.example" as never), /checkout_context_invalid/);
});
