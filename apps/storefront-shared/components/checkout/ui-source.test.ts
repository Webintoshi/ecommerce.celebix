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
  assert.match(value, /createCheckoutCommerceEvent/);
  for (const event of [
    "checkout_started",
    "checkout_delivery_saved",
    "checkout_submitted",
    "checkout_failed",
  ]) {
    assert.match(value, new RegExp(`"${event}"`));
  }
  assert.doesNotMatch(value, /subtotalCents\s*[+*=-]|totalCents\s*[+*=-]/);
  assert.doesNotMatch(value, /console[.]/i);
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
  assert.match(value, /field="distanceSales"/);
  assert.match(value, /field="preInformation"/);
  assert.match(value, /required/);
  assert.match(value, /"Siparişi tamamla"/);
  assert.doesNotMatch(value, /cardNumber|cvv|cvc|expiry|express|wallet/i);
  assert.match(value, /providerCode === "iyzico_iframe"\s*\? "iyzico"/);
  assert.match(value, /providerCode === "paytr_iframe"\s*\? "PayTR"/);
  assert.match(value, /<img alt=""/);
});

test("payment details are one selected sibling panel and consent copy is outside checkbox hitboxes", async () => {
  const [payment, css] = await Promise.all([
    source("./PaymentSection.tsx"),
    readFile(new URL("../../app/odeme/checkout.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(payment, /checkout-payment-details/);
  assert.match(payment, /checkout-consent-control/);
  assert.match(payment, /checkout-consent-copy/);
  assert.match(payment, /aria-labelledby=/);
  assert.doesNotMatch(payment, /<label className="checkout-check">/);
  assert.match(css, /grid-template-columns:\s*44px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /checkout-consent-control:has\(input:checked\)::after/);
  assert.match(css, /checkout-footer\)[\s\S]*?font-size:\s*14px/);
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

test("checkout forms wire field errors, native invalid events, and safe JS navigation", async () => {
  const [client, delivery, payment] = await Promise.all([
    source("./CheckoutClient.tsx"),
    source("./DeliverySection.tsx"),
    source("./PaymentSection.tsx"),
  ]);
  assert.match(client, /requestCheckoutSubmission/);
  assert.match(client, /window[.]location[.]assign\(result[.]location\)/);
  assert.match(client, /state[.]pending !== null/);
  assert.match(client, /submitAbort/);
  assert.match(client, /assessDeliveryAuthority/);
  assert.match(client, /deliveryFormRef[.]current/);
  assert.doesNotMatch(client, /document[.]getElementById\(DELIVERY_FORM_ID\)/);
  assert.match(client, /Teslimat bilgilerindeki değişiklikleri uygulayın[.]/);
  assert.match(client, /checkout-delivery-apply/);
  for (const value of [delivery, payment]) {
    assert.match(value, /aria-invalid(?:=|":)/);
    assert.match(value, /aria-describedby(?:=|":)/);
    assert.match(value, /onInvalid(?:=|:)/);
    assert.match(value, /checkout-field-error/);
    assert.match(value, /queueMicrotask/);
    assert.match(value, /querySelector<HTMLElement>\(":invalid"\)/);
  }
});
