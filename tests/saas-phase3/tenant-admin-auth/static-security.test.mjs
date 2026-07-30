import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const MANIFEST = "phase3-tenant-admin-auth-manifest.json";
const FILES = [
  ["202607300069_tenant_admin_domains_and_principal_logout.up.sql", "up"],
  ["202607300069_tenant_admin_domains_and_principal_logout.down.sql", "down"],
  ["202607300069_tenant_admin_domains_and_principal_logout_assertions.sql", "verify"],
];

function source(file) {
  return readFileSync(path.join(SQL, file), "utf8");
}

test("tenant admin auth migration is checksum pinned and production inert", () => {
  const manifest = JSON.parse(source(MANIFEST));
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    classification: manifest.classification,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-tenant-admin-auth",
    postgresqlMajor: 16,
    classification: "additive-tenant-admin-domain-and-session-authority",
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), FILES);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(source(artifact.file)).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("admin-domain table is exact, isolated, and has one active canonical host", () => {
  const up = source(FILES[0][0]);
  assert.match(up, /CREATE TABLE saas\.admin_domains/);
  assert.match(up, /UNIQUE \(hostname\)/);
  assert.match(up, /kind IN \('platform_subdomain', 'custom_alias'\)/);
  assert.match(up, /status IN \('pending_verification', 'active', 'disabled'\)/);
  assert.match(up, /CREATE UNIQUE INDEX admin_domains_one_active_canonical_per_store_idx[\s\S]+WHERE canonical AND status = 'active'/);
  assert.match(up, /ALTER TABLE saas\.admin_domains ENABLE ROW LEVEL SECURITY/);
  assert.match(up, /ALTER TABLE saas\.admin_domains FORCE ROW LEVEL SECURITY/);
  assert.match(up, /REVOKE ALL ON saas\.admin_domains FROM PUBLIC/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+(?:TABLE\s+)?saas\.admin_domains/i);
});

test("only bounded security-definer functions cross the admin auth tables", () => {
  const up = source(FILES[0][0]);
  for (const functionName of [
    "provision_canonical_admin_domain",
    "resolve_public_admin_brand",
    "issue_cross_host_panel_handoff",
    "redeem_cross_host_panel_handoff",
    "recover_cross_host_panel_handoff",
    "revoke_principal_panel_sessions",
  ]) {
    assert.match(up, new RegExp(`CREATE FUNCTION saas\\.${functionName}\\(`));
    assert.match(up, new RegExp(`ALTER FUNCTION saas\\.${functionName}[\\s\\S]+OWNER TO celebix_saas_owner`));
    assert.match(up, new RegExp(`REVOKE ALL ON FUNCTION saas\\.${functionName}[\\s\\S]+FROM PUBLIC`));
  }
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.resolve_public_admin_brand[^;]+TO celebix_saas_host_resolver/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.provision_canonical_admin_domain[^;]+TO celebix_saas_bootstrap/);
  for (const functionName of [
    "issue_cross_host_panel_handoff",
    "redeem_cross_host_panel_handoff",
    "recover_cross_host_panel_handoff",
    "revoke_principal_panel_sessions",
  ]) {
    assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION saas\\.${functionName}[^;]+TO celebix_saas_identity`));
  }
});

test("handoff is hostname-bound, single-use, short-lived, and never stores plaintext credentials", () => {
  const up = source(FILES[0][0]);
  assert.match(up, /CREATE TABLE saas\.cross_host_panel_handoffs/);
  assert.match(up, /destination_hostname text NOT NULL/);
  assert.match(up, /token_digest character\(64\) NOT NULL/);
  assert.match(up, /session_token_digest character\(64\) NOT NULL/);
  assert.match(up, /expires_at <= issued_at \+ interval '2 minutes'/);
  assert.match(up, /redeemed_at IS NULL/);
  assert.match(up, /FOR UPDATE/);
  assert.match(up, /'handoff_replayed'/);
  assert.doesNotMatch(up, /\b(?:credential|plaintext_token|raw_token)\s+text\b/i);
});

test("principal logout authenticates the presented session and revokes every active family", () => {
  const up = source(FILES[0][0]);
  const start = up.indexOf("CREATE FUNCTION saas.revoke_principal_panel_sessions");
  const body = up.slice(start, up.indexOf("ALTER FUNCTION", start));
  assert.match(body, /token_key_id = p_token_key_id AND session\.token_digest = p_token_digest/);
  assert.match(body, /current_session\.revoked_at IS NOT NULL/);
  assert.match(body, /current_session\.expires_at <= p_now/);
  assert.match(body, /WHERE session\.principal_id = current_session\.principal_id[\s\S]+session\.revoked_at IS NULL/);
  assert.match(body, /'principal_revoked'/);
});

test("rollback and verification remain transaction-scoped and secret-free", () => {
  const up = source(FILES[0][0]);
  const down = source(FILES[1][0]);
  const verify = source(FILES[2][0]);
  for (const sql of [up, down, verify]) {
    assert.match(sql, /(?:^|\n)BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /(?:postgres(?:ql)?:\/\/|auth\.saas-staging|coolify|api[_-]?key|client[_-]?secret)/i);
  }
  assert.match(down, /DROP TABLE saas\.cross_host_panel_handoffs/);
  assert.match(down, /DROP TABLE saas\.admin_domains/);
  assert.match(verify, /PHASE3_TENANT_ADMIN_AUTH_ASSERTION_FAILED/);
});
