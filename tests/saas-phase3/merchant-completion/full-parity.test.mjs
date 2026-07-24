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
  ["tests/saas-phase3/catalog-administration/postgres-harness.mjs", 16],
  ["tests/saas-phase3/catalog-import-previews/postgres-harness.mjs", 25],
  ["tests/saas-phase3/catalog-product-tags/postgres-harness.mjs", 20],
  ["tests/saas-phase3/customer-management/postgres-harness.mjs", 21],
  ["tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs", 30],
  ["tests/saas-phase3/inventory-locations/postgres-harness.mjs", 44],
  ["tests/saas-phase3/inventory-purchasing/postgres-harness.mjs", 34],
  ["tests/saas-phase3/merchant-admin-modules/postgres-harness.mjs", 39],
  ["tests/saas-phase3/merchant-analytics/postgres-harness.mjs", 24],
  ["tests/saas-phase3/order-management/postgres-harness.mjs", 40],
  ["tests/saas-phase3/pilot-storefront/postgres-harness.mjs", 30],
  ["tests/saas-phase3/price-lists/postgres-harness.mjs", 38],
  ["tests/saas-phase3/pricing-preview/postgres-harness.mjs", 34],
  ["tests/saas-phase3/product-catalog-api/postgres-harness.mjs", 26],
  ["tests/saas-phase3/product-catalog/postgres-harness.mjs", 33],
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

test("pins the approved implementation base and immutable donor", () => {
  assert.equal(git("rev-parse", `${BASE}^{commit}`), BASE);
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
  }
});

test("dependency lockfiles donor and deployment surfaces stay outside the completion diff", () => {
  assert.deepEqual(changedPaths(
    "package.json",
    "package-lock.json",
    "apps/*/package.json",
    "packages/*/package.json",
  ), []);
  const forbiddenInfrastructure = git("diff", "--name-only", `${BASE}...HEAD`)
    .split("\n")
    .filter((candidate) => /^(?:[.]github|deploy|infra|infrastructure|k8s|terraform)(?:\/|$)|(?:^|\/)(?:Dockerfile|docker-compose[^/]*)$/i.test(candidate));
  assert.deepEqual(forbiddenInfrastructure, []);
});

test("changed production client components contain no browser-owned SaaS authority", async () => {
  const productionTypeScript = changedPaths("apps/customer-panel")
    .filter((candidate) => /[.](?:ts|tsx)$/.test(candidate) && !/[.]test[.]/.test(candidate));
  const clientComponents = [];
  for (const candidate of productionTypeScript) {
    const source = await read(candidate);
    if (/^\s*["']use client["'];/m.test(source)) clientComponents.push([candidate, source]);
  }
  assert.ok(clientComponents.length > 0);
  for (const [candidate, source] of clientComponents) {
    assert.doesNotMatch(source, /\b(?:TenantContext|storeId|tenantId|principalId|membershipId|planId)\b|x-(?:store|tenant|principal|membership|plan)-id/i, candidate);
    assert.doesNotMatch(source, /supabase|\/api\/admin(?:\/|\b)|<iframe\b|dangerouslySetInnerHTML|\b(?:localStorage|sessionStorage)\b/i, candidate);
  }
});

test("new production authority contains no raw secret credential or forbidden fixture identity", async () => {
  const additions = git(
    "diff",
    "--name-only",
    "--diff-filter=A",
    `${BASE}...HEAD`,
    "--",
    "apps/customer-panel",
    "packages",
    SQL,
  ).split("\n").filter((candidate) =>
    candidate &&
    !/[.]test[.]/.test(candidate) &&
    !/(?:^|\/)(?:__fixtures__|fixtures?|tests?)(?:\/|$)/.test(candidate),
  );
  const forbiddenIds = Object.freeze([
    ["10000000", "0000", "4000", "8000", "000000000001"].join("-"),
    ["20000000", "0000", "4000", "8000", "000000000001"].join("-"),
  ]);
  for (const candidate of additions) {
    const source = await read(candidate);
    assert.doesNotMatch(source, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i, candidate);
    assert.doesNotMatch(source, /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i, candidate);
    assert.doesNotMatch(source, /\beyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}\b/, candidate);
    assert.doesNotMatch(source, /\b(?:client[_-]?secret|service[_-]?role|api[_-]?key|access[_-]?token)\b\s*[:=]\s*["'][^"']{8,}["']/i, candidate);
    assert.doesNotMatch(source, /\b(?:v1[.]panel|pb1|bs1)[.][A-Za-z0-9_-]{8,}/i, candidate);
    for (const forbiddenId of forbiddenIds) assert.equal(source.includes(forbiddenId), false, candidate);
  }
});

test("completion manifest exactly pins migrations 038 through 047 including 042 through 047", async () => {
  const manifestPath = `${SQL}/phase3h-merchant-completion-manifest.json`;
  const manifest = JSON.parse(await read(manifestPath));
  assert.deepEqual(Object.keys(manifest), ["phase", "artifacts"]);
  assert.equal(manifest.phase, "phase3h-merchant-analytics");
  assert.deepEqual(manifest.artifacts.map(({ file }) => file), COMPLETION_ARTIFACTS);
  assert.equal(manifest.artifacts.length, 30);
  const lateArtifacts = manifest.artifacts
    .map(({ file }) => file)
    .filter((file) => /2026072[23]00(?:42|43|44|45|46|47)_/.test(file));
  assert.deepEqual(lateArtifacts, COMPLETION_ARTIFACTS.slice(12));
  for (const artifact of manifest.artifacts) {
    assert.deepEqual(Object.keys(artifact), ["file", "sha256"]);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    const bytes = await readFile(path.join(ROOT, SQL, artifact.file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.file);
  }
  assert.deepEqual(
    changedPaths(SQL).sort(),
    [...COMPLETION_ARTIFACTS.map((file) => `${SQL}/${file}`), manifestPath].sort(),
  );
});

test("current Phase 3 PostgreSQL inventory is exactly 21 executable harnesses and 641 scenarios", async () => {
  const expectedPaths = POSTGRES_HARNESSES.map(([harness]) => harness);
  assert.equal(POSTGRES_HARNESSES.length, 21);
  assert.equal(POSTGRES_HARNESSES.reduce((total, [, scenarios]) => total + scenarios, 0), 641);
  assert.deepEqual(
    await findPostgresHarnesses(path.join(ROOT, "tests/saas-phase3")),
    [...expectedPaths].sort(),
  );
  for (const [harness, scenarios] of POSTGRES_HARNESSES) {
    const source = await read(harness);
    const totalMarker = new RegExp(
      `(?:const\\s+TOTAL\\s*=\\s*${scenarios}\\b|scenarios:\\s*["']${scenarios}/${scenarios}["']|PASS\\s+\\$\\{count\\}/${scenarios}\\b|count\\s*,\\s*${scenarios}\\b)`,
    );
    assert.match(source, totalMarker, harness);
    assert.match(source, /(?:main[(][)][.]catch|await main[(][)])/u, harness);
  }
});
