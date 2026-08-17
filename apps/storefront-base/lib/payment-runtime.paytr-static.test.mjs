import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./payment-runtime.ts", import.meta.url), "utf8");
const providersSource = readFileSync(new URL("./payment-providers.ts", import.meta.url), "utf8");
const paymentTypesSource = readFileSync(new URL("../types/payment.ts", import.meta.url), "utf8");

test("PayTR runtime uses the shared checkout presentation helper", () => {
  assert.match(source, /createPaytrCheckoutPresentation/);
  assert.match(source, /createPaytrCheckoutPresentation\(\{\s*gateway:\s*context\.gateway\.gateway/);
});

test("PayTR iframe gateway stays in the storefront provider catalog", () => {
  assert.match(paymentTypesSource, /\|\s+"paytr_iframe"/);
  assert.match(providersSource, /PAYTR_FAMILY_GATEWAYS\s*=\s*\["paytr",\s*"paytr_iframe"\]/);
  assert.match(providersSource, /id:\s*"paytr_iframe"/);
  assert.match(providersSource, /createPaytrCheckoutPresentation/);
  assert.match(providersSource, /gateway === "paytr_iframe"[\s\S]*action:\s*"iframe"/);
});

test("PayTR token request keeps provider signing secrets out of the POST body", () => {
  assert.doesNotMatch(source, /merchant_key:\s*merchantKey/);
  assert.doesNotMatch(source, /merchant_salt:\s*merchantSalt/);
  assert.match(source, /createPaytrToken\(\{[\s\S]*merchantKey,[\s\S]*merchantSalt,/);
});
