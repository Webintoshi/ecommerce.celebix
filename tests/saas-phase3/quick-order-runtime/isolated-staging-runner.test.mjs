import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runner = await import("./isolated-staging-runner.mjs");

const SHA = "a".repeat(40);
const MANIFEST = "apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json";
const ARTIFACTS = ["202607220026_quick_order_checkout_runtime","202607220027_quick_order_checkout_api","202607220028_quick_order_redemption_expiry_authority","202607220029_quick_order_settlement_authority"].flatMap((name) => [
  `${name}.up.sql`, `${name}.down.sql`, `${name}_assertions.sql`,
]);

function dependencies(overrides = {}) {
  const calls = [];
  const artifacts = Object.fromEntries(ARTIFACTS.map((file) => [file, `SELECT ${JSON.stringify(file)};\n`]));
  const manifest = JSON.stringify({ artifacts: ARTIFACTS.map((file) => ({ file, sha256: createHash("sha256").update(artifacts[file]).digest("hex") })) });
  return {
    calls,
    env: {
      CELEBIX_RUNTIME_MODE: "approved_staging",
      CELEBIX_DEPLOYMENT_TIER: "staging",
      CELEBIX_SAAS_STAGING_DATABASE: "celebix_saas_staging",
      CELEBIX_SAAS_DATABASE_URL: "postgresql://workflow:unsafe@isolated.test/celebix_saas_staging",
    },
    cwd: "/safe/repository",
    readFile(path) {
      if (path.endsWith(MANIFEST)) return manifest;
      const file = ARTIFACTS.find((candidate) => path.endsWith(candidate));
      if (file) return artifacts[file];
      if (path.endsWith("202607220024_quick_order_links_assertions.sql") || path.endsWith("202607220025_quick_order_links_api_assertions.sql")) return "SELECT 1;";
      if (path.endsWith("isolated-staging-preflight.sql")) return "SELECT 1;";
      throw new Error(`unexpected read ${path}`);
    },
    mkdir(path, options) { calls.push(["mkdir", path, options]); },
    chmod(path, mode) { calls.push(["chmod", path, mode]); },
    mkdtemp() { return "/safe/backup"; },
    git(args) {
      calls.push(["git", args]);
      if (args[0] === "rev-parse") return SHA;
      if (args[0] === "ls-tree") return MANIFEST;
      if (args[0] === "show") {
        if (args[1].endsWith(MANIFEST)) return manifest;
        const file = ARTIFACTS.find((candidate) => args[1].endsWith(candidate));
        if (file) return artifacts[file];
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
    spawn(command, args, options) {
      calls.push(["spawn", command, args, options]);
      if (command === "psql" && args.includes("-At")) return { status: 0, stdout: "16|celebix_saas_staging|isolated_staging|f|f\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
    ...overrides,
  };
}

test("dry-run requires a canonical source SHA and never starts a process", () => {
  const deps = dependencies();
  assert.throws(() => runner.runIsolatedStaging([], deps), /--source-sha/);
  assert.throws(() => runner.runIsolatedStaging(["--source-sha", "A".repeat(40)], deps), /lowercase/);
  const result = runner.runIsolatedStaging(["--source-sha", SHA], deps);
  assert.deepEqual(result, { mode: "dry-run", sourceSha: SHA });
  assert.deepEqual(deps.calls, []);
});

test("apply refuses unsafe authority before connection or backup", () => {
  const deps = dependencies({ env: { ...dependencies().env, CELEBIX_DEPLOYMENT_TIER: "production" } });
  assert.throws(() => runner.runIsolatedStaging(["--source-sha", SHA, "--apply"], deps), /unsafe authority/i);
  assert.equal(deps.calls.some(([kind]) => kind === "spawn"), false);
});

test("apply verifies local and source manifest bytes, then preflights, backs up, migrates 026 through 029 and asserts", () => {
  const base = dependencies();
  const deps = dependencies({ env: { ...base.env, PATH: "/safe/postgresql-16/bin" } });
  const result = runner.runIsolatedStaging(["--source-sha", SHA, "--apply"], deps);
  assert.deepEqual(result, { mode: "applied", sourceSha: SHA });
  const processes = deps.calls.filter(([kind]) => kind === "spawn");
  assert.equal(processes[0][1], "psql");
  assert.equal(processes.some(([, command]) => command === "pg_dump"), true);
  const sql = processes.filter(([, command]) => command === "psql").slice(1).map(([, , args]) => args.join(" ")).join("\n");
  assert.match(sql, /isolated-staging-preflight[.]sql/);
  for (const migration of ["026_quick_order_checkout_runtime", "027_quick_order_checkout_api", "028_quick_order_redemption_expiry_authority", "029_quick_order_settlement_authority"]) assert.match(sql, new RegExp(migration));
  const sequence = processes.map(([, command, args]) => `${command}:${args.join(" ")}`);
  const at = (fragment) => sequence.findIndex((entry) => entry.includes(fragment));
  assert.ok(at("isolated-staging-preflight.sql") < at("pg_dump:-Fc"));
  assert.ok(at("pg_dump:-Fc") < at("026_quick_order_checkout_runtime.up.sql"));
  assert.ok(at("026_quick_order_checkout_runtime.up.sql") < at("027_quick_order_checkout_api.up.sql"));
  assert.ok(at("027_quick_order_checkout_api.up.sql") < at("028_quick_order_redemption_expiry_authority.up.sql"));
  assert.ok(at("028_quick_order_redemption_expiry_authority.up.sql") < at("029_quick_order_settlement_authority.up.sql"));
  assert.ok(processes.findIndex(([, command]) => command === "pg_dump") < processes.findIndex(([, command, args]) => command === "psql" && args.join(" ").includes("026_quick_order_checkout_runtime.up.sql")), "custom backup precedes every DDL migration");
  for (const process of processes.filter(([, command, args]) => command === "psql" && /20260722002[6-9]_quick_order_.*[.]up[.]sql/.test(args.join(" ")))) assert.equal(process[2].includes("--single-transaction"), true);
  assert.equal(deps.calls.some(([kind, value]) => kind === "mkdir" && value === "/safe/backup"), true);
  assert.equal(deps.calls.some(([kind, value]) => kind === "chmod" && value === "/safe/backup"), true);
  assert.equal(deps.calls.some(([kind, value, mode]) => kind === "chmod" && value.endsWith("before-quick-order-runtime.dump") && mode === 0o600), true);
  assert.equal(JSON.stringify(deps.calls).includes("unsafe@"), false, "connection material must not be recorded or rendered");
  assert.equal(processes[0][3].env.PATH, "/safe/postgresql-16/bin", "database child must retain executable PATH");
  assert.ok(deps.calls.findIndex(([kind, args]) => kind === "git" && args[0] === "ls-tree") < deps.calls.findIndex(([kind]) => kind === "spawn"), "source artifacts are checked before the first database connection");
});

test("apply rejects incompatible server sentinel before preflight and never exposes its connection string", () => {
  const deps = dependencies({ spawn(command, args, options) {
    deps.calls.push(["spawn", command, args, options]);
    if (command === "psql" && args.includes("-At")) return { status: 0, stdout: "16|celebix_saas_staging|production|f|f\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  } });
  assert.throws(() => runner.runIsolatedStaging(["--source-sha", SHA, "--apply"], deps), /server sentinel/i);
  assert.equal(deps.calls.filter(([kind]) => kind === "spawn").length, 1);
});

test("read-only preflight requires the immutable quick-order operation relation by its exact name", async () => {
  const preflight = await readFile(new URL("./isolated-staging-preflight.sql", import.meta.url), "utf8");
  assert.match(preflight, /'saas[.]quick_order_link_operations'/);
  assert.doesNotMatch(preflight, /'saas[.]quick_link_operations'/);
});

test("read-only preflight accepts the immutable host-resolver schema usage grant", async () => {
  const preflight = await readFile(new URL("./isolated-staging-preflight.sql", import.meta.url), "utf8");
  assert.doesNotMatch(preflight, /OR pg_catalog[.]has_schema_privilege\('celebix_saas_host_resolver','saas','USAGE'\)/);
});
