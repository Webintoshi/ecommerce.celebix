import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("standard checkout browser surfaces expose no provider or tenant authority", () => {
  const form = read("apps/storefront-shared/components/CheckoutForm.tsx");
  const client = read("apps/storefront-shared/lib/cart/client.ts");
  const startRoute = read("apps/storefront-shared/app/api/checkout/payment/start/route.ts");
  const presentationRoute = read("apps/storefront-shared/app/checkout/payment/route.ts");
  const resultPage = read("apps/storefront-shared/app/checkout/payment/result/page.tsx");
  const browser = `${form}\n${client}\n${resultPage}`;

  assert.match(form, /storefrontCartClient[.]startHosted/u);
  assert.doesNotMatch(form, /fetch[(]["']\/api\/checkout\/payment\/start/u);
  assert.match(client, /root[.]destination !== "\/checkout\/payment"/u);
  assert.match(startRoute, /selectTrustedStorefrontHostAuthority/u);
  assert.match(presentationRoute, /runtime[.]presentation/u);
  assert.match(resultPage, /hostedCheckout[.]status/u);
  assert.match(resultPage, /runtime[.]cart[.]getReceipt/u);
  assert.doesNotMatch(resultPage, /searchParams|[?](?:durum|success)=|providerReference|paymentAttempt/u);
  assert.doesNotMatch(browser, /merchant_(?:key|salt)|api[_-]?secret|private[_-]?key|Authorization|sealedPresentation|credentialDigest|storeId|tenantId/iu);
  assert.doesNotMatch(browser, /https?:\/\//u);
});

test("hosted checkout cookie and server runtime remain purpose-bound and log-free", () => {
  const credential = read("apps/storefront-shared/lib/cart/credential.ts");
  const runtime = read("apps/storefront-shared/lib/checkout/standard-hosted-payment.ts");
  const statusRepository = read("packages/saas-data/src/storefront-hosted-checkout/repository.ts");

  assert.match(credential, /__Host-celebix_hosted_checkout/u);
  assert.match(credential, /hosted_checkout: Object[.]freeze[(]\{[^}]+path: "\/"/u);
  assert.match(runtime, /^import "server-only";/u);
  assert.match(runtime, /serializeStandardHostedCheckoutCookie/u);
  assert.match(runtime, /sealQuickLinkSecret/u);
  assert.match(statusRepository, /public_storefront_hosted_checkout_status/u);
  assert.doesNotMatch(`${runtime}\n${statusRepository}`, /console[.]|logger[.]/iu);
});

test("only durable captured settlement creates a completed receipt", () => {
  const settlement = read("apps/owner/scripts/sql/saas/202608060092_storefront_hosted_checkout_settlement.up.sql");
  const result = read("apps/storefront-shared/app/checkout/payment/result/page.tsx");
  assert.match(settlement, /IF NEW[.]status NOT IN[(]'captured','failed','cancelled','expired'[)] THEN RETURN NEW/u);
  assert.match(settlement, /'paymentStatus','completed'/u);
  assert.match(settlement, /INSERT INTO saas[.]storefront_checkout_operations/u);
  assert.match(settlement, /status='stock_conflict'/u);
  assert.match(result, /hostedStatus[?][.]status === "captured"[\s\S]*getReceipt/u);
  assert.doesNotMatch(result, /safeCode|sessionId|version|paymentSessionExpiresAt/u);
});

test("cumulative suite requires the standard hosted checkout lifecycle", () => {
  const runner = read("tests/saas-phase3/run-current-suite.mjs");
  assert.match(runner, /storefront-hosted-checkout[/]postgres-harness[.]mjs/u);
  assert.match(runner, /storefront-hosted-payment-security[.]test[.]mjs/u);
  assert.match(runner, /total: 33/u);
  assert.match(runner, /33\\\/33 PASS/u);
});
