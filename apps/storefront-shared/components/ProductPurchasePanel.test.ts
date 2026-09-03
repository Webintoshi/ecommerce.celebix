import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./ProductPurchasePanel.tsx", import.meta.url),
  "utf8",
);
const experienceSource = await readFile(
  new URL("./ProductDetailExperience.tsx", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../app/products/[slug]/page.tsx", import.meta.url),
  "utf8",
);

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

test("purchase panel bounds the accessible stepper to tracked variant stock", () => {
  assert.match(source, /available:\s*boolean/u);
  assert.match(source, /quantityLimit/u);
  assert.match(source, /quantity <= quantityLimit/u);
  assert.match(source, /incrementPurchaseQuantity\(value, quantityLimit\)/u);
  assert.match(source, /aria-label="Adedi azalt"/u);
  assert.match(source, /aria-label="Adedi artır"/u);
  assert.match(source, /decrementPurchaseQuantity/u);
  assert.match(source, /incrementPurchaseQuantity/u);
  assert.doesNotMatch(source, /purchase-stock/u);
  assert.doesNotMatch(source, /type="number"/u);
});

test("one default variant does not create a redundant selection step", () => {
  assert.match(source, /showVariantChoices/u);
  assert.match(source, /product[.]variants[.]length > 1/u);
  assert.match(source, /showVariantChoices\s*[?]\s*[(]?\s*<fieldset/u);
});

test("published quantity visibility reaches the purchase panel without browser authority", () => {
  assert.match(pageSource, /presentation[.]cart[.]showQuantitySelector/u);
  assert.match(pageSource, /showQuantitySelector=/u);
  assert.match(experienceSource, /showQuantitySelector:[ ]*boolean/u);
  assert.match(
    experienceSource,
    /showQuantitySelector=[{]showQuantitySelector[}]/u,
  );
  assert.doesNotMatch(pageSource, /localStorage|sessionStorage|searchParams/u);
});

test("purchase panel hides the stepper and retains a one-item default when disabled", () => {
  assert.match(source, /showQuantitySelector[ ]*=[ ]*true/u);
  assert.match(
    source,
    /showQuantitySelector\s*[?]\s*[(]?\s*<div className="purchase-quantity"/u,
  );
  assert.match(source, /is-quantity-hidden/u);
  assert.match(source, /useState\(1\)/u);
});
