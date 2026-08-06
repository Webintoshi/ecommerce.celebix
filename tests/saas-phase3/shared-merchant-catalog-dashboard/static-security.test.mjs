import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BASE = "d343f493bf7f4950604dfb08770ccb5290659557";
const IMPLEMENTATION_HEAD = "6563a1428434e1974f50af3ffb843eb4067f686a";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const reviewedSuccessorAuthorityFiles = new Set([
  "apps/customer-panel/lib/catalog-http/default.ts",
  "apps/customer-panel/lib/catalog-http/handler.test.ts",
  "apps/customer-panel/lib/catalog-http/handler.ts",
  "apps/customer-panel/lib/catalog-http/request-authority.ts",
  "apps/customer-panel/lib/catalog-ui/client.ts",
  "apps/customer-panel/lib/server-catalog/runtime.test.ts",
  "apps/customer-panel/lib/server-catalog/runtime.ts",
  "packages/saas-data/src/catalog/index.ts",
  "packages/saas-data/src/catalog/repository.test.ts",
  "packages/saas-data/src/catalog/repository.ts",
  "packages/saas-data/src/catalog/types.ts",
]);
const allowedFiles = new Set([
  "packages/saas-data/src/catalog/types.ts",
  "packages/saas-data/src/catalog/repository.ts",
  "packages/saas-data/src/catalog/repository.test.ts",
  "apps/customer-panel/lib/server-catalog/runtime.ts",
  "apps/customer-panel/lib/server-catalog/runtime.test.ts",
  "apps/customer-panel/lib/catalog-http/request-authority.ts",
  "apps/customer-panel/lib/catalog-http/request-authority.test.ts",
  "apps/customer-panel/lib/catalog-http/handler.ts",
  "apps/customer-panel/lib/catalog-http/handler.test.ts",
  "apps/customer-panel/lib/catalog-http/default.ts",
  "apps/customer-panel/lib/catalog-ui/client.ts",
  "apps/customer-panel/lib/catalog-ui/client.test.ts",
  "apps/customer-panel/lib/panel-ui/dashboard-model.ts",
  "apps/customer-panel/lib/panel-ui/dashboard-model.test.ts",
  "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx",
  "apps/customer-panel/components/dashboard/panel-dashboard.module.css",
  "apps/customer-panel/app/api/catalog/summary/route.ts",
  "apps/customer-panel/lib/panel-shell.test.ts",
  "apps/customer-panel/lib/routes.test.ts",
  "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary.up.sql",
  "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary.down.sql",
  "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary_assertions.sql",
  "apps/owner/scripts/sql/saas/shared-merchant-catalog-dashboard-manifest.json",
]);

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const isSharedCatalogAuthoritySurface = (file) =>
  file.startsWith("packages/saas-data/src/catalog/") ||
  file.startsWith("apps/customer-panel/lib/server-catalog/") ||
  file.startsWith("apps/customer-panel/lib/catalog-http/") ||
  file === "apps/customer-panel/lib/catalog-ui/client.ts" ||
  file === "apps/customer-panel/app/api/catalog/summary/route.ts" ||
  file === "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary.up.sql" ||
  file === "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary.down.sql" ||
  file === "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary_assertions.sql" ||
  file === "apps/owner/scripts/sql/saas/shared-merchant-catalog-dashboard-manifest.json";

test("donor snapshot is pinned and apps/admin remains read-only", () => {
  assert.equal(git("rev-parse", DONOR), DONOR);
  assert.equal(git("diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"), "");
});

test("tracks the original authority scope and reviewed successor catalog extensions", () => {
  const changed = git("diff", "--name-only", `${BASE}...${IMPLEMENTATION_HEAD}`).split("\n").filter(Boolean);
  assert.equal(
    changed.every((file) => allowedFiles.has(file) || file.startsWith("tests/saas-phase3/shared-merchant-catalog-dashboard/")),
    true,
    changed.join("\n"),
  );
  const laterAuthorityChanges = git("diff", "--name-only", `${IMPLEMENTATION_HEAD}...HEAD`).split("\n").filter(Boolean).filter(isSharedCatalogAuthoritySurface);
  assert.equal(
    laterAuthorityChanges.every((file) => reviewedSuccessorAuthorityFiles.has(file)),
    true,
    laterAuthorityChanges.join("\n"),
  );
  const target = changed.filter((file) =>
    (file.startsWith("apps/customer-panel/") || file.startsWith("packages/saas-data/")) &&
    !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
  );
  const source = target.map((file) => readFileSync(path.join(ROOT, file), "utf8")).join("\n");
  assert.doesNotMatch(
    source,
    /from ["']@supabase|\/api\/admin\/|apps\/admin/i,
  );
  const browserFiles = target.filter((file) =>
    file.includes("/catalog-ui/") || file.includes("/panel-ui/") || file.includes("/components/dashboard/"),
  );
  const browserSource = browserFiles
    .map((file) => readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(browserSource, /localStorage.*(?:tenant|store)|x-(?:tenant|store)-id/i);
  const successorSource = laterAuthorityChanges
    .filter((file) => !file.endsWith(".test.ts"))
    .map((file) => readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(successorSource, /from ["']@supabase|\/api\/admin\/|document[.]cookie|localStorage|sessionStorage/i);

  const handlerSource = readFileSync(
    path.join(ROOT, "apps/customer-panel/lib/catalog-http/handler.ts"),
    "utf8",
  );
  assert.match(handlerSource, /privateAuthorityPresent/);
  assert.match(handlerSource, /"x-store-id"/);
  assert.match(handlerSource, /"x-tenant-id"/);
});

test("catalog dashboard SQL authority artifacts are complete", () => {
  for (const file of [
    "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary.up.sql",
    "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary.down.sql",
    "apps/owner/scripts/sql/saas/202607200021_catalog_dashboard_summary_assertions.sql",
    "apps/owner/scripts/sql/saas/shared-merchant-catalog-dashboard-manifest.json",
  ]) {
    assert.equal(existsSync(path.join(ROOT, file)), true, file);
  }
});
