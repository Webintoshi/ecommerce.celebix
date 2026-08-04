import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608040083_storefront_customer_identity.up.sql",
  down: "202608040083_storefront_customer_identity.down.sql",
  assertions: "202608040083_storefront_customer_identity_assertions.sql",
  manifest: "phase4f-storefront-customer-identity-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("083 creates only store-scoped identity authority with composite references", () => {
  for (const table of [
    "storefront_accounts",
    "storefront_login_challenges",
    "storefront_account_sessions",
    "storefront_account_order_links",
    "storefront_account_favorites",
    "storefront_account_cart_links",
    "storefront_identity_operations",
    "storefront_identity_audit",
    "storefront_identity_email_outbox",
  ]) assert.match(up, new RegExp(`CREATE TABLE saas[.]${table}[(]`));
  assert.match(up, /UNIQUE\(store_id,email_normalized\)/);
  assert.match(up, /FOREIGN KEY\(store_id,customer_id\) REFERENCES saas[.]customers\(store_id,id\)/);
  assert.match(up, /FOREIGN KEY\(store_id,account_id\) REFERENCES saas[.]storefront_accounts\(store_id,id\)/);
  assert.match(up, /FOREIGN KEY\(store_id,order_id\) REFERENCES saas[.]orders\(store_id,id\)/);
  assert.match(up, /FOREIGN KEY\(store_id,product_id\) REFERENCES saas[.]products\(store_id,id\)/);
  assert.doesNotMatch(up, /\b(?:raw_email|raw_code|credential|provider_response|user_agent)\b\s+(?:text|jsonb)/iu);
});

test("083 forces RLS and removes every direct runtime table privilege", () => {
  for (const table of ["storefront_accounts", "storefront_login_challenges", "storefront_account_sessions", "storefront_account_order_links", "storefront_account_favorites", "storefront_account_cart_links", "storefront_identity_operations", "storefront_identity_audit", "storefront_identity_email_outbox"]) {
    assert.match(up, new RegExp(`['\"]${table}['\"]`));
  }
  assert.match(up, /ALTER TABLE saas[.]%I ENABLE ROW LEVEL SECURITY/);
  assert.match(up, /ALTER TABLE saas[.]%I FORCE ROW LEVEL SECURITY/);
  assert.match(up, /REVOKE ALL ON saas[.]storefront_accounts,[\s\S]+FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,[\s\S]+celebix_saas_host_resolver/);
  assert.match(up, /guard_storefront_identity_audit_mutation/);
  assert.match(up, /guard_storefront_identity_operation_mutation/);
  assert.match(up, /guard_storefront_identity_outbox_mutation/);
});

test("083 public functions derive store authority from hostname and expose only RPC execution", () => {
  for (const name of [
    "public_account_auth_start",
    "public_account_auth_verify",
    "public_account_profile_complete",
    "public_account_session_get",
    "public_account_logout",
    "public_account_logout_all",
    "public_account_profile_update",
    "public_account_address_save",
    "public_account_address_delete",
    "public_account_favorite_set",
    "public_account_orders",
    "public_account_order_get",
    "public_account_sessions",
    "public_account_session_revoke",
  ]) {
    assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}[(]`));
    assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION saas[.]${name}[(]`));
  }
  assert.match(up, /selected_store:=saas[.]storefront_public_store\(p_hostname,p_now\)/);
  assert.match(up, /SECURITY DEFINER SET search_path=pg_catalog,saas/g);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_account.*TO celebix_saas_host_resolver/is);
});

test("083 verification consumes one challenge and creates store-isolated account sessions", () => {
  assert.match(up, /FROM saas[.]storefront_login_challenges[\s\S]+FOR UPDATE/);
  assert.match(up, /consumed_at=p_now/);
  assert.match(up, /attempt_count=attempt_count\+1/);
  assert.match(up, /status IN\('pending_profile','active','suspended'\)/);
  assert.match(up, /session_kind IN\('registration','full'\)/);
  assert.match(up, /INSERT INTO saas[.]storefront_account_order_links/);
  assert.match(up, /customer[.]email=selected_account[.]email_normalized/);
  assert.match(up, /pg_advisory_xact_lock/);
  assert.match(up, /operation_replayed/);
});

test("083 artifacts are checksum pinned and rollback refuses active or durable account authority", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const manifest = JSON.parse(source("manifest")) as { phase: string; postgresqlMajor: number; externalConnections: number; productionMutations: number; artifacts: Array<{ file: string; direction: string; sha256: string }> };
  assert.deepEqual({ phase: manifest.phase, postgresqlMajor: manifest.postgresqlMajor, externalConnections: manifest.externalConnections, productionMutations: manifest.productionMutations }, { phase: "phase4f-storefront-customer-identity", postgresqlMajor: 16, externalConnections: 0, productionMutations: 0 });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [[files.up, "up"], [files.down, "down"], [files.assertions, "verify"]]);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  assert.match(down, /celebix[.]allow_storefront_customer_identity_down/);
  assert.match(down, /STOREFRONT_CUSTOMER_IDENTITY_DOWN_BLOCKED/);
  assert.match(down, /storefront_accounts/);
  assert.match(down, /storefront_account_sessions/);
  assert.match(assertions, /storefront_customer_identity_contract_invalid/);
  for (const sql of [up, down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//iu);
  }
});
