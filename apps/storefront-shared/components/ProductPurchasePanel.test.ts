import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ProductPurchasePanel.tsx", import.meta.url), "utf8");

test("purchase panel requires an available variant and exposes both real purchase actions", () => {
  assert.match(source, /type="radio"/u);
  assert.match(source, /variant[.]available/u);
  assert.match(source, /Sepete ekle/u);
  assert.match(source, /Şimdi satın al/u);
  assert.match(source, /storefrontCartClient[.]add/u);
  assert.match(source, /replaceCart/u);
  assert.match(source, /router[.]push\("\/checkout"\)/u);
  assert.doesNotMatch(source, /window[.]location/u);
});

test("purchase panel is bounded while pending and reports finite accessible status", () => {
  assert.match(source, /aria-live="polite"/u);
  assert.match(source, /disabled=\{pending/u);
  assert.doesNotMatch(source, /priceCents\s*:/u);
  assert.doesNotMatch(source, /storeId|tenantId|credential/u);
});
