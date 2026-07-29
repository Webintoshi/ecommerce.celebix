import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWNER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_ROOT = path.resolve(OWNER_ROOT, "../..");
const EVIDENCE_TEST = path.join(
  REPO_ROOT,
  "tests/saas-phase3/payment-adapter-runtime/evidence-artifact.test.mjs",
);

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".next" || entry.name === "node_modules") return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return discover(target);
    return entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.mjs")
      ? [target]
      : [];
  });
}

const tests = [...discover(OWNER_ROOT), EVIDENCE_TEST]
  .sort((left, right) => left.localeCompare(right));
if (!tests.includes(EVIDENCE_TEST)) {
  throw new Error("owner_evidence_test_registration_missing");
}
const result = spawnSync(
  process.execPath,
  [
    "--conditions=react-server",
    "--experimental-transform-types",
    "--test",
    "--test-concurrency=1",
    ...tests,
  ],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
