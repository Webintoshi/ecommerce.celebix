import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "86b3a4ad";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const bytes = (path) => readFile(new URL(path, ROOT));
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const lines = (value) => value.split("\n").filter(Boolean);

const ORDER_ROUTE_FILES = Object.freeze([
  "apps/customer-panel/app/api/orders/[orderId]/notes/[noteId]/archive/route.ts",
  "apps/customer-panel/app/api/orders/[orderId]/notes/route.ts",
  "apps/customer-panel/app/api/orders/[orderId]/payment/route.ts",
  "apps/customer-panel/app/api/orders/[orderId]/route.ts",
  "apps/customer-panel/app/api/orders/[orderId]/shipping/route.ts",
  "apps/customer-panel/app/api/orders/[orderId]/status/route.ts",
  "apps/customer-panel/app/api/orders/route.ts",
  "apps/customer-panel/app/api/orders/summary/route.ts",
  "apps/customer-panel/app/orders/[orderId]/page.tsx",
  "apps/customer-panel/app/orders/page.tsx",
]);

const SQL_ARTIFACTS = Object.freeze({
  "202607210022_order_management.up.sql": "09258e0534922bedd61dafa2186e9f98a825ee4732b816d88b96340606d9bc84",
  "202607210022_order_management.down.sql": "04ca9dbc713c1d932b86e0615cd1e0f83677bea2d0149696ebc4cebcdcbf179a",
  "202607210022_order_management_assertions.sql": "22082520d101924b839acbd24f284ff7c460f3dff83296899749eefd86712133",
  "202607210023_order_management_api.up.sql": "b9887c1fb739795553734c5c621ce1e0d1489874942a4d6755d15a2b0bb15ffb",
  "202607210023_order_management_api.down.sql": "ad238fe2d6406839f2bd47350d10b71ca170d10e3bb44632cc7dac5afd76420e",
  "202607210023_order_management_api_assertions.sql": "cbaa42a96ecf3542137912660c99c3bdd73db8dea6cb3e419062cab65d37e84b",
});

test("pins the exact donor SHA and keeps apps admin byte unchanged from implementation start", () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"), "");
});

test("adds exactly the authorized A1 list detail and mutation routes", () => {
  const added = lines(git(
    "diff", "--diff-filter=A", "--name-only", "--no-renames", `${BASE}...HEAD`, "--",
    "apps/customer-panel/app",
  )).sort();
  assert.deepEqual(added, [...ORDER_ROUTE_FILES].sort());
  assert.doesNotMatch(added.join("\n"), /quick|abandoned|hızlı|terk/i);
});

test("imports no Supabase donor runtime admin API or browser authority", async () => {
  const changed = lines(git("diff", "--name-only", "--no-renames", `${BASE}...HEAD`, "--", "apps/customer-panel"));
  const production = changed.filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.[cm]?[jt]sx?$/.test(path));
  const source = (await Promise.all(production.map(read))).join("\n");
  assert.doesNotMatch(source, /@supabase|getAdminAuthContext|getBrowserSupabaseClient|\/api\/admin\/|store-runtime|store-info-context/i);
  const browser = production.filter((path) =>
    path.includes("/components/") || path.includes("/order-ui/") || path.includes("/panel-ui/"),
  );
  const browserSource = (await Promise.all(browser.map(read))).join("\n");
  assert.doesNotMatch(browserSource, /document\.cookie|localStorage|sessionStorage|x-(?:tenant|store|principal|membership|plan)-id/i);
});

test("keeps tenant principal membership and plan IDs out of browser DTO and DOM sources", async () => {
  const browserSources = [
    "packages/saas-contracts/src/orders/types.ts",
    "packages/saas-contracts/src/orders/validation.ts",
    "apps/customer-panel/lib/order-ui/client.ts",
    "apps/customer-panel/components/orders/OrderListConsole.tsx",
    "apps/customer-panel/components/orders/OrderDetailConsole.tsx",
    "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx",
    "apps/customer-panel/app/orders/page.tsx",
    "apps/customer-panel/app/orders/[orderId]/page.tsx",
  ];
  const source = (await Promise.all(browserSources.map(read))).join("\n");
  assert.doesNotMatch(source, /\b(?:tenantId|storeId|principalId|membershipId|planId|domainId|requestId)\b/);
  assert.doesNotMatch(source, /\b(?:issuer|subject|providerSubject|databaseRole|databaseUrl)\b/i);
  assert.doesNotMatch(source, /authorization|x-celebix|x-(?:tenant|store|principal|membership|plan)-id/i);
});

test("keeps one real all-orders menu and no fake quick-order or abandoned-cart destinations", async () => {
  const navigation = await read("apps/customer-panel/lib/panel-ui/navigation.ts");
  assert.equal((navigation.match(/label:\s*"Siparişler"/g) ?? []).length, 1);
  assert.equal((navigation.match(/label:\s*"Tüm Siparişler"/g) ?? []).length, 1);
  assert.equal((navigation.match(/href:\s*"\/orders"/g) ?? []).length, 2);
  assert.doesNotMatch(navigation, /quick|abandoned|hızlı|terk/i);
  for (const path of [
    "apps/customer-panel/app/orders/quick/page.tsx",
    "apps/customer-panel/app/orders/abandoned-carts/page.tsx",
    "apps/customer-panel/app/api/orders/quick/route.ts",
    "apps/customer-panel/app/api/orders/abandoned-carts/route.ts",
  ]) assert.equal(git("ls-tree", "--name-only", "HEAD", "--", path), "");
});

test("binds the SQL manifest to the exact approved artifact bytes", async () => {
  const manifest = JSON.parse(await read("apps/owner/scripts/sql/saas/phase3b1-order-management-manifest.json"));
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.artifacts.length, 6);
  const declared = Object.fromEntries(manifest.artifacts.map((artifact) => [artifact.file, artifact.sha256]));
  assert.deepEqual(declared, SQL_ARTIFACTS);
  for (const [file, expected] of Object.entries(SQL_ARTIFACTS)) {
    const actual = createHash("sha256")
      .update(await bytes(`apps/owner/scripts/sql/saas/${file}`))
      .digest("hex");
    assert.equal(actual, expected, file);
  }
  const assertions = await read("apps/owner/scripts/sql/saas/202607210023_order_management_api_assertions.sql");
  for (const pinned of [
    "CASE WHEN p_sort=''highest'' THEN order_row[.]total_cents END DESC",
    "CASE WHEN p_sort=''lowest'' THEN order_row[.]total_cents END ASC",
    "CASE WHEN p_sort IN \\(''newest'',''highest''\\) THEN order_row[.]created_at END DESC",
    "CASE WHEN p_sort IN \\(''oldest'',''lowest''\\) THEN order_row[.]created_at END ASC",
    "CASE WHEN p_sort IN \\(''newest'',''highest''\\) THEN order_row[.]id END DESC",
    "CASE WHEN p_sort IN \\(''oldest'',''lowest''\\) THEN order_row[.]id END ASC",
    "CASE WHEN p_sort=''highest'' THEN candidates[.]total_cents END DESC",
    "CASE WHEN p_sort=''lowest'' THEN candidates[.]total_cents END ASC",
    "CASE WHEN p_sort IN \\(''newest'',''highest''\\) THEN candidates[.]created_at END DESC",
    "CASE WHEN p_sort IN \\(''oldest'',''lowest''\\) THEN candidates[.]created_at END ASC",
    "CASE WHEN p_sort IN \\(''newest'',''highest''\\) THEN candidates[.]id END DESC",
    "CASE WHEN p_sort IN \\(''oldest'',''lowest''\\) THEN candidates[.]id END ASC",
    "ORDER BY event[.]created_at,[[:space:]]*event[.]id",
    "ORDER BY note[.]created_at,[[:space:]]*note[.]id",
  ]) assert.equal(assertions.includes(pinned), true, `missing exact SQL drift assertion: ${pinned}`);
});

test("grants the app role function execution only and no direct order-table DML", async () => {
  const sql = (await Promise.all(Object.keys(SQL_ARTIFACTS).map((file) =>
    read(`apps/owner/scripts/sql/saas/${file}`),
  ))).join("\n");
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*?TO celebix_saas_app/i);
  const statements = sql.split(";");
  assert.equal(statements.some((statement) =>
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i.test(statement) &&
    /TO\s+celebix_saas_app\b/i.test(statement)
  ), false);
  assert.match(sql, /has_table_privilege\([\s\S]{0,100}?'celebix_saas_app'[\s\S]{0,100}?'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'/i);
});

test("tracked A1 patch contains no credentials private keys or session material", () => {
  const productionFiles = lines(git("diff", "--name-only", "--no-renames", `${BASE}...HEAD`)).filter((path) =>
    !/\.test\.[cm]?[jt]sx?$/.test(path) &&
    !path.startsWith("tests/") &&
    !path.startsWith("docs/") &&
    !path.endsWith("-report.md") &&
    path !== "package-lock.json",
  );
  const patch = productionFiles.length === 0 ? "" : git("diff", `${BASE}...HEAD`, "--", ...productionFiles);
  assert.doesNotMatch(patch, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i);
  assert.doesNotMatch(patch, /postgres(?:ql)?:\/\/[^\s"']+:[^\s"'@]+@/i);
  assert.doesNotMatch(patch, /(?:password|client_secret|service_role_key)\s*[:=]\s*["'][^"']+/i);
  const panelCookieAssignment = new RegExp(
    ["__Host", "celebix_panel"].join("-") + String.fromCharCode(61),
  );
  assert.doesNotMatch(patch, panelCookieAssignment);
});

test("legacy shell and presentation gates are aligned to A1 while deferred domains remain unsupported", async () => {
  const shellGate = await read("tests/saas-phase3/hemenaku-merchant-shell/static-security.test.mjs");
  const presentationGate = await read("tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs");
  assert.doesNotMatch(shellGate, /doesNotMatch\(navigation, \/orders\|sipariş/);
  assert.doesNotMatch(shellGate, /\["orders", "analytics", "customers", "carts"\]/);
  assert.doesNotMatch(presentationGate, /\["orders", "analytics", "customers", "carts"\]/);
  for (const source of [shellGate, presentationGate]) {
    assert.match(source, /\["analytics", "customers", "carts"\]/);
    assert.match(source, /quick|abandoned/i);
  }
});
