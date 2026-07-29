import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const moduleUrl = new URL("./index.ts", import.meta.url).href;
const fixture = JSON.stringify({
  schemaVersion: 1,
  cartId: "11111111-1111-4111-8111-111111111111",
  cartVersion: 1,
  checkoutNonce: "A".repeat(43),
  storeName: "Celebix",
  currency: "TRY",
  locale: "tr",
  items: [{
    id: "22222222-2222-4222-8222-222222222222",
    title: "Ürün",
    variantLabel: null,
    quantity: 1,
    unitPriceCents: 10_000,
    lineTotalCents: 10_000,
    imagePath: null,
  }],
  shippingOptions: [{
    id: "standard",
    label: "Standart",
    description: null,
    priceCents: 2_900,
  }],
  selectedShippingId: "standard",
  paymentMethods: [{
    id: "44444444-4444-4444-8444-444444444444",
    kind: "provider",
    label: "Kart",
    providerCode: "paytr_iframe",
    logoPath: "/payment-providers/paytr.svg",
  }],
  policyLinks: [],
  subtotalCents: 10_000,
  shippingCents: 2_900,
  discountCents: 0,
  totalCents: 12_900,
  discountCode: null,
});

function isolated(script: string) {
  return spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    script,
  ], { encoding: "utf8" });
}

test("Node without getBuiltinModule parses a valid quote through the captured synchronous fallback", () => {
  const result = isolated(`
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    const { parseCheckoutQuote } = await import(${JSON.stringify(moduleUrl)});
    const parsed = parseCheckoutQuote(${fixture});
    if (parsed.storeName !== "Celebix") throw new Error("valid_quote_rejected");
  `);
  assert.equal(result.status, 0, result.stderr);
});

test("a post-startup getBuiltinModule monkeypatch cannot make a transparent proxy pass", () => {
  const result = isolated(`
    const { parseCheckoutQuote } = await import(${JSON.stringify(moduleUrl)});
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: () => ({ isProxy: () => false }),
      writable: true,
    });
    let rejected = false;
    try { parseCheckoutQuote(new Proxy(${fixture}, {})); }
    catch { rejected = true; }
    if (!rejected) throw new Error("transparent_proxy_accepted");
  `);
  assert.equal(result.status, 0, result.stderr);
});
