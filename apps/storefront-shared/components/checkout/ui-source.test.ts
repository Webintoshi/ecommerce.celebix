import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(name: string): Promise<string> {
  return readFile(new URL(name, import.meta.url), "utf8");
}

test("checkout client owns the server-quote and bounded request workflow", async () => {
  const value = await source("./CheckoutClient.tsx");
  assert.match(value, /parseCheckoutQuote/);
  assert.match(value, /parseCheckoutHttpError/);
  assert.match(value, /new AbortController/);
  assert.match(value, /\/api\/checkout\/delivery/);
  assert.match(value, /application\/json/);
  assert.match(value, /reduceCheckout/);
  assert.doesNotMatch(value, /subtotalCents\s*[+*=-]|totalCents\s*[+*=-]/);
  assert.doesNotMatch(value, /analytics|console[.]/i);
});

test("delivery uses accessible canonical fields and an explicit update action", async () => {
  const value = await source("./DeliverySection.tsx");
  for (const heading of ["İletişim", "Teslimat", "Kargo yöntemi"]) {
    assert.match(value, new RegExp(`>${heading}<`));
  }
  for (const autocomplete of [
    "email",
    "given-name",
    "family-name",
    "tel",
    "address-line1",
    "address-line2",
    "address-level2",
    "address-level1",
    "postal-code",
  ]) {
    assert.match(value, new RegExp(`autoComplete="${autocomplete}"`));
  }
  assert.match(value, /<fieldset/);
  assert.match(value, /type="submit"/);
  assert.match(value, /Bilgileri uygula/);
});

test("payment exposes hosted providers without collecting cards and requests identity only for iyzico", async () => {
  const value = await source("./PaymentSection.tsx");
  assert.match(value, />Ödeme</);
  assert.match(value, /selectedMethod[.]providerCode === "iyzico_iframe"/);
  assert.match(value, /name="identityNumber"/);
  assert.match(value, /autoComplete="off"/);
  assert.match(value, /quote[.]policyLinks/);
  assert.match(value, /name="distanceSales"/);
  assert.match(value, /name="preInformation"/);
  assert.match(value, /required/);
  assert.match(value, /"Siparişi tamamla"/);
  assert.doesNotMatch(value, /cardNumber|cvv|cvc|expiry|express|wallet/i);
});

test("summary has the exact desktop aside and mobile disclosure anatomy", async () => {
  const value = await source("./OrderSummary.tsx");
  assert.match(value, /<aside[^>]*aria-label="Sipariş özeti"/);
  assert.match(value, /aria-expanded=\{props[.]open\}/);
  assert.match(value, />Sipariş özeti</);
  assert.match(value, />Ara toplam</);
  assert.match(value, />Kargo</);
  assert.match(value, /<dt>Toplam/);
});

test("fixed checkout page and CSS stay isolated from every storefront theme", async () => {
  const [page, css, policy] = await Promise.all([
    readFile(new URL("../../app/odeme/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/odeme/checkout.module.css", import.meta.url), "utf8"),
    readFile(new URL("../../app/politikalar/[policyType]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /title: "Güvenli ödeme"/);
  assert.match(page, /referrer: "no-referrer"/);
  assert.doesNotMatch(page, /components\/(?:Header|Footer|StorefrontFrame)|theme/i);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*690px\)\s+minmax\(0,\s*590px\)/);
  assert.match(css, /max-width:\s*499px/);
  assert.match(css, /background:\s*#f5f5f5/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(policy, /whiteSpace:\s*"pre-wrap"/);
  assert.doesNotMatch(policy, /dangerouslySetInnerHTML|Supabase/i);
});
