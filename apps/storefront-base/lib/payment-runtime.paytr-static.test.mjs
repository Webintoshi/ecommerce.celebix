import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./payment-runtime.ts", import.meta.url), "utf8");

test("PayTR token request sends every provider credential field required by PayTR iframe", () => {
  assert.match(source, /merchant_key:\s*merchantKey/);
  assert.match(source, /merchant_salt:\s*merchantSalt/);
});

test("PayTR checkout returns an iframe presentation instead of redirecting away from checkout", () => {
  assert.match(source, /action:\s*"iframe"/);
  assert.match(source, /iframeUrl:\s*`https:\/\/www\.paytr\.com\/odeme\/guvenli\/\$\{encodeURIComponent\(token\)\}`/);
});

test("PayTR initialization fails closed before token request for local or private customer IPs", () => {
  assert.match(source, /assertPaytrCustomerIp\(context\.customerIp\)/);
  assert.match(source, /PAYTR icin musteri dis IP adresi alinamadi/);
});
