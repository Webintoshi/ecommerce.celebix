import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const BASE = "bbe68885986279f8642f1852ac3db74eb8bc06ab";
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("read-only donors remain byte-for-byte unchanged from the implementation base", () => {
  const changed = execFileSync("git", ["diff", "--name-only", BASE, "--", "apps/admin", "apps/storefront-base"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(changed, "");
});

test("browser commerce surfaces contain no tenant or durable private authority", () => {
  const files = ["ProductPurchasePanel.tsx", "CartPageClient.tsx", "CartStatusProvider.tsx", "CheckoutForm.tsx", "StoreUtilities.tsx"];
  for (const file of files) {
    const source = read(`apps/storefront-shared/components/${file}`);
    assert.doesNotMatch(source, /storeId|tenantId|membershipId|planId|customerId|orderId|credential(?:Id|Value|Digest|Cookie)|\/api\/admin|supabase/iu, file);
    assert.doesNotMatch(source, /document[.]cookie|localStorage|sessionStorage/iu, file);
  }
});

test("commerce cookies are exact purpose-bound secure HttpOnly host cookies", () => {
  const source = read("apps/storefront-shared/lib/cart/credential.ts");
  for (const name of ["__Host-celebix_cart", "__Host-celebix_checkout_intent", "__Host-celebix_customer", "__Host-celebix_receipt"]) assert.match(source, new RegExp(name, "u"));
  assert.match(source, /HttpOnly; Secure; SameSite=Lax/u);
  assert.doesNotMatch(source, /Domain=|SameSite=None|document[.]cookie/iu);
});

test("storefront CSP permits exact same-origin commerce calls without broad network authority", () => {
  const proxy = read("apps/storefront-shared/proxy.ts");
  assert.match(proxy, /connectDestination=analytics\?`'self' \$\{analytics[.]collectorOrigin\}`:"'self'"/u);
  assert.match(proxy, /connect-src \$\{connectDestination\}/u);
  assert.doesNotMatch(proxy, /connect-src (?:\*|https:)|connect-src[^;]*\*|unsafe-eval/iu);
  assert.match(proxy, /frame-ancestors 'none'/u);
  assert.match(proxy, /base-uri 'none'/u);
});

test("seven fixed policy routes and all truthful commerce destinations are mounted", () => {
  const [contracts, footer, utilities, product, cart, checkout] = [
    read("packages/saas-contracts/src/storefront/commerce.ts"), read("apps/storefront-shared/components/Footer.tsx"),
    read("apps/storefront-shared/components/StoreUtilities.tsx"), read("apps/storefront-shared/components/ProductPurchasePanel.tsx"),
    read("apps/storefront-shared/components/CartPageClient.tsx"), read("apps/storefront-shared/components/CheckoutForm.tsx"),
  ];
  assert.equal((contracts.match(/route: "\/policies\//gu) ?? []).length, 7);
  assert.match(footer, /FIXED_STOREFRONT_POLICIES[.]map/u);
  for (const destination of ["/search", "/favorites", "/account", "/cart"]) assert.match(utilities, new RegExp(destination.replaceAll("/", "\\/"), "u"));
  assert.match(product, /storefrontCartClient[.]add/u);
  assert.match(product, /storefrontCartClient[.]buyNow/u);
  assert.match(cart, /href="\/checkout"/u);
  assert.match(checkout, /\/api\/checkout\/complete/u);
  assert.doesNotMatch(`${product}\n${cart}\n${checkout}`, /yakında|demo|placeholder action|disabled feature/iu);
});

test("default runtime preflights policy search durable commerce and checkout readiness migrations", () => {
  const runtime = read("apps/storefront-shared/lib/default-runtime.ts");
  assert.match(runtime, /migration_071/u);
  assert.match(runtime, /migration_072/u);
  assert.match(runtime, /migration_073/u);
  assert.match(runtime, /row[.]migration_071 !== true/u);
  assert.match(runtime, /row[.]migration_072 !== true/u);
  assert.match(runtime, /row[.]migration_073 !== true/u);
});

test("browser acceptance contract owns the exact responsive matrix and untracked artifact root", () => {
  const browser = read("tests/saas-phase3/starter-commerce/browser-acceptance.mjs");
  for (const viewport of ["1440, 900", "1025, 768", "1024, 768", "390, 844", "320, 720"]) assert.match(browser, new RegExp(viewport, "u"));
  assert.match(browser, /[.]codex-artifacts\/starter-commerce/u);
  assert.match(browser, /horizontalOverflow/u);
  assert.match(browser, /minimumTarget/u);
  assert.match(browser, /primaryContrast/u);
  assert.match(browser, /reducedMotionDuration/u);
});
