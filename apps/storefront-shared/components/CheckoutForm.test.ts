import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [form, summary, checkout, success, account, readiness] = await Promise.all([
  readFile(new URL("./CheckoutForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("./CheckoutSummary.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/checkout/success/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("./checkout-readiness.ts", import.meta.url), "utf8"),
]);

test("checkout form has bounded two-step delivery and server-projected payment controls", () => {
  for (const proof of ["Teslimat", "Ödeme", "paymentMethods", "bank_transfer", "cash_on_delivery", "aria-live", "pending"]) assert.match(form, new RegExp(proof, "u"));
  assert.match(form, /disabled=\{pending/u);
  for (const field of ["name", "email", "phone", "addressLine1", "city", "district", "postalCode", "note"]) assert.equal(form.includes(`name="${field}"`), true, field);
  assert.match(form, /validateCheckoutFormDraft/u);
  assert.match(form, /const value = event\.currentTarget\.value;[\s\S]*setDraft\(\(current\).*\[name\]: value/u);
  assert.doesNotMatch(form, /setDraft\(\(current\)[\s\S]{0,160}event\.currentTarget/u);
});

test("checkout submission contains only the exact server-owned contract and fixed success path", () => {
  for (const proof of ["operationId", "cartVersion", "intentKind", "contact", "shippingAddress", "shippingMethod", "paymentKind", "note"]) assert.match(form, new RegExp(proof, "u"));
  assert.match(form, /\/api\/checkout\/complete/u);
  assert.match(form, /\/checkout\/success/u);
  assert.doesNotMatch(form, /priceCents\s*:|shippingCents\s*:|iban\s*:|storeId|tenantId|customerId|orderId|credential(?:Id|Value|Cookie)/u);
});

test("checkout maps finite quote failures without inventing a payment option", () => {
  for (const proof of ["StorefrontCartClientError", "checkoutFailureMessage", "payment_unavailable", "Ödeme yöntemi henüz yapılandırılmadı."]) assert.match(`${form}\n${readiness}`, new RegExp(proof, "u"));
  assert.match(form, /!quote[?][.]cart[.]checkoutReady/u);
  assert.doesNotMatch(form, /paymentMethods\s*=|bank_transfer[^\n]+push|cash_on_delivery[^\n]+push/u);
});

test("checkout summary receipt and account render truthful public projections only", () => {
  for (const proof of ["Ara toplam", "Kargo", "Toplam"]) assert.match(summary, new RegExp(proof, "u"));
  assert.match(checkout, /intent=buy-now|buy_now/u);
  for (const proof of ["orderReference", "paymentMethod", "bankName", "accountHolder", "iban", "Sipariş alındı"]) assert.match(success, new RegExp(proof, "u"));
  for (const proof of ["listAccountOrders", "Siparişlerim", "orderReference"]) assert.match(account, new RegExp(proof, "u"));
  assert.doesNotMatch(`${success}\n${account}`, /orderId|customerId|storeId|tenantId|credential/u);
});
