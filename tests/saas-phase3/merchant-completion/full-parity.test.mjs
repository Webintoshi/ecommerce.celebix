import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { HEMENAKU_DONOR_PARITY } from "../../../apps/customer-panel/lib/panel-ui/parity-manifest.ts";

const BASE = "959de29d2ceb7a4ec8296f3f0b967fadbb3d1d61";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = "apps/owner/scripts/sql/saas";
const FORBIDDEN_FIXTURE_IDS = Object.freeze([
  ["10000000", "0000", "4000", "8000", "000000000001"].join("-"),
  ["20000000", "0000", "4000", "8000", "000000000001"].join("-"),
]);

const git = (...args) => execFileSync("git", args, {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}).trim();
const read = (relativePath) => readFile(path.join(ROOT, relativePath), "utf8");
const changedPaths = (...pathspecs) => git(
  "diff",
  "--name-only",
  `${BASE}...HEAD`,
  "--",
  ...pathspecs,
).split("\n").filter(Boolean);

const POSTGRES_HARNESSES = Object.freeze([
  ["tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs", 28],
  ["tests/saas-phase3/advanced-seo/postgres-harness.mjs", 28],
  ["tests/saas-phase3/catalog-administration/postgres-harness.mjs", 35],
  ["tests/saas-phase3/catalog-import-previews/postgres-harness.mjs", 25],
  ["tests/saas-phase3/catalog-product-tags/postgres-harness.mjs", 20],
  ["tests/saas-phase3/customer-management/postgres-harness.mjs", 23],
  ["tests/saas-phase3/exact-record-lookups-analytics/postgres-harness.mjs", 18],
  ["tests/saas-phase3/hosted-callback-lifecycle/postgres-harness.mjs", 13],
  ["tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs", 30],
  ["tests/saas-phase3/inventory-locations/postgres-harness.mjs", 44],
  ["tests/saas-phase3/inventory-purchasing/postgres-harness.mjs", 34],
  ["tests/saas-phase3/managed-umami-analytics/postgres-harness.mjs", 50],
  ["tests/saas-phase3/merchant-admin-modules/postgres-harness.mjs", 39],
  ["tests/saas-phase3/merchant-analytics/postgres-harness.mjs", 24],
  ["tests/saas-phase3/order-management/postgres-harness.mjs", 40],
  ["tests/saas-phase3/payment-adapter-runtime/postgres-harness.mjs", 30],
  ["tests/saas-phase3/payment-provider-keyed-lifecycle/postgres-harness.mjs", 12],
  ["tests/saas-phase3/payment-sandbox-evidence-history/postgres-harness.mjs", 9],
  ["tests/saas-phase3/paytr-iframe-activation-authority/postgres-harness.mjs", 1],
  ["tests/saas-phase3/payment-provider-admin/postgres-harness.mjs", 23],
  ["tests/saas-phase3/pilot-storefront/postgres-harness.mjs", 30],
  ["tests/saas-phase3/price-lists/postgres-harness.mjs", 38],
  ["tests/saas-phase3/pricing-preview/postgres-harness.mjs", 34],
  ["tests/saas-phase3/product-catalog-api/postgres-harness.mjs", 26],
  ["tests/saas-phase3/product-catalog/postgres-harness.mjs", 33],
  ["tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs", 53],
  ["tests/saas-phase3/quick-order-links/postgres-harness.mjs", 40],
  ["tests/saas-phase3/quick-order-runtime/postgres-harness.mjs", 49],
  ["tests/saas-phase3/shared-merchant-catalog-dashboard/postgres-harness.mjs", 18],
  ["tests/saas-phase3/typed-storefront-settings/postgres-harness.mjs", 24],
]);

const COMPLETION_MIGRATIONS = Object.freeze([
  ["202607220038", "merchant_analytics"],
  ["202607220039", "typed_storefront_settings"],
  ["202607220040", "advanced_seo_preferences"],
  ["202607220041", "catalog_import_previews"],
  ["202607220042", "catalog_product_tags"],
  ["202607220043", "inventory_purchasing"],
  ["202607220044", "inventory_counts_transfers"],
  ["202607220045", "price_lists"],
  ["202607230046", "inventory_locations"],
  ["202607230047", "pricing_preview"],
  ["202607240048", "exact_record_lookups_analytics"],
]);
const COMPLETION_ARTIFACTS = Object.freeze(COMPLETION_MIGRATIONS.flatMap(
  ([version, name]) => [
    `${version}_${name}.up.sql`,
    `${version}_${name}.down.sql`,
    `${version}_${name}_assertions.sql`,
  ],
));

async function findPostgresHarnesses(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const harnesses = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) harnesses.push(...await findPostgresHarnesses(target));
    if (entry.isFile() && entry.name === "postgres-harness.mjs") {
      harnesses.push(path.relative(ROOT, target).split(path.sep).join("/"));
    }
  }
  return harnesses.sort();
}

function isProductionGatePath(candidate) {
  if (!/^(?:apps\/customer-panel|packages|apps\/owner\/scripts\/sql\/saas)\//.test(candidate)) return false;
  return !/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)(?:\/|$)|[.](?:test|spec|fixture)[.][cm]?[jt]sx?$/i.test(candidate);
}

function parseProductionAddedLines(diff) {
  let currentPath = null;
  let kind = "modified";
  let inHunk = false;
  const additions = [];
  for (const rawLine of diff.split("\n")) {
    const header = rawLine.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (header) {
      currentPath = header[2];
      kind = "modified";
      inHunk = false;
      continue;
    }
    if (rawLine.startsWith("new file mode ")) {
      kind = "added";
      continue;
    }
    if (rawLine.startsWith("deleted file mode ")) {
      currentPath = null;
      inHunk = false;
      continue;
    }
    if (rawLine.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (
      currentPath &&
      inHunk &&
      rawLine.startsWith("+") &&
      isProductionGatePath(currentPath)
    ) additions.push({ path: currentPath, kind, line: rawLine.slice(1) });
  }
  return additions;
}

function assertProductionAddedLineSafe({ path: candidate, line }) {
  const guards = [
    ["private_key", /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i],
    ["credential_url", /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
    ["jwt", /\beyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}\b/],
    ["raw_secret_literal", /\b(?:client[_-]?secret|service[_-]?role|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[:=]\s*["'`][^"'`]{8,}["'`]/i],
    ["panel_credential", /\b(?:v1[.]panel|pb1|bs1)[.][A-Za-z0-9_-]{8,}/i],
  ];
  for (const [name, pattern] of guards) {
    if (pattern.test(line)) throw new Error(`${name}:${candidate}`);
  }
  for (const forbiddenId of FORBIDDEN_FIXTURE_IDS) {
    if (line.includes(forbiddenId)) throw new Error(`forbidden_fixture_id:${candidate}`);
  }
}

function hasUseClientDirective(source) {
  let remainder = String(source ?? "").replace(/^\uFEFF/, "");
  while (true) {
    remainder = remainder.trimStart();
    if (remainder.startsWith("//")) {
      const newline = remainder.indexOf("\n");
      remainder = newline === -1 ? "" : remainder.slice(newline + 1);
      continue;
    }
    if (remainder.startsWith("/*")) {
      const end = remainder.indexOf("*/", 2);
      if (end === -1) return false;
      remainder = remainder.slice(end + 2);
      continue;
    }
    break;
  }
  return /^["']use client["'](?:\s*;)?(?:\s|$)/.test(remainder);
}

function localModuleSpecifiers(source) {
  const specifiers = new Set();
  const staticImports = /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"'\n]+)["']/gm;
  const dynamicImports = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
  for (const pattern of [staticImports, dynamicImports]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function resolveLocalModule(fromPath, specifier, sources) {
  let unresolved;
  if (specifier.startsWith("@/")) {
    unresolved = path.posix.join("apps/customer-panel", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    unresolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  } else {
    return null;
  }
  const extension = path.posix.extname(unresolved);
  const base = /[.](?:c|m)?jsx?$/.test(extension) ? unresolved.slice(0, -extension.length) : unresolved;
  const candidates = extension && !/[.](?:c|m)?jsx?$/.test(extension)
    ? [unresolved]
    : [
        unresolved,
        `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`,
        `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`,
      ];
  return candidates.find((candidate) => sources.has(candidate)) ?? null;
}

function browserReachableChangedModules(sources, changed) {
  const queue = [...sources]
    .filter(([, source]) => hasUseClientDirective(source))
    .map(([candidate]) => candidate);
  const visited = new Set();
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);
    const source = sources.get(candidate);
    if (source === undefined) continue;
    for (const specifier of localModuleSpecifiers(source)) {
      const resolved = resolveLocalModule(candidate, specifier, sources);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return [...visited].filter((candidate) => changed.has(candidate)).sort();
}

function assertBrowserAuthoritySafe(candidate, source) {
  const guards = [
    /\b(?:TenantContext|storeId|tenantId|principalId|membershipId|planId)\b|x-(?:store|tenant|principal|membership|plan)-id/i,
    /supabase|\/api\/admin(?:\/|\b)|<iframe\b|dangerouslySetInnerHTML|\b(?:localStorage|sessionStorage)\b/i,
    /\bdocument\s*[.]\s*cookie\b/i,
    /["'`](?:authorization|cookie|x-panel-session-credential|x-database-role|x-database-url)["'`]/i,
    /(?:^|[{,]\s*)(?:authorization|cookie)\s*:/im,
  ];
  for (const pattern of guards) {
    if (pattern.test(source)) throw new Error(`browser_authority:${candidate}`);
  }
}

test("pins the approved implementation base and immutable donor", () => {
  assert.equal(git("rev-parse", `${BASE}^{commit}`), BASE);
  const integrationHeads = ["HEAD"];
  try { integrationHeads.push(git("rev-parse", "--verify", "-q", "MERGE_HEAD")); } catch {}
  assert.equal(integrationHeads.some((head) => git("merge-base", BASE, head) === BASE), true);
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(changedPaths("apps/admin").length, 0);
});

test("every donor route has one final evidenced parity decision", async () => {
  assert.equal(HEMENAKU_DONOR_PARITY.length, 86);
  assert.equal(new Set(HEMENAKU_DONOR_PARITY.map(({ donorPath }) => donorPath)).size, 86);
  assert.deepEqual(
    HEMENAKU_DONOR_PARITY.reduce((counts, entry) => ({
      ...counts,
      [entry.status]: (counts[entry.status] ?? 0) + 1,
    }), {}),
    { complete: 77, provider_gated: 6, legacy_rejected: 3 },
  );
  for (const entry of HEMENAKU_DONOR_PARITY) {
    assert.ok(["complete", "provider_gated", "legacy_rejected"].includes(entry.status), entry.donorPath);
    assert.equal(entry.status === "route_depth", false, entry.donorPath);
    const [evidenceFile, evidenceName] = entry.evidenceTest.split("#", 2);
    assert.match(evidenceFile ?? "", /[.]test[.]ts$/);
    assert.ok((evidenceName ?? "").length > 0, entry.donorPath);
    await access(path.join(ROOT, evidenceFile));
    assert.match(await read(evidenceFile), new RegExp(evidenceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), entry.donorPath);
  }
});

test("dependency lockfiles donor and deployment surfaces stay outside the completion diff", () => {
  assert.deepEqual(changedPaths(
    "package.json",
    "package-lock.json",
    "apps/*/package.json",
    "packages/*/package.json",
  ), [
    "apps/customer-panel/package.json",
    "apps/owner/package.json",
    "apps/storefront-shared/package.json",
    "package-lock.json",
    "packages/payment-adapters/package.json",
  ]);
  const forbiddenInfrastructure = git("diff", "--name-only", `${BASE}...HEAD`)
    .split("\n")
    .filter((candidate) => /^(?:[.]github|deploy|infra|infrastructure|k8s|terraform)(?:\/|$)|(?:^|\/)(?:Dockerfile|docker-compose[^/]*)$/i.test(candidate));
  assert.deepEqual(forbiddenInfrastructure, []);
});

test("changed browser-reachable client graph contains no browser-owned SaaS authority", async () => {
  const trackedSources = git("ls-files", "apps/customer-panel")
    .split("\n")
    .filter((candidate) => /[.](?:[cm]?[jt]sx?)$/.test(candidate) && !/[.](?:test|spec)[.]/.test(candidate));
  const sources = new Map(await Promise.all(trackedSources.map(async (candidate) => [candidate, await read(candidate)])));
  const changed = new Set(changedPaths("apps/customer-panel")
    .filter((candidate) => /[.](?:[cm]?[jt]sx?)$/.test(candidate) && !/[.](?:test|spec)[.]/.test(candidate)));
  const directChangedClients = [...changed].filter((candidate) => hasUseClientDirective(sources.get(candidate)));
  const reachable = browserReachableChangedModules(sources, changed);
  assert.ok(directChangedClients.length > 0);
  assert.ok(reachable.length > directChangedClients.length);
  assert.equal(reachable.some((candidate) => candidate.includes("/lib/") && !hasUseClientDirective(sources.get(candidate))), true);
  for (const candidate of reachable) assertBrowserAuthoritySafe(candidate, sources.get(candidate));
});

test("added lines in added and modified production files contain no raw secret or forbidden identity", () => {
  const additions = parseProductionAddedLines(git(
    "diff",
    "--unified=0",
    "--no-ext-diff",
    "--no-renames",
    "--diff-filter=AM",
    `${BASE}...HEAD`,
    "--",
    "apps/customer-panel",
    "packages",
    SQL,
  ));
  assert.ok(additions.some(({ kind }) => kind === "added"));
  assert.ok(additions.some(({ kind }) => kind === "modified"));
  for (const addition of additions) assertProductionAddedLineSafe(addition);
});

test("completion and successor manifests pin every changed migration artifact", async () => {
  const manifestPath = `${SQL}/phase3h-merchant-completion-manifest.json`;
  const manifest = JSON.parse(await read(manifestPath));
  assert.deepEqual(Object.keys(manifest), ["phase", "artifacts"]);
  assert.equal(manifest.phase, "phase3h-merchant-analytics");
  assert.deepEqual(manifest.artifacts.map(({ file }) => file), COMPLETION_ARTIFACTS);
  assert.equal(manifest.artifacts.length, 33);
  const lateArtifacts = manifest.artifacts
    .map(({ file }) => file)
    .filter((file) => /2026072[234]00(?:42|43|44|45|46|47|48)_/.test(file));
  assert.deepEqual(lateArtifacts, COMPLETION_ARTIFACTS.slice(12));
  for (const artifact of manifest.artifacts) {
    assert.deepEqual(Object.keys(artifact), ["file", "sha256"]);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    const bytes = await readFile(path.join(ROOT, SQL, artifact.file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.file);
  }
  const successorManifestNames = [
    "phase3c1a-customer-taxonomy-assignment-fix-manifest.json",
    "phase3c2a-catalog-import-authority-manifest.json",
    "phase3c2b-catalog-rich-import-manifest.json",
    "phase3h-analytics-manifest.json",
    "phase3h-merchant-completion-manifest.json",
    "phase3i-provider-execution-foundation-manifest.json",
    "phase3j-payment-method-admin-manifest.json",
    "phase3k-payment-adapter-runtime-manifest.json",
    "phase3l-paytr-iframe-activation-authority-manifest.json",
    "phase3m-paytr-iframe-sandbox-evidence-history-manifest.json",
    "phase3n-hosted-callback-lifecycle-manifest.json",
    "phase3o-payment-provider-keyed-lifecycle-manifest.json",
  ];
  const pinnedPaths = new Set(successorManifestNames.map((name) => `${SQL}/${name}`));
  for (const name of successorManifestNames) {
    const current = JSON.parse(await read(`${SQL}/${name}`));
    const artifacts = [
      ...(current.artifacts ?? []),
      ...(current.migrationChain ?? []),
      ...(current.rollbackArtifacts ?? []),
    ];
    assert.ok(artifacts.length > 0, name);
    for (const artifact of artifacts) {
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/, `${name}:${artifact.file}`);
      const bytes = await readFile(path.join(ROOT, SQL, artifact.file));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, `${name}:${artifact.file}`);
      pinnedPaths.add(`${SQL}/${artifact.file}`);
    }
  }
  const changedSql = changedPaths(SQL).sort();
  assert.ok(changedSql.length > 0);
  assert.deepEqual(changedSql.filter((candidate) => !pinnedPaths.has(candidate)), []);
});

test("current Phase 3 PostgreSQL inventory is exactly 30 executable harnesses and 871 scenarios", async () => {
  const expectedPaths = POSTGRES_HARNESSES.map(([harness]) => harness);
  assert.equal(POSTGRES_HARNESSES.length, 30);
  assert.equal(POSTGRES_HARNESSES.reduce((total, [, scenarios]) => total + scenarios, 0), 871);
  assert.deepEqual(
    await findPostgresHarnesses(path.join(ROOT, "tests/saas-phase3")),
    [...expectedPaths].sort(),
  );
  for (const [harness, scenarios] of POSTGRES_HARNESSES) {
    const source = await read(harness);
    const hasTotalMarker = new RegExp(`const\\s+TOTAL\\s*=\\s*${scenarios}\\b`).test(source)
      || new RegExp(`assert[.]equal[(](?:count|scenarios)\\s*,\\s*${scenarios}[)]`).test(source)
      || source.includes(`${scenarios}/${scenarios} PASS`)
      || source.includes(`\${SCENARIOS.length}/\${${scenarios}}`);
    assert.equal(hasTotalMarker, true, harness);
    assert.match(source, /(?:(?:main|run)[(][)][.]catch|await main[(][)])/u, harness);
  }
});

test("added-line parser covers added and modified production files only", () => {
  const parsed = parseProductionAddedLines([
    "diff --git a/apps/customer-panel/lib/new-client.ts b/apps/customer-panel/lib/new-client.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/apps/customer-panel/lib/new-client.ts",
    "@@ -0,0 +1 @@",
    "+const apiKey = \"added-secret-value\";",
    "diff --git a/apps/customer-panel/lib/changed-client.ts b/apps/customer-panel/lib/changed-client.ts",
    "--- a/apps/customer-panel/lib/changed-client.ts",
    "+++ b/apps/customer-panel/lib/changed-client.ts",
    "@@ -1 +1 @@",
    "-const safe = true;",
    "+const storeId = \"modified-browser-authority\";",
    "+++apiKey, clientSecret = \"literal-secret\";",
    " context with eyJremoved.context.value",
    "diff --git a/apps/customer-panel/lib/changed-client.test.ts b/apps/customer-panel/lib/changed-client.test.ts",
    "--- a/apps/customer-panel/lib/changed-client.test.ts",
    "+++ b/apps/customer-panel/lib/changed-client.test.ts",
    "@@ -1 +1 @@",
    "+const clientSecret = \"fixture-only-secret\";",
  ].join("\n"));
  assert.deepEqual(parsed, [
    { path: "apps/customer-panel/lib/new-client.ts", kind: "added", line: "const apiKey = \"added-secret-value\";" },
    { path: "apps/customer-panel/lib/changed-client.ts", kind: "modified", line: "const storeId = \"modified-browser-authority\";" },
    { path: "apps/customer-panel/lib/changed-client.ts", kind: "modified", line: "++apiKey, clientSecret = \"literal-secret\";" },
  ]);
  assert.throws(() => assertProductionAddedLineSafe(parsed[0]), /raw_secret_literal/);
  assert.throws(() => assertProductionAddedLineSafe(parsed[2]), /raw_secret_literal/);
  assert.throws(() => assertProductionAddedLineSafe({
    path: parsed[1].path,
    kind: parsed[1].kind,
    line: "const privateKey = `-----BEGIN PRIVATE KEY-----`;",
  }), /private_key/);
});

test("browser closure includes changed helpers and rejects private browser authority", () => {
  const sources = new Map([
    ["apps/customer-panel/components/Entry.tsx", "'use client'\nimport { controller } from '@/lib/demo/controller';"],
    ["apps/customer-panel/components/SemicolonEntry.tsx", "\"use client\";\nexport { client } from '@/lib/demo/client';"],
    ["apps/customer-panel/lib/demo/controller.ts", "export const controller = sessionStorage.getItem('draft');"],
    ["apps/customer-panel/lib/demo/client.ts", "export const client = fetch('/api/demo', { headers: { 'x-store-id': storeId } });"],
    ["apps/customer-panel/lib/server-only.ts", "export const storeId = 'legitimate-server-authority'; export const privateCookie = document.cookie;"],
  ]);
  const changed = new Set([
    "apps/customer-panel/lib/demo/controller.ts",
    "apps/customer-panel/lib/demo/client.ts",
    "apps/customer-panel/lib/server-only.ts",
  ]);
  assert.equal(hasUseClientDirective(sources.get("apps/customer-panel/components/Entry.tsx")), true);
  assert.equal(hasUseClientDirective(sources.get("apps/customer-panel/components/SemicolonEntry.tsx")), true);
  assert.deepEqual(browserReachableChangedModules(sources, changed), [
    "apps/customer-panel/lib/demo/client.ts",
    "apps/customer-panel/lib/demo/controller.ts",
  ]);
  for (const candidate of browserReachableChangedModules(sources, changed)) {
    assert.throws(() => assertBrowserAuthoritySafe(candidate, sources.get(candidate)), /browser_authority/);
  }
  for (const [surface, source] of [
    ["document cookie", "export const value = document.cookie;"],
    ["Authorization", "fetch('/api', { headers: { Authorization: credential } });"],
    ["Cookie", "fetch('/api', { headers: { 'cOoKiE': credential } });"],
    ["panel credential", "headers.set('X-Panel-Session-Credential', credential);"],
    ["database role", "headers.append('x-database-role', role);"],
    ["database URL", "fetch('/api', { headers: { 'X-Database-URL': databaseUrl } });"],
  ]) assert.throws(
    () => assertBrowserAuthoritySafe(`apps/customer-panel/lib/demo/${surface}.ts`, source),
    /browser_authority/,
    surface,
  );
  assert.doesNotThrow(() => assertBrowserAuthoritySafe(
    "apps/customer-panel/lib/demo/public-headers.ts",
    "const authorizationMessage = 'Giriş gerekli'; fetch('/api', { headers: { Accept: 'application/json', 'content-type': 'application/json' } });",
  ));
});
