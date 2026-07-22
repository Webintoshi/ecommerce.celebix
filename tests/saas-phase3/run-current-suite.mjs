import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PHASE3 = path.join(ROOT, "tests/saas-phase3");
const matrix = JSON.parse(readFileSync(path.join(PHASE3, "current-test-matrix.json"), "utf8"));
const historical = new Set(matrix.historicalSnapshots.map(({ file }) => file));

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
const result = spawnSync(process.execPath, ["--experimental-transform-types", "--test", "--test-concurrency=1", ...current], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
