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
