import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("PayTR checkout presentation supports iframe and redirect modes", () => {
  assert.match(source, /export function createPaytrCheckoutPresentation/);
  assert.match(source, /input\.gateway === "paytr_iframe"/);
  assert.match(source, /action:\s*"iframe"/);
  assert.match(source, /iframeUrl:\s*paymentUrl/);
  assert.match(source, /action:\s*"redirect"/);
  assert.match(source, /redirectUrl:\s*paymentUrl/);
});

