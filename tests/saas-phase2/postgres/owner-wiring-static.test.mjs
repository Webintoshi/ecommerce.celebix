import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const base = "8a07c1444f98c2e9d422b05a48af2ec510610aa2";
const read = (file) => readFileSync(path.join(root, file), "utf8");
const runtime = read("apps/owner/lib/saas-tenant-core/runtime.ts");
const route = read("apps/owner/app/api/internal/saas-tenants/route.ts");

test("Owner PostgreSQL composition is explicit, injected, and environment-independent", () => {
  assert.match(runtime, /createDisabledOwnerSaaSTenantRuntime/);
  assert.match(runtime, /createPostgresOwnerSaaSTenantRuntime/);
  assert.match(runtime, /activationApproval:\s*OwnerPostgresActivationApproval/);
  assert.match(runtime, /pool:\s*PostgresPoolLike/);
  assert.match(runtime, /isTrustedRecoveryRequest/);
  assert.doesNotMatch(runtime, /process\.env|database[_-]?url|postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(runtime, /new\s+(?:pg\.)?Pool|from\s+["']pg["']/);
  assert.doesNotMatch(runtime, /memory|fallback/i);
});

test("normal Owner route composes only the disabled runtime without request-selected authority", () => {
  assert.match(route, /runtime:\s*createDisabledOwnerSaaSTenantRuntime\(\)/);
  assert.match(route, /if\s*\(options\.runtime\.kind\s*===\s*["']disabled["']\)/);
  assert.match(route, /isTrustedRequest/);
  assert.doesNotMatch(route, /process\.env|new\s+(?:pg\.)?Pool|database[_-]?url/i);
  assert.doesNotMatch(route, /body\.(?:adapter|runtime)|searchParams.*(?:adapter|runtime)|headers.*(?:adapter|runtime)/i);
  assert.doesNotMatch(`${runtime}\n${route}`, /set(?:Global|Active|Current).*(?:Adapter|Runtime)|globalThis/i);
  assert.doesNotMatch(route, /JSON\.stringify\([^)]*(?:error|exception)/i);
});

test("public registration and customer panel remain statically disabled and disconnected", () => {
  const registration = read("apps/owner/lib/self-serve-registration-orchestrator.ts");
  const registrationRoute = read("apps/owner/app/api/self-serve/register/route.ts");
  const kayit = read("apps/owner/app/kayit/page.tsx");
  const customerPanel = read("apps/customer-panel/lib/config.ts");
  assert.match(registration, /SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*false/);
  assert.match(customerPanel, /CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*false/);
  assert.doesNotMatch(`${registrationRoute}\n${kayit}\n${customerPanel}`, /createPostgresOwnerSaaSTenantRuntime|PostgresSaaSDataRepository|createStarterTenantService/);
});

test("the task diff remains inside the approved Owner and PostgreSQL test boundaries", () => {
  const changed = execFileSync("git", ["diff", "--name-only", base], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.ok(changed.length > 0);
  for (const file of changed) {
    assert.match(file, /^(?:apps\/owner\/lib\/saas-tenant-core\/|apps\/owner\/app\/api\/internal\/saas-tenants\/|tests\/saas-phase2\/postgres\/)/, file);
  }
  for (const forbidden of [
    "package.json", "package-lock.json", "packages/saas-contracts", "apps/owner/scripts/sql/saas",
    "apps/admin", "apps/admin-shared", "apps/customer-panel", "deploy/owner", ".github/workflows",
  ]) {
    assert.equal(changed.some((file) => file === forbidden || file.startsWith(`${forbidden}/`)), false, forbidden);
  }
});
