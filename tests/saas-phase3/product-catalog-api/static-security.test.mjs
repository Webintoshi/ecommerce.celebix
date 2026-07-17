import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

test("catalog HTTP responses are finite no-store projections without private driver output", () => {
  const handler = read("apps/customer-panel/lib/catalog-http/handler.ts");
  assert.match(handler, /"cache-control": "no-store"/);
  assert.match(handler, /value instanceof CatalogRepositoryError/);
  assert.doesNotMatch(handler, /caught\.(?:message|stack|cause)|JSON\.stringify\(caught\)|console\.(?:log|error|warn)/);
  for (const privateName of [
    "session credential", "token digest", "connection string", "database role", "constraint name",
  ]) assert.doesNotMatch(handler.toLowerCase(), new RegExp(privateName));
});

test("browser inputs cannot supply tenant store principal membership plan or database authority", () => {
  const parser = read("apps/customer-panel/lib/catalog-http/request-input.ts");
  const handler = read("apps/customer-panel/lib/catalog-http/handler.ts");
  assert.doesNotMatch(parser, /["'](?:storeId|tenantId|principalId|membershipId|planId|productLimit|databaseRole)["']/);
  assert.match(handler, /tenantContext: authorized\.tenantContext/);
  assert.match(handler, /"x-store-id"/);
  assert.match(handler, /"x-tenant-id"/);
  assert.match(handler, /"x-principal-id"/);
  assert.match(handler, /"x-membership-id"/);
  assert.match(handler, /"x-plan-id"/);
  assert.match(handler, /"x-database-role"/);
});

test("approved staging uses exactly one process pool for sessions and catalog", () => {
  const runtime = read("apps/customer-panel/lib/server-panel-access/postgres-runtime.ts");
  assert.equal((runtime.match(/new Pool\(/g) ?? []).length, 1);
  assert.match(runtime, /createPostgresPanelSessionRepository[\s\S]*?pool,/);
  assert.match(runtime, /new PostgresCatalogRepository\([\s\S]*?pool,/);
  assert.match(runtime, /pg_has_role\(current_user, 'celebix_saas_app', 'MEMBER'\)/);
  assert.match(runtime, /catalog_get_product_details/);
  assert.doesNotMatch(read("apps/customer-panel/lib/server-catalog/default.ts"), /new Pool|DATABASE_URL|connectionString/);
});

test("Phase 3A2 tracked diff stays inside Atlas-authorized paths and contains no secret material", () => {
  const changed = execFileSync("git", [
    "diff", "--name-only", "--no-renames", "81202c5910ffa7004e427841842a159a2ee5dfee",
  ], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  const files = [...new Set([...changed, ...untracked])];
  const allowed = [
    /^packages\/saas-contracts\/src\/(?:catalog\/|index\.ts$)/,
    /^packages\/saas-data\/src\/(?:catalog\/|index\.ts$)/,
    /^apps\/owner\/scripts\/sql\/saas\/(?:.*019.*product.*|.*phase3a2.*manifest.*)$/,
    /^apps\/customer-panel\/app\/api\/catalog\/products\//,
    /^apps\/customer-panel\/lib\/(?:server-catalog|catalog-http)\//,
    /^apps\/customer-panel\/lib\/server-panel-access\//,
    /^tests\/saas-phase3\/product-catalog(?:-api)?\//,
  ];
  assert.equal(files.every((file) => allowed.some((pattern) => pattern.test(file))), true, files.join("\n"));
  const combined = files
    .filter((file) => !file.includes("/tests/") && !file.startsWith("tests/") && !file.endsWith(".test.ts") && !file.endsWith(".test.mjs"))
    .map((file) => read(file))
    .join("\n");
  assert.doesNotMatch(combined, /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i);
  assert.doesNotMatch(combined, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:password|client_secret|service_role_key)\s*[:=]\s*["'][^"']+/i);
  assert.doesNotMatch(combined, /v1\.panel\.(?:current|previous)\.[A-Za-z0-9_-]{40,}/);
});
