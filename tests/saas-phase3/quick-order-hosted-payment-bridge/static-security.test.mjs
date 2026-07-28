import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607280058_quick_order_hosted_payment_bridge.up.sql";
const DOWN = "202607280058_quick_order_hosted_payment_bridge.down.sql";
const ASSERTIONS = "202607280058_quick_order_hosted_payment_bridge_assertions.sql";
const MANIFEST = "phase3q-quick-order-hosted-payment-bridge-manifest.json";
const source = (file) => readFileSync(path.join(SQL, file), "utf8");

test("058 makes inventory reservations exact legacy XOR generic owners", () => {
  const up = source(UP);
  assert.match(up, /ADD COLUMN payment_attempt_id uuid/);
  assert.match(up, /checkout_inventory_reservations_one_attempt_owner_check/);
  assert.match(up, /attempt_id IS NOT NULL AND payment_attempt_id IS NULL/);
  assert.match(up, /attempt_id IS NULL AND payment_attempt_id IS NOT NULL/);
  assert.match(up, /FOREIGN KEY \(store_id,payment_attempt_id\)[\s\S]*payment_attempts\(store_id,id\)/);
  assert.match(up, /OLD[.]payment_attempt_id IS DISTINCT FROM NEW[.]payment_attempt_id/);
});

test("058 derives hosted begin authority from host redemption link method profile basket and stock", () => {
  const up = source(UP);
  assert.match(up, /CREATE FUNCTION saas[.]quick_order_hosted_payment_authority\(/);
  assert.match(up, /CREATE FUNCTION saas[.]quick_order_hosted_payment_begin\(/);
  assert.match(up, /store_domains[\s\S]*quick_order_redemption_sessions[\s\S]*quick_order_links/);
  assert.match(up, /quick_order_link_hosted_authorities[\s\S]*payment_methods[\s\S]*merchant_provider_profiles/);
  assert.match(up, /merchant_provider_execution_authority_matches/);
  assert.match(up, /quick_order_link_items[\s\S]*product_variants/);
  assert.match(up, /payment_attempt_begin\(/);
  assert.match(up, /INSERT INTO saas[.]checkout_inventory_reservations/);
  assert.doesNotMatch(up, /p_store_id|p_payment_method_id|p_amount_minor|p_currency/);
});

test("captured settlement and failure release occur inside payment attempt transaction", () => {
  const up = source(UP);
  assert.match(up, /CREATE FUNCTION saas[.]quick_order_hosted_payment_terminal_transition\(\)/);
  assert.match(up, /AFTER UPDATE OF status ON saas[.]payment_attempts/);
  assert.match(up, /NEW[.]status='captured'/);
  assert.match(up, /INSERT INTO saas[.]orders/);
  assert.match(up, /INSERT INTO saas[.]order_items/);
  assert.match(up, /INSERT INTO saas[.]order_events/);
  assert.match(up, /status='consumed'/);
  assert.match(up, /stock_quantity=variant[.]stock_quantity-reservation[.]quantity/);
  assert.match(up, /NEW[.]status IN\('failed','cancelled','expired'\)/);
  assert.match(up, /status='released'/);
});

test("bridge rows are owner-only, forced RLS, immutable and rollback drain locked", () => {
  const joined = `${source(UP)}\n${source(ASSERTIONS)}`;
  assert.match(joined, /quick_order_hosted_payment_bridges ENABLE ROW LEVEL SECURITY/);
  assert.match(joined, /quick_order_hosted_payment_bridges FORCE ROW LEVEL SECURITY/);
  assert.match(joined, /REVOKE ALL ON (?:TABLE )?saas[.]quick_order_hosted_payment_bridges/);
  assert.match(joined, /QUICK_ORDER_HOSTED_PAYMENT_BRIDGE_IMMUTABLE/);
  assert.match(source(DOWN), /QUICK_ORDER_HOSTED_PAYMENT_BRIDGE_ROLLBACK_REQUIRES_DRAIN/);
  assert.match(joined, /payment_attempt_quick_order_terminal/);
  assert.match(joined, /quick_order_hosted_payment_terminal_transition/);
  assert.match(joined, /checkout_payment_attempts_no_generic_parallel/);
  assert.match(joined, /checkout_inventory_reservations_transition/);
  assert.match(joined, /trigger_info[.]tgenabled='O'/);
  assert.doesNotMatch(joined, /GRANT SELECT[^;]*quick_order_hosted_payment_bridges/is);
  assert.doesNotMatch(`${source(UP)}\n${source(DOWN)}`, /\bCASCADE\b|dblink|postgres_fdw|EXECUTE\s+format/i);
});

test("server route keeps operation-only browser input and DB-derived hosted facts", () => {
  const hosted = readFileSync(path.join(ROOT, "apps/storefront-shared/lib/checkout/hosted-payment.ts"), "utf8");
  const route = readFileSync(path.join(ROOT, "apps/storefront-shared/app/api/quick-order/checkout/route.ts"), "utf8");
  const runtime = readFileSync(path.join(ROOT, "apps/storefront-shared/lib/default-runtime.ts"), "utf8");
  assert.match(hosted, /operation_id=/);
  assert.match(hosted, /hostedPayments[.]getAuthority/);
  assert.match(hosted, /openQuickLinkSecret/);
  assert.match(hosted, /purpose:\s*"buyer-identity"/);
  assert.match(hosted, /providerCode !== "iyzico_iframe"/);
  assert.match(hosted, /presentation[.]kind === "redirect"/);
  assert.doesNotMatch(hosted, /body[.](?:storeId|paymentMethodId|amountMinor|currency|customer|basket)/);
  assert.match(hosted, /runtime === null\) return dependencies[.]fallback\(request\)/);
  assert.match(runtime, /runtime === null[\s\S]*quickOrderHostedBridgeInitialization = undefined/);
  assert.match(runtime, /quick_order_hosted_payment_bridge_preflight/);
  assert.match(route, /createQuickOrderHostedPaymentBridgeRoute/);
  assert.match(route, /createQuickOrderCheckoutRoute/);
});

test("phase3q manifest and cumulative suite include the PostgreSQL 16 gate", () => {
  const manifest = JSON.parse(source(MANIFEST));
  const previous = JSON.parse(source("phase3p-quick-order-hosted-payment-authority-manifest.json"));
  assert.equal(manifest.phase, "phase3q-quick-order-hosted-payment-bridge");
  assert.deepEqual(manifest.migrationChain.slice(0, -2), previous.migrationChain);
  assert.deepEqual(manifest.migrationChain.slice(-2).map(({ file }) => file), [UP, ASSERTIONS]);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN]);
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  for (const artifact of [...manifest.migrationChain, ...manifest.rollbackArtifacts]) {
    assert.equal(createHash("sha256").update(source(artifact.file)).digest("hex"), artifact.sha256, artifact.file);
  }
  const runner = readFileSync(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  assert.match(runner, /quick-order-hosted-payment-bridge[/]postgres-harness[.]mjs/);
});
