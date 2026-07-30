import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const MANIFEST = "phase3-returning-panel-login-manifest.json";
const FILES = [
  ["202607300068_returning_panel_login_sessions.up.sql", "up"],
  ["202607300068_returning_panel_login_sessions.down.sql", "down"],
  ["202607300068_returning_panel_login_sessions_assertions.sql", "verify"],
];

test("returning login migration is checksum pinned and production inert", () => {
  const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST), "utf8"));
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    classification: manifest.classification,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-returning-panel-login",
    postgresqlMajor: 16,
    classification: "additive-verified-identity-panel-session-authority",
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), FILES);
  for (const artifact of manifest.artifacts) {
    const source = readFileSync(path.join(SQL, artifact.file));
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("returning login SQL exposes only two identity-role functions and no table authority", () => {
  const up = readFileSync(path.join(SQL, FILES[0][0]), "utf8");
  const down = readFileSync(path.join(SQL, FILES[1][0]), "utf8");
  const verify = readFileSync(path.join(SQL, FILES[2][0]), "utf8");
  for (const source of [up, down, verify]) {
    assert.match(source, /(?:^|\n)BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);
    assert.doesNotMatch(source, /\bGRANT\b[^;]*\bON\s+(?:TABLE|ALL TABLES)\b/i);
    assert.doesNotMatch(source, /(?:postgres(?:ql)?:\/\/|celebix\.site|guzidekuyumcu|r2\.dev|amazonaws\.com)/i);
  }
  assert.equal((up.match(/CREATE FUNCTION saas\./g) ?? []).length, 2);
  assert.match(up, /membership\.role = 'store_owner'/);
  assert.match(up, /FOR SHARE OF principal, membership, store, subscription, plan/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.issue_returning_panel_session[^;]+TO celebix_saas_identity/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.recover_returning_panel_session[^;]+TO celebix_saas_identity/);
  assert.doesNotMatch(up, /TO celebix_saas_app/);
  assert.match(down, /DROP FUNCTION saas\.recover_returning_panel_session/);
  assert.match(down, /DROP FUNCTION saas\.issue_returning_panel_session/);
});

test("application login code has no browser tenant authority or secret logging", () => {
  const files = [
    "apps/customer-panel/lib/panel-returning-login/handler.ts",
    "apps/owner/lib/panel-returning-login/service.ts",
    "apps/owner/lib/panel-returning-login/postgres-session-issuer.ts",
    "apps/customer-panel/app/auth/login/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.doesNotMatch(source, /console\.|localStorage|sessionStorage|document\.cookie|x-forwarded-(?:host|proto)|headers\.get\(["']host/i, file);
    assert.doesNotMatch(source, /(?:authorization code|raw state|client secret|session credential).*log/i, file);
  }
  const route = readFileSync(path.join(ROOT, "apps/customer-panel/app/auth/login/route.ts"), "utf8");
  assert.equal((route.match(/^import\s/gm) ?? []).length, 1);
  assert.doesNotMatch(route, /process\.env|\bpg\b|Pool|secret|HMAC|fetch\(/i);
  assert.match(route, /getDefaultCustomerPanelAuthRouteSet/);
  assert.match(route, /routeSet\.browserLogin\(request\)/);
});
