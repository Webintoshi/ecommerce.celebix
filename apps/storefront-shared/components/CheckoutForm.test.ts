import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [form, summary, checkout, success, hostedResult, account, readiness, css] = await Promise.all([
  readFile(new URL("./CheckoutForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("./CheckoutSummary.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/checkout/success/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/checkout/payment/result/page.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("./checkout-readiness.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("checkout renders delivery and server-projected payment on one screen", () => {
  for (const proof of [
    'className="checkout-section checkout-contact"',
    'className="checkout-section checkout-delivery"',
    'className="checkout-section checkout-shipping"',
    'className="checkout-section checkout-payment"',
    "paymentMethods",
    "validateCheckoutFormDraft",
    "Siparişi tamamla",
  ]) assert.match(form, new RegExp(proof, "u"));
  assert.doesNotMatch(form, /setStep|step ===|Teslimata dön|Ödemeye devam et/u);
  for (const field of ["name", "email", "phone", "addressLine1", "city", "district", "postalCode", "note"]) assert.equal(form.includes(`name="${field}"`), true, field);
  assert.match(form, /const value = event\.currentTarget\.value;[\s\S]*setDraft\(\(current\).*\[name\]: value/u);
  assert.doesNotMatch(form, /setDraft\(\(current\)[\s\S]{0,160}event\.currentTarget/u);
});

test("checkout submission contains only the exact server-owned contract and fixed success path", () => {
  for (const proof of ["operationId", "cartVersion", "intentKind", "contact", "shippingAddress", "shippingMethod", "paymentKind", "note"]) assert.match(form, new RegExp(proof, "u"));
  assert.match(form, /\/api\/checkout\/complete/u);
  assert.match(form, /\/checkout\/success/u);
  assert.doesNotMatch(form, /priceCents\s*:|shippingCents\s*:|iban\s*:|storeId|tenantId|customerId|orderId|credential(?:Id|Value|Cookie)/u);
});

test("hosted card uses the fixed start route and renders only provider-required identity", () => {
  for (const proof of ["hosted_card", "requiredCustomerFields", "identityNumber", "startHosted", "Güvenli ödemeye geç"]) {
    assert.match(form, new RegExp(proof, "u"));
  }
  assert.doesNotMatch(form, /fetch\(["']\/api\/checkout\/payment\/start/u);
  assert.doesNotMatch(form, /cardNumber|cvv|cvc|expiry|holderName/u);
});

test("hosted payment result trusts server status and never query-string success", () => {
  for (const proof of ["hostedCheckout.status", "captured", "processing", "stock_conflict", "getReceipt", "/cart"]) {
    assert.match(hostedResult, new RegExp(proof, "u"));
  }
  assert.doesNotMatch(hostedResult, /searchParams|[?](?:durum|success)=|providerReference|paymentAttempt/u);
});

test("checkout maps finite quote failures without inventing a payment option", () => {
  for (const proof of ["StorefrontCartClientError", "checkoutFailureMessage", "payment_unavailable", "Ödeme yöntemi henüz yapılandırılmadı."]) assert.match(`${form}\n${readiness}`, new RegExp(proof, "u"));
  assert.match(form, /!quote[?][.]cart[.]checkoutReady/u);
  assert.doesNotMatch(form, /paymentMethods\s*=|bank_transfer[^\n]+push|cash_on_delivery[^\n]+push/u);
});

test("hosted checkout start maps safe backend failures to customer-facing checkout guidance", () => {
  assert.match(form, /catch \(error: unknown\)/u);
  assert.match(
    form,
    /error instanceof StorefrontCartClientError\s*[?]\s*checkoutFailureMessage\(error[.]code\)/u,
  );
  assert.doesNotMatch(form, /catch\s*\{\s*setStatus\("Sipariş tamamlanamadı/u);
});

test("checkout summary receipt and account render truthful public projections only", () => {
  for (const proof of ["Ara toplam", "Kargo", "Toplam"]) assert.match(summary, new RegExp(proof, "u"));
  assert.match(checkout, /intent=buy-now|buy_now/u);
  for (const proof of ["orderReference", "paymentMethod", "bankName", "accountHolder", "iban", "Sipariş alındı"]) assert.match(success, new RegExp(proof, "u"));
  for (const proof of ["AccountDashboard", "snapshot", "resolveAccountPage"]) assert.match(account, new RegExp(proof, "u"));
  assert.doesNotMatch(`${success}\n${account}`, /orderId|customerId|storeId|tenantId|credential/u);
});

test("authenticated customers receive a server-authorized checkout prefill while guest checkout remains optional", () => {
  assert.match(checkout, /runtime[.]identity/u);
  assert.match(checkout, /initialDraft/u);
  assert.match(form, /initialDraft/u);
});

test("checkout owns a white single-screen shell and canonical media summary", () => {
  assert.match(checkout, /className="checkout-page"/u);
  assert.doesNotMatch(checkout, /<main className="checkout-page"/u);
  assert.doesNotMatch(hostedResult, /<main className="checkout-result-page/u);
  assert.match(summary, /item[.]media[.]url/u);
  assert.match(summary, /item[.]media[.]altText/u);
  assert.equal(css.includes("background: var(--white)"), true);
  for (const proof of ["checkout-page", "checkout-section", "checkout-summary-line", "min-height: 48px"]) assert.match(css, new RegExp(proof, "u"));
});

test("checkout keeps its server summary snapshot stable until its client boundary hydrates", () => {
  assert.match(form, /useHydrated/u);
  assert.match(form, /const visibleCart = hydrated \? cart : null/u);
  assert.match(form, /const visibleCartLoading = !hydrated \|\| cartLoading/u);
  assert.match(
    form,
    /resolveCheckoutSummaryState\(\s*intentKind,\s*quote,\s*visibleCart,/u,
  );
});
