import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const OWNER = path.join(ROOT, "apps/owner");
const STALE_FAILURES = Object.freeze([
  "app/api/internal/self-serve/oidc-callback/route.test.ts",
  "app/api/self-serve/register/route.test.ts",
  "lib/self-serve-flags.test.ts",
  "lib/self-serve-onboarding.test.ts",
  "lib/self-serve-persistent-registration-adapter.test.ts",
  "lib/self-serve-registration.test.ts",
  "lib/self-serve-request-store.test.ts",
]);

function sourceTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory() && !["node_modules", ".next"].includes(entry.name)) return sourceTests(location);
    return entry.isFile() && /[.]test[.](?:ts|mjs)$/.test(entry.name) ? [path.relative(ROOT, location)] : [];
  });
}

const result = spawnSync("node", ["--experimental-transform-types", "--test", ...sourceTests(OWNER)], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: "--conditions=react-server", NEXT_IGNORE_INCORRECT_LOCKFILE: "1" },
});
assert.notEqual(result.status, 0, "the documented stale Owner baseline must still be nonzero");
const output = `${result.stdout}\n${result.stderr}`;
const summary = output.match(/(?:#|ℹ) pass (\d+)[\s\S]*?(?:#|ℹ) fail (\d+)/);
assert.ok(summary, "Owner test summary is required");
assert.equal(Number(summary[1]), 336);
assert.equal(Number(summary[2]), 7);
const failureSection = output.split("✖ failing tests:").at(-1) ?? "";
const failed = [
  ...failureSection.matchAll(/test at (?:apps\/owner\/)?([^:\n]+[.]test[.]ts):/g),
  ...failureSection.matchAll(/✖ (?:apps\/owner\/)?([^\s:]+[.]test[.]ts) /g),
].map((match) => match[1].replace(/^apps\/owner\//, ""));
assert.deepEqual([...new Set(failed)].sort(), [...STALE_FAILURES].sort());
