import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202608060090_storefront_hosted_checkout_foundation.up.sql",
  down: "202608060090_storefront_hosted_checkout_foundation.down.sql",
  assertions: "202608060090_storefront_hosted_checkout_foundation_assertions.sql",
  manifest: "phase4j-storefront-hosted-checkout-foundation-manifest.json",
});

const startFiles = Object.freeze({
  up: "202608060091_storefront_hosted_checkout_start.up.sql",
  down: "202608060091_storefront_hosted_checkout_start.down.sql",
  assertions: "202608060091_storefront_hosted_checkout_start_assertions.sql",
  manifest: "phase4k-storefront-hosted-checkout-start-manifest.json",
});

const settlementFiles = Object.freeze({
  up: "202608060092_storefront_hosted_checkout_settlement.up.sql",
  down: "202608060092_storefront_hosted_checkout_settlement.down.sql",
  assertions: "202608060092_storefront_hosted_checkout_settlement_assertions.sql",
  manifest: "phase4l-storefront-hosted-checkout-settlement-manifest.json",
});

function startSource(name: keyof typeof startFiles): string {
  const selected = new URL(startFiles[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

function settlementSource(name: keyof typeof settlementFiles): string {
  const selected = new URL(settlementFiles[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

function source(name: keyof typeof files): string {
  const selected = new URL(files[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

test("090 installs a private provider-neutral standard checkout session", () => {
  const up = source("up");
  assert.match(up, /CREATE TABLE saas[.]storefront_hosted_checkout_sessions/u);
  assert.match(up, /CREATE TABLE saas[.]storefront_hosted_checkout_operations/u);
  assert.match(up, /CHECK[(][\s\S]*cart_id IS NOT NULL[\s\S]*intent_id IS NULL[\s\S]*OR[\s\S]*cart_id IS NULL[\s\S]*intent_id IS NOT NULL/u);
  for (const value of ["active", "provider_ready", "processing", "captured", "failed", "expired", "stock_conflict"]) {
    assert.match(up, new RegExp(`'${value}'`, "u"), value);
  }
  assert.match(up, /ALTER TABLE saas[.]storefront_hosted_checkout_sessions FORCE ROW LEVEL SECURITY/u);
  assert.match(up, /ALTER TABLE saas[.]storefront_hosted_checkout_operations FORCE ROW LEVEL SECURITY/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_hosted_checkout/isu);
});

test("090 gives each reservation exactly one commerce owner and one payment attempt owner", () => {
  const up = source("up");
  assert.match(up, /ALTER COLUMN quick_order_link_id DROP NOT NULL/u);
  assert.match(up, /ADD COLUMN storefront_hosted_session_id uuid/u);
  assert.match(up, /checkout_inventory_reservations_commerce_owner_check/u);
  assert.match(up, /checkout_inventory_reservations_one_attempt_owner_check/u);
  assert.match(up, /checkout_inventory_reservations_standard_session_store_fk/u);
  assert.match(up, /checkout_inventory_reservations_standard_session_variant_key/u);
  assert.match(up, /OLD[.]storefront_hosted_session_id IS DISTINCT FROM NEW[.]storefront_hosted_session_id/u);
});

test("090 centralizes held-stock subtraction for every standard storefront path", () => {
  const up = source("up");
  assert.match(up, /CREATE FUNCTION saas[.]storefront_available_stock[\s\S]+p_excluded_session_id uuid/u);
  assert.match(up, /checkout_payment_attempts/u);
  assert.match(up, /quick_order_hosted_payment_bridges/u);
  assert.match(up, /storefront_hosted_checkout_sessions/u);
  assert.match(up, /p_excluded_session_id IS NULL[\s\S]+storefront_hosted_session_id IS DISTINCT FROM p_excluded_session_id/u);
  for (const name of [
    "public_cart_mutate", "public_buy_now_create", "storefront_cart_projection",
    "storefront_intent_projection", "public_checkout_complete",
  ]) {
    const declaration = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION saas[.]${name}\\([\\s\\S]+?(?=\\nCREATE|\\nREVOKE|\\nCOMMIT;)`, "u");
    const body = up.match(declaration)?.[0] ?? "";
    assert.match(body, /storefront_available_stock/u, name);
  }
  const quote = up.match(/CREATE OR REPLACE FUNCTION saas[.]public_checkout_quote[\s\S]+?(?=\nCREATE|\nREVOKE|\nCOMMIT;)/u)?.[0] ?? "";
  assert.match(quote, /storefront_cart_projection/u);
  assert.match(quote, /storefront_intent_projection/u);
});

test("090 projects no more than one execution-authorized hosted card", () => {
  const up = source("up");
  const projection = up.match(/CREATE OR REPLACE FUNCTION saas[.]storefront_payment_methods_projection[\s\S]+?(?=\nCREATE|\nREVOKE|\nCOMMIT;)/u)?.[0] ?? "";
  assert.match(projection, /kind','hosted_card/u);
  assert.match(projection, /paytr_iframe/u);
  assert.match(projection, /iyzico_iframe/u);
  assert.match(projection, /merchant_provider_execution_authority_matches/u);
  assert.match(projection, /LIMIT 1/u);
  assert.doesNotMatch(projection, /sealed_credentials|credential_digest|profileId/u);
});

test("090 rollback is drain-guarded and every artifact is digest pinned", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_DOWN_BLOCKED/u);
  assert.match(assertions, /STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID/u);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual(
    {
      phase: manifest.phase,
      postgresqlMajor: manifest.postgresqlMajor,
      externalConnections: manifest.externalConnections,
      productionMutations: manifest.productionMutations,
    },
    {
      phase: "phase4j-storefront-hosted-checkout-foundation",
      postgresqlMajor: 16,
      externalConnections: 0,
      productionMutations: 0,
    },
  );
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"], [files.down, "down"], [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
  for (const sql of [source("up"), down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/u);
    assert.match(sql, /COMMIT;\s*$/u);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//iu);
  }
});

test("091 exposes only the bounded hosted-checkout start lifecycle", () => {
  for (const name of Object.values(startFiles)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const up = startSource("up");
  for (const name of [
    "public_storefront_hosted_checkout_authority",
    "public_storefront_hosted_checkout_begin",
    "public_storefront_hosted_checkout_presentation_save",
    "public_storefront_hosted_checkout_presentation",
    "public_storefront_hosted_checkout_status",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}`, "u"), name);
  assert.match(up, /payment_attempt_begin/u);
  assert.match(up, /storefront_available_stock/u);
  assert.match(up, /merchant_provider_execution_authority_matches/u);
  assert.match(up, /merchant_provider_sealed_envelope_valid/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]+TO celebix_saas_host_resolver/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/iu);
  const publicStatus = up.match(/CREATE FUNCTION saas[.]public_storefront_hosted_checkout_status[\s\S]+?(?=\nREVOKE|\nCREATE|\nCOMMIT;)/u)?.[0] ?? "";
  assert.doesNotMatch(publicStatus, /sealed_credentials|profileId|delivery_snapshot|item_snapshot|customer_credential_digest/iu);
});

test("091 rollback is session-drain guarded and every start artifact is digest pinned", () => {
  const down = startSource("down");
  const assertions = startSource("assertions");
  assert.match(down, /STOREFRONT_HOSTED_CHECKOUT_START_DOWN_BLOCKED/u);
  assert.match(assertions, /STOREFRONT_HOSTED_CHECKOUT_START_CONTRACT_INVALID/u);
  const manifest = JSON.parse(startSource("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.equal(manifest.phase, "phase4k-storefront-hosted-checkout-start");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [startFiles.up, "up"], [startFiles.down, "down"], [startFiles.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("092 atomically settles standard hosted checkout from the payment attempt", () => {
  for (const name of Object.values(settlementFiles)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const up = settlementSource("up");
  assert.match(up, /CREATE FUNCTION saas[.]storefront_hosted_checkout_terminal_transition/u);
  assert.match(up, /CREATE TRIGGER payment_attempt_standard_checkout_terminal/u);
  assert.match(up, /AFTER UPDATE OF status ON saas[.]payment_attempts/u);
  assert.match(up, /INSERT INTO saas[.]orders/u);
  assert.match(up, /INSERT INTO saas[.]order_items/u);
  assert.match(up, /INSERT INTO saas[.]order_events/u);
  assert.match(up, /INSERT INTO saas[.]storefront_order_receipts/u);
  assert.match(up, /INSERT INTO saas[.]storefront_customer_credentials/u);
  assert.match(up, /INSERT INTO saas[.]storefront_checkout_operations/u);
  assert.match(up, /'paymentStatus','completed'/u);
  assert.match(up, /'paymentMethod',pg_catalog[.]jsonb_build_object[\s\S]*'kind','hosted_card'/u);
  assert.match(up, /status='consumed'/u);
  assert.match(up, /stock_quantity=variant[.]stock_quantity-reservation[.]quantity/u);
  assert.match(up, /stock_conflict/u);
  assert.match(up, /NEW[.]status IN[(]'provider_outcome_unknown','reconciliation_required'[)]/u);
});

test("092 exposes only bounded workflow expiry and reconciliation candidates", () => {
  const up = settlementSource("up");
  assert.match(up, /CREATE FUNCTION saas[.]storefront_hosted_checkout_expire_created/u);
  assert.match(up, /FOR UPDATE OF attempt SKIP LOCKED/u);
  assert.match(up, /CREATE FUNCTION saas[.]storefront_hosted_checkout_reconciliation_candidates/u);
  assert.match(up, /LIMIT CASE WHEN p_limit BETWEEN 1 AND 25/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]+TO celebix_saas_workflow/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/iu);
});

test("092 rollback is drain guarded and every settlement artifact is digest pinned", () => {
  const down = settlementSource("down");
  const assertions = settlementSource("assertions");
  assert.match(down, /STOREFRONT_HOSTED_CHECKOUT_SETTLEMENT_DOWN_BLOCKED/u);
  assert.match(assertions, /STOREFRONT_HOSTED_CHECKOUT_SETTLEMENT_CONTRACT_INVALID/u);
  const manifest = JSON.parse(settlementSource("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.equal(manifest.phase, "phase4l-storefront-hosted-checkout-settlement");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [settlementFiles.up, "up"], [settlementFiles.down, "down"], [settlementFiles.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
});
