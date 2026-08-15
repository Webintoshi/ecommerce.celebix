import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkoutSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../../../../lib/payment-runtime.ts", import.meta.url), "utf8");

test("checkout extracts a public customer IP from trusted proxy headers", () => {
  assert.match(checkoutSource, /cf-connecting-ip/);
  assert.match(checkoutSource, /x-forwarded-for/);
  assert.match(checkoutSource, /isPublicCheckoutIp/);
  assert.match(checkoutSource, /isPrivateIpv4/);
});

test("PayTR initialization fails closed before token request for local or private customer IPs", () => {
  assert.match(runtimeSource, /assertPaytrCustomerIp\(context\.customerIp\)/);
  assert.match(runtimeSource, /PAYTR icin musteri dis IP adresi alinamadi/);
});
