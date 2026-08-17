import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./payment-runtime.ts", import.meta.url), "utf8");

test("PayTR runtime uses the shared checkout presentation helper", () => {
  assert.match(source, /createPaytrCheckoutPresentation/);
  assert.match(source, /createPaytrCheckoutPresentation\(\{\s*gateway:\s*context\.gateway\.gateway/);
});

test("PayTR token request keeps provider signing secrets out of the POST body", () => {
  assert.doesNotMatch(source, /merchant_key:\s*merchantKey/);
  assert.doesNotMatch(source, /merchant_salt:\s*merchantSalt/);
  assert.match(source, /createPaytrToken\(\{[\s\S]*merchantKey,[\s\S]*merchantSalt,/);
});
