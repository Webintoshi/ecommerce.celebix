import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const runtimeFiles = [
  "apps/owner/lib/saas-persistence/identity-crypto.ts",
  "apps/owner/lib/saas-persistence/postgres-identity-common.ts",
  "apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts",
  "apps/owner/lib/saas-persistence/postgres-oidc-transaction-store.ts",
  "apps/owner/lib/saas-persistence/verified-identity.ts",
  "apps/owner/lib/self-serve-registration-completion.ts",
];
const runtime = runtimeFiles.map(read).join("\n");
const ownerPhase2b1Source = `${runtime}\n${read("apps/owner/lib/saas-persistence/postgres-identity-stores.test.ts")}`;
const schema = read("apps/owner/scripts/sql/saas/202607110008_identity_persistence.up.sql");
const verifiedIdentitySchema = read("apps/owner/scripts/sql/saas/202607120012_verified_identity_snapshot.up.sql");
const verifiedIdentityGrants = read("apps/owner/scripts/sql/saas/202607120013_verified_identity_grants.sql");

test("new identity persistence has no environment-selected adapter, database URL, production key, or memory fallback", () => {
  assert.doesNotMatch(runtime, /process\.env|DATABASE_URL|POSTGRES_URL|createPool\s*\(|new Pool\s*\(/);
  assert.doesNotMatch(runtime, /fallback.{0,40}(?:memory|in-memory)|(?:memory|in-memory).{0,40}fallback/is);
  assert.doesNotMatch(runtime, /(?:hmac|encryption)(?:Key)?\s*[:=]\s*["'][A-Za-z0-9+/=_-]{24,}["']/i);
  assert.doesNotMatch(runtime, /export\s+(?:async\s+)?function\s+query|public\s+query\s*\(/);
});

test("Owner Phase 2B1 source never imports the undeclared pg package directly", () => {
  assert.doesNotMatch(ownerPhase2b1Source, /from\s+["']pg["']|require\s*\(\s*["']pg["']\s*\)/);
});

test("database schema exposes digests and ciphertext only, never plaintext identity secrets", () => {
  for (const forbidden of ["raw_state", " nonce ", "code_verifier", " password ", "access_token", "refresh_token", "id_token", "client_secret", "database_url"]) {
    assert.doesNotMatch(schema.toLowerCase(), new RegExp(forbidden.replaceAll(" ", "\\s")));
  }
  assert.match(schema, /state_digest character\(64\)/);
  assert.match(schema, /payload_ciphertext bytea/);
  assert.match(schema, /payload_iv bytea/);
  for (const forbidden of ["issuer", "subject", "email", "nonce", "audience", "token", "password", "provider_secret"]) {
    assert.doesNotMatch(verifiedIdentitySchema, new RegExp(`\\b${forbidden}\\s+(?:text|bytea|jsonb?)\\b`, "i"));
  }
  assert.match(verifiedIdentitySchema, /CREATE TABLE saas\.registration_verified_identities/);
  assert.match(verifiedIdentitySchema, /payload_ciphertext bytea NOT NULL/);
  assert.match(verifiedIdentitySchema, /ON DELETE CASCADE/);
});

test("verified identity authority has exact immutable least-privilege grants", () => {
  assert.match(verifiedIdentityGrants, /GRANT SELECT, INSERT ON saas\.registration_verified_identities TO celebix_saas_identity/);
  assert.doesNotMatch(verifiedIdentityGrants, /GRANT[^;]*(?:UPDATE|DELETE|TRUNCATE)/i);
  assert.match(verifiedIdentitySchema, /PHASE2B1B1_IMMUTABLE_VERIFIED_IDENTITY/);
  assert.match(verifiedIdentitySchema, /registration_verified_identity_transition_guard/);
  assert.match(verifiedIdentitySchema, /DEFERRABLE INITIALLY DEFERRED/);
});

test("completion core has no environment activation, direct pg, route, session, or cookie authority", () => {
  const completion = read("apps/owner/lib/self-serve-registration-completion.ts");
  assert.doesNotMatch(completion, /process\.env|DATABASE_URL|POSTGRES_URL|from\s+["']pg["']|require\s*\(\s*["']pg["']/);
  assert.doesNotMatch(completion, /NextResponse|Set-Cookie|cookies\s*\(|session_created|redirect\s*\(/i);
  assert.doesNotMatch(runtime, /SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*true|CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*true/);
});

test("accepted migrations 001 through 011 remain byte-for-byte unchanged", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "40d323f93cf657e5751db87384dc19a595b9b230", "--", "apps/owner/scripts/sql/saas"], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  assert.equal(changed.some((file) => /2026071100(?:0[1-9]|1[01])_/.test(file) || file.endsWith("phase2a1-manifest.json") || file.endsWith("phase2b1-manifest.json")), false, changed.join("\n"));
});

test("production defaults and disabled route authority remain unchanged", () => {
  assert.match(read("apps/owner/lib/self-serve-registration-orchestrator.ts"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED = false/);
  assert.match(read("apps/owner/lib/self-serve-oidc.ts"), /class DisabledOidcTransactionStore/);
  assert.match(read("apps/owner/lib/self-serve-oidc.ts"), /class DisabledOidcProvider/);
  assert.doesNotMatch(runtime, /SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*true|CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*true/);
});

test("diff is confined to Phase 2B1 paths and leaves frozen, package, deployment, admin, and customer-panel surfaces untouched", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "3c461ff8133de0d75a57a96aea518788e426a12f"], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  const allowed = changed.every((file) =>
    file === "apps/owner/lib/self-serve-registration-orchestrator.ts" ||
    file.startsWith("apps/owner/lib/self-serve-registration-completion") ||
    file.startsWith("apps/owner/lib/saas-persistence/") ||
    file.startsWith("apps/owner/scripts/sql/saas/20260711000") ||
    file.startsWith("apps/owner/scripts/sql/saas/20260711001") ||
    file.startsWith("apps/owner/scripts/sql/saas/2026071200") ||
    file === "apps/owner/scripts/sql/saas/phase2b1-manifest.json" ||
    file === "apps/owner/scripts/sql/saas/phase2b1b1-manifest.json" ||
    file.startsWith("tests/saas-phase2/registration-session/"));
  assert.equal(allowed, true, changed.join("\n"));
  assert.equal(changed.some((file) => file === "package.json" || file === "package-lock.json" || file.includes("packages/saas-contracts") || file.includes("deploy/owner") || file.includes("apps/customer-panel") || file.includes("apps/admin") || file.includes("Hemenaku")), false);
  assert.equal(changed.some((file) => /20260711000[1-6]_/.test(file) || file.endsWith("phase2a1-manifest.json")), false);
});
