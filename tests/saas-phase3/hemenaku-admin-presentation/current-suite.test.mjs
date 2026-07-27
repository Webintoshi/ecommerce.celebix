import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");

async function testFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await testFiles(target));
    else if (entry.name.endsWith(".test.mjs")) result.push(path.relative(ROOT, target));
  }
  return result.sort();
}

test("classifies every Phase 3 test as current or an immutable historical snapshot", async () => {
  const matrix = JSON.parse(await readFile(path.join(ROOT, "tests/saas-phase3/current-test-matrix.json"), "utf8"));
  assert.equal(matrix.schemaVersion, 1);
  assert.deepEqual(matrix.historicalSnapshots, []);
  for (const snapshot of matrix.historicalSnapshots) {
    assert.match(snapshot.reason, /immutable|later phase|scope snapshot/i);
  }
  const all = await testFiles(path.join(ROOT, "tests/saas-phase3"));
  const excluded = new Set(matrix.historicalSnapshots.map(({ file }) => file));
  assert.equal(all.filter((file) => excluded.has(file)).length, excluded.size);
  assert.equal(all.every((file) => !excluded.has(file) || file.endsWith("static-security.test.mjs")), true);
});

test("runs the current cumulative suite without shell interpolation or silent exclusions", async () => {
  const runner = await readFile(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["test:saas-phase3:current"], "node tests/saas-phase3/run-current-suite.mjs");
  assert.match(runner, /spawnSync\(process\.execPath/);
  assert.match(runner, /--experimental-transform-types/);
  assert.match(runner, /--test/);
  assert.match(runner, /--test-concurrency=1/);
  assert.match(runner, /current-test-matrix\.json/);
  assert.doesNotMatch(runner, /shell\s*:\s*true|execSync|curl|https?:\/\//);
});
