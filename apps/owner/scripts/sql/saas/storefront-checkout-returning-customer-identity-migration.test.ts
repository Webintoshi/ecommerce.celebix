import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202608140105_storefront_checkout_returning_customer_identity.up.sql",
  down: "202608140105_storefront_checkout_returning_customer_identity.down.sql",
  assertions: "202608140105_storefront_checkout_returning_customer_identity_assertions.sql",
  manifest: "phase4v-storefront-checkout-returning-customer-identity-manifest.json",
});

function source(name: keyof typeof files): string {
  const selected = new URL(files[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

test("105 installs a narrow returning-customer checkout reconciliation helper", () => {
  const up = source("up");
  assert.match(up, /CREATE FUNCTION saas[.]storefront_checkout_reconcile_customer_identity_v105/u);
  assert.match(up, /selected_customer[.]email<>incoming_email/u);
  assert.match(up, /phone_customer[.]id IS NOT NULL AND phone_customer[.]id<>email_customer[.]id/u);
  assert.match(up, /email_customer[.]status<>'active'/u);
  assert.match(up, /last_seen_at=pg_catalog[.]GREATEST\(last_seen_at,p_now\)/u);
});

test("105 preserves stock checks, operation replay semantics and the existing checkout executor", () => {
  const up = source("up");
  const wrapper = up.match(/CREATE OR REPLACE FUNCTION saas[.]public_checkout_complete[\s\S]+?(?=\nREVOKE ALL ON FUNCTION)/u)?.[0] ?? "";
  assert.match(wrapper, /pg_advisory_xact_lock/u);
  assert.match(wrapper, /operation_replayed/u);
  assert.match(wrapper, /operation_mismatch/u);
  assert.match(wrapper, /storefront_available_stock/u);
  assert.match(wrapper, /storefront_checkout_reconcile_customer_identity_v105/u);
  assert.match(wrapper, /public_checkout_complete_without_available_stock_v090/u);
  assert.doesNotMatch(wrapper, /paytr|iyzico|token|secret/iu);
});

test("105 exposes only the public checkout RPC to the host resolver", () => {
  const up = source("up");
  const assertions = source("assertions");
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]+storefront_checkout_reconcile_customer_identity_v105/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]+public_checkout_complete[\s\S]+TO celebix_saas_host_resolver/u);
  assert.match(assertions, /pg_catalog[.]has_function_privilege\('celebix_saas_host_resolver','saas[.]storefront_checkout_reconcile_customer_identity_v105/u);
  assert.doesNotMatch(up, /GRANT EXECUTE ON FUNCTION[\s\S]+storefront_checkout_reconcile_customer_identity_v105[\s\S]+TO celebix_saas_host_resolver/iu);
});

test("105 rollback is guarded and every artifact is digest pinned", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const down = source("down");
  assert.match(down, /STOREFRONT_CHECKOUT_RETURNING_CUSTOMER_IDENTITY_DOWN_BLOCKED/u);
  assert.match(down, /DROP FUNCTION IF EXISTS saas[.]storefront_checkout_reconcile_customer_identity_v105/u);

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
      phase: "phase4v-storefront-checkout-returning-customer-identity",
      postgresqlMajor: 16,
      externalConnections: 0,
      productionMutations: 0,
    },
  );
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"],
    [files.down, "down"],
    [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
  for (const sql of [source("up"), down, source("assertions")]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/u);
    assert.match(sql, /COMMIT;\s*$/u);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//iu);
  }
});
