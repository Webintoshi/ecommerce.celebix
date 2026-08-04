import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202608040085_storefront_magic_link_auth.up.sql",
  down: "202608040085_storefront_magic_link_auth.down.sql",
  assertions: "202608040085_storefront_magic_link_auth_assertions.sql",
  manifest: "phase4g-storefront-magic-link-auth-manifest.json",
});
function source(name: keyof typeof files): string {
  const selected = new URL(files[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("085 adds keyed ticket authority without replacing fallback code data", () => {
  assert.match(up, /ALTER TABLE saas[.]storefront_login_challenges[\s\S]+ADD COLUMN ticket_key_id text[\s\S]+ADD COLUMN ticket_digest char\(64\)/u);
  assert.match(up, /ticket_key_id~'\^\[a-z\]\[a-z0-9_-\][{]2,31[}]\$'/u);
  assert.match(up, /ticket_digest~'\^\[a-f0-9\][{]64[}]\$'/u);
  assert.doesNotMatch(up, /DROP COLUMN (?:code_key_id|code_digest)/u);
  assert.match(up, /CREATE FUNCTION saas[.]public_account_auth_start_v2\(/u);
  assert.match(up, /CREATE FUNCTION saas[.]public_account_auth_verify_v2\(/u);
});

test("085 verification selects exactly one verifier and consumes one locked challenge", () => {
  assert.match(up, /p_verifier_kind NOT IN\('ticket','code'\)/u);
  assert.match(up, /p_verifier_kind='ticket'[\s\S]+selected_challenge[.]ticket_digest=p_verifier_digest/u);
  assert.match(up, /p_verifier_kind='code'[\s\S]+selected_challenge[.]code_digest=p_verifier_digest/u);
  assert.match(up, /FROM saas[.]storefront_login_challenges[\s\S]+FOR UPDATE/u);
  assert.match(up, /SET consumed_at=p_now/u);
  assert.match(up, /attempt_count=attempt_count\+1/u);
});

test("085 exposes only v2 RPC execution and keeps table authority private", () => {
  assert.match(up, /SECURITY DEFINER SET search_path=pg_catalog,saas/gu);
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]+public_account_auth_start_v2[\s\S]+FROM PUBLIC,[\s\S]+celebix_saas_host_resolver/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]public_account_auth_start_v2[\s\S]+TO celebix_saas_host_resolver/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]public_account_auth_verify_v2[\s\S]+TO celebix_saas_host_resolver/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_login_challenges.*TO celebix_saas_host_resolver/isu);
});

test("085 rollback blocks active ticket challenges and artifacts are pinned", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const manifest = JSON.parse(source("manifest")) as { phase: string; postgresqlMajor: number; externalConnections: number; productionMutations: number; artifacts: Array<{ file: string; direction: string; sha256: string }> };
  assert.deepEqual({ phase: manifest.phase, postgresqlMajor: manifest.postgresqlMajor, externalConnections: manifest.externalConnections, productionMutations: manifest.productionMutations }, { phase: "phase4g-storefront-magic-link-auth", postgresqlMajor: 16, externalConnections: 0, productionMutations: 0 });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [[files.up, "up"], [files.down, "down"], [files.assertions, "verify"]]);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  assert.match(down, /storefront_magic_link_auth_down/u);
  assert.match(down, /ticket_digest IS NOT NULL AND consumed_at IS NULL AND expires_at>pg_catalog[.]clock_timestamp\(\)/u);
  assert.match(down, /STOREFRONT_MAGIC_LINK_AUTH_DOWN_BLOCKED/u);
  assert.match(down, /DROP FUNCTION saas[.]public_account_auth_start_v2/u);
  assert.match(down, /DROP COLUMN ticket_digest/u);
  assert.match(assertions, /storefront_magic_link_auth_contract_invalid/u);
  for (const sql of [up, down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/u);
    assert.match(sql, /COMMIT;\s*$/u);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//iu);
  }
});
