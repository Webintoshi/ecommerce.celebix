import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PHASE3 = path.join(ROOT, "tests/saas-phase3");
const matrix = JSON.parse(
  readFileSync(path.join(PHASE3, "current-test-matrix.json"), "utf8"),
);
const historical = new Set(matrix.historicalSnapshots.map(({ file }) => file));
const requiredHarnesses = Object.freeze([
  Object.freeze({
    file: "tests/saas-phase3/promotions-studio/postgres-harness.mjs",
    total: 49,
    line: /^PASS \d+\/49 .+$/gm,
    completion: /^PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE 49\/49$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/commerce-analytics-cart-recovery/postgres-harness.mjs",
    total: 33,
    line: /^PASS \d+\/33 (?!commerce analytics cart recovery PostgreSQL 16 rehearsal complete$).+$/gm,
    completion:
      /^PASS 33\/33 commerce analytics cart recovery PostgreSQL 16 rehearsal complete$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/redis-cache-foundation/redis-harness.mjs",
    total: 10,
    line: /^PASS \d+\/10 (?!Redis cache foundation rehearsal complete$).+$/gm,
    completion: /^PASS 10\/10 Redis cache foundation rehearsal complete$/m,
    transformTypes: true,
  }),
  Object.freeze({
    file: "tests/saas-phase3/barcode-label-studio/postgres-harness.mjs",
    total: 21,
    line: /^PASS \d+\/21 (?!barcode label studio PostgreSQL 16 rehearsal complete$).+$/gm,
    completion:
      /^PASS 21\/21 barcode label studio PostgreSQL 16 rehearsal complete$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/catalog-products-complete/postgres-harness.mjs",
    total: 14,
    line: /^PASS \d+ .+$/gm,
    completion:
      /^PASS 14\/14 catalog products complete PostgreSQL 16 rehearsal complete$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/catalog-product-list-projection/postgres-harness.mjs",
    total: 10,
    line: /^PASS \d+ .+$/gm,
    completion:
      /^PASS 10\/10 catalog product list projection PostgreSQL 16 rehearsal complete$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/catalog-product-global-query/postgres-harness.mjs",
    total: 8,
    line: /^PASS \d+ .+$/gm,
    completion:
      /^PASS 8\/8 catalog product global query PostgreSQL 16 rehearsal complete$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/tenant-custom-admin-domains/postgres-harness.mjs",
    total: 13,
    line: /^PASS \d+ .+$/gm,
    completion:
      /^PASS 13\/13 tenant custom admin domains PostgreSQL 16 rehearsal complete$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/auto-admin-domain-bundles/postgres-harness.mjs",
    total: 13,
    line: /^PASS \d+ .+$/gm,
    completion:
      /^PASS 13\/13 automatic admin domain bundles PostgreSQL 16 rehearsal complete$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/inventory-locations/postgres-harness.mjs",
    total: 44,
    line: /^inventory location scenario \d+\/44: .+$/gm,
    completion: /^inventory location scenario 44\/44: .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/pricing-preview/postgres-harness.mjs",
    total: 34,
    line: /^PASS \d+\/34 .+$/gm,
    completion: /^PASS 34\/34 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/exact-record-lookups-analytics/postgres-harness.mjs",
    total: 18,
    line: /^PASS \d+\/18 .+$/gm,
    completion: /^18\/18 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs",
    total: 53,
    line: /^PASS \d+\/53 .+$/gm,
    completion: /^53\/53 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/payment-provider-admin/postgres-harness.mjs",
    total: 23,
    line: /^PASS \d+\/23 .+$/gm,
    completion: /^23\/23 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/payment-adapter-runtime/postgres-harness.mjs",
    total: 30,
    line: /^PASS \d+\/30 .+$/gm,
    completion: /^30\/30 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/paytr-iframe-activation-authority/postgres-harness.mjs",
    total: 1,
    line: /^1\/1 PASS$/gm,
    completion: /^1\/1 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/payment-sandbox-evidence-history/postgres-harness.mjs",
    total: 9,
    line: /^PASS \d+\/9 .+$/gm,
    completion: /^PASS 9\/9 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/hosted-callback-lifecycle/postgres-harness.mjs",
    total: 13,
    line: /^PASS \d+\/13 .+$/gm,
    completion: /^PASS 13\/13 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/payment-provider-keyed-lifecycle/postgres-harness.mjs",
    total: 19,
    line: /^PASS \d+\/19 .+$/gm,
    completion: /^PASS 19\/19 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/quick-order-hosted-payment-authority/postgres-harness.mjs",
    total: 17,
    line: /^PASS \d+\/17 .+$/gm,
    completion: /^PASS 17\/17 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/quick-order-hosted-payment-bridge/postgres-harness.mjs",
    total: 14,
    line: /^PASS \d+\/14 .+$/gm,
    completion: /^PASS 14\/14 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/payment-method-single-active-provider/postgres-harness.mjs",
    total: 12,
    line: /^PASS \d+\/12 .+$/gm,
    completion: /^PASS 12\/12 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/iyzico-iframe-tenant-sandbox-evidence/postgres-harness.mjs",
    total: 28,
    line: /^PASS \d+\/28 .+$/gm,
    completion: /^PASS 28\/28 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/iyzico-iframe-tenant-activation-runtime/postgres-harness.mjs",
    total: 24,
    line: /^PASS \d+\/24 .+$/gm,
    completion: /^PASS 061 PostgreSQL harness \(24\/24\)$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/built-in-payment-methods/postgres-harness.mjs",
    total: 13,
    line: /^PASS \d+\/13 .+$/gm,
    completion: /^PASS 13\/13 .+$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/storefront-policy-search/postgres-harness.mjs",
    total: 32,
    line: /^PASS \d+\/32 .+$/gm,
    completion: /^32\/32 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs",
    total: 38,
    line: /^PASS \d+\/38 .+$/gm,
    completion: /^38\/38 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/durable-abandoned-cart-integration/postgres-harness.mjs",
    total: 37,
    line: /^PASS \d+\/37 .+$/gm,
    completion: /^37\/37 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/storefront-hosted-checkout/postgres-harness.mjs",
    total: 33,
    line: /^PASS \d+\/33 .+$/gm,
    completion: /^33\/33 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/storefront-customer-identity/postgres-harness.mjs",
    total: 18,
    line: /^PASS \d+\/18 .+$/gm,
    completion: /^18\/18 PASS$/m,
  }),
  Object.freeze({
    file: "tests/saas-phase3/starter-theme-composition/postgres-harness.mjs",
    total: 32,
    line: /^PASS \d+\/32 .+$/gm,
    completion: /^32\/32 PASS$/m,
  }),
]);
const gateRank = Object.freeze({
  "provider-execution-foundation": 0,
  "payment-provider-admin": 1,
  "payment-adapter-runtime": 2,
  "paytr-iframe-activation-authority": 3,
  "payment-sandbox-evidence-history": 4,
  "hosted-callback-lifecycle": 5,
  "payment-provider-keyed-lifecycle": 6,
  "quick-order-hosted-payment-authority": 7,
  "quick-order-hosted-payment-bridge": 8,
  "payment-method-single-active-provider": 9,
  "iyzico-iframe-tenant-sandbox-evidence": 10,
  "iyzico-iframe-tenant-activation-runtime": 11,
  "built-in-payment-methods": 12,
  "storefront-policy-search": 13,
  "storefront-cart-checkout": 14,
  "durable-abandoned-cart-integration": 15,
  "storefront-customer-identity": 16,
  "starter-theme-composition": 17,
  "storefront-hosted-checkout": 18,
});
const requiredCurrentTests = Object.freeze([
  "tests/saas-phase3/payment-adapter-runtime/evidence-artifact.test.mjs",
  "tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs",
  "tests/saas-phase3/quick-order-hosted-payment-bridge/static-security.test.mjs",
  "tests/saas-phase3/iyzico-iframe-tenant-sandbox-evidence/static-security.test.mjs",
  "tests/saas-phase3/iyzico-iframe-tenant-activation-runtime/static-security.test.mjs",
  "tests/saas-phase3/starter-commerce/in-process.test.mjs",
  "tests/saas-phase3/starter-commerce/static-security.test.mjs",
  "tests/saas-phase3/storefront-custom-domains/lifecycle.test.mjs",
  "tests/saas-phase3/storefront-hosted-payment-security.test.mjs",
]);

function runRequiredHarness({
  file,
  total,
  line,
  completion,
  transformTypes = false,
}) {
  const result = spawnSync(
    process.execPath,
    [...(transformTypes ? ["--experimental-transform-types"] : []), file],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${file} exited unsuccessfully`);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.equal(
    (output.match(line) ?? []).length,
    total,
    `${file} did not report ${total}/${total} exact successful scenarios`,
  );
  assert.match(
    output,
    completion,
    `${file} did not report its exact completion total`,
  );
}

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return discover(target);
    if (!entry.name.endsWith(".test.mjs")) return [];
    return [path.relative(ROOT, target)];
  });
}

const discovered = discover(PHASE3).sort((left, right) => {
  const leftGroup = left.split("/").at(-2);
  const rightGroup = right.split("/").at(-2);
  const rankDifference =
    (gateRank[leftGroup] ?? 2) - (gateRank[rightGroup] ?? 2);
  return rankDifference || left.localeCompare(right);
});
const unknownHistorical = [...historical].filter(
  (file) => !discovered.includes(file),
);
if (unknownHistorical.length) {
  process.stderr.write(
    `Current Phase 3 matrix references missing snapshots:\n${unknownHistorical.join("\n")}\n`,
  );
  process.exit(1);
}
const current = discovered.filter((file) => !historical.has(file));
const missingRequiredCurrentTests = requiredCurrentTests.filter(
  (file) => !current.includes(file),
);
if (missingRequiredCurrentTests.length) {
  process.stderr.write(
    `Required current payment gates are missing:\n${missingRequiredCurrentTests.join("\n")}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `Running ${current.length} current cumulative Phase 3 test files.\n`,
);
for (const { file, reason } of matrix.historicalSnapshots) {
  process.stdout.write(`HISTORICAL_SCOPE_SNAPSHOT ${file}: ${reason}\n`);
}
for (const harness of requiredHarnesses) runRequiredHarness(harness);
const result = spawnSync(
  process.execPath,
  [
    "--experimental-transform-types",
    "--test",
    "--test-concurrency=1",
    ...current,
  ],
  {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
