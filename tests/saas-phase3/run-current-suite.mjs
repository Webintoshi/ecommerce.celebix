import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PHASE3 = path.join(ROOT, "tests/saas-phase3");
const matrix = JSON.parse(readFileSync(path.join(PHASE3, "current-test-matrix.json"), "utf8"));
const historical = new Set(matrix.historicalSnapshots.map(({ file }) => file));
const requiredHarnesses = Object.freeze([
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
]);

function runRequiredHarness({ file, total, line, completion }) {
  const result = spawnSync(process.execPath, [file], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${file} exited unsuccessfully`);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.equal((output.match(line) ?? []).length, total, `${file} did not report ${total}/${total} exact successful scenarios`);
  assert.match(output, completion, `${file} did not report its exact completion total`);
}

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return discover(target);
    if (!entry.name.endsWith(".test.mjs")) return [];
    return [path.relative(ROOT, target)];
  });
}

const discovered = discover(PHASE3).sort();
const unknownHistorical = [...historical].filter((file) => !discovered.includes(file));
if (unknownHistorical.length) {
  process.stderr.write(`Current Phase 3 matrix references missing snapshots:\n${unknownHistorical.join("\n")}\n`);
  process.exit(1);
}
const current = discovered.filter((file) => !historical.has(file));
process.stdout.write(`Running ${current.length} current cumulative Phase 3 test files.\n`);
for (const { file, reason } of matrix.historicalSnapshots) {
  process.stdout.write(`HISTORICAL_SCOPE_SNAPSHOT ${file}: ${reason}\n`);
}
for (const harness of requiredHarnesses) runRequiredHarness(harness);
const result = spawnSync(process.execPath, ["--experimental-transform-types", "--test", "--test-concurrency=1", ...current], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
