import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runIsolatedStaging } from "./isolated-staging-runner.mjs";

const SHA = "a".repeat(40);
const REMOTE_REF = "refs/remotes/origin/codex/celebix-managed-umami-analytics";
const STAGING_DATABASE = "celebix_saas_staging_auth01";
const SQL_ROOT = "apps/owner/scripts/sql/saas";
const MANIFEST = `${SQL_ROOT}/phase3w-storefront-one-page-checkout-manifest.json`;
const PREDECESSOR = "phase3v-payment-provider-builtin-compatibility-manifest.json";
const UP = "202607280064_storefront_one_page_checkout.up.sql";
const ASSERTIONS = "202607280064_storefront_one_page_checkout_assertions.sql";
const DOWN = "202607280064_storefront_one_page_checkout.down.sql";
const PRIOR_ASSERTIONS = "202607280063_payment_provider_builtin_compatibility_assertions.sql";
const RUNNER = "tests/saas-phase3/storefront-one-page-checkout/isolated-staging-runner.mjs";
const SECRET = "not-rendered-database-password";

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixture(overrides = {}) {
  const calls = [];
  const files = new Map([
    [`${SQL_ROOT}/${PRIOR_ASSERTIONS}`, "BEGIN READ ONLY; SELECT true; ROLLBACK;\n"],
    [`${SQL_ROOT}/${UP}`, "BEGIN; SELECT '064 up'; COMMIT;\n"],
    [`${SQL_ROOT}/${ASSERTIONS}`, "BEGIN READ ONLY; SELECT '064 assertions'; ROLLBACK;\n"],
    [`${SQL_ROOT}/${DOWN}`, "BEGIN; SELECT '064 down'; COMMIT;\n"],
    [RUNNER, "runner-source-bytes\n"],
  ]);
  files.set(`${SQL_ROOT}/${PREDECESSOR}`, `${JSON.stringify({
    phase: "phase3v-payment-provider-builtin-compatibility",
    artifacts: [{
      file: PRIOR_ASSERTIONS,
      sha256: hash(files.get(`${SQL_ROOT}/${PRIOR_ASSERTIONS}`)),
    }],
  }, null, 2)}\n`);
  const manifest = `${JSON.stringify({
    phase: "phase3w-storefront-one-page-checkout",
    postgresqlMajor: 16,
    artifacts: [PREDECESSOR, UP, ASSERTIONS].map((file) => ({
      file,
      sha256: hash(files.get(`${SQL_ROOT}/${file}`)),
    })),
    rollbackArtifacts: [{ file: DOWN, sha256: hash(files.get(`${SQL_ROOT}/${DOWN}`)) }],
    externalConnections: 0,
    productionMutations: 0,
  }, null, 2)}\n`;
  files.set(MANIFEST, manifest);

  const deps = {
    calls,
    cwd: "/safe/repository",
    env: {
      PATH: "/safe/postgresql-16/bin",
      CELEBIX_RUNTIME_MODE: "approved_staging",
      CELEBIX_DEPLOYMENT_TIER: "staging",
      CELEBIX_SAAS_STAGING_DATABASE: STAGING_DATABASE,
      CELEBIX_SAAS_DATABASE_URL:
        `postgresql://storefront_runner:${SECRET}@staging-db.example.test/${STAGING_DATABASE}?sslmode=verify-full&channel_binding=require`,
      CELEBIX_SAAS_SSL_ROOT_CERT: "/safe/certs/staging-root.pem",
      CELEBIX_SAAS_BACKUP_DIRECTORY: "/safe/backups",
      CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY: "k".repeat(48),
      CELEBIX_STOREFRONT_WRITERS_DRAINED: "confirmed",
    },
    readFile(file) {
      const relative = String(file).replace("/safe/repository/", "");
      const selected = files.get(relative);
      if (selected === undefined) throw new Error(`unexpected read ${relative}`);
      return selected;
    },
    git(args) {
      calls.push(["git", args]);
      if (args[0] === "cat-file") return "";
      if (args[0] === "rev-parse" && args[1] === "HEAD") return `${SHA}\n`;
      if (args[0] === "rev-parse" && args[1] === REMOTE_REF) return `${SHA}\n`;
      if (args[0] === "status") return "";
      if (args[0] === "show") {
        const separator = args[1].indexOf(":");
        const relative = args[1].slice(separator + 1);
        const selected = files.get(relative);
        if (selected === undefined) throw new Error(`unexpected source ${relative}`);
        return selected;
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
    exists(file) {
      calls.push(["exists", file]);
      return false;
    },
    stat(file) {
      calls.push(["stat", file]);
      if (String(file).endsWith("staging-root.pem")) {
        return { isFile: () => true, isDirectory: () => false, mode: 0o100600, size: 2048 };
      }
      if (String(file) === "/safe/backups") {
        return { isFile: () => false, isDirectory: () => true, mode: 0o40700, size: 0 };
      }
      return { isFile: () => true, isDirectory: () => false, mode: 0o100600, size: 4096 };
    },
    realpath(file) {
      calls.push(["realpath", file]);
      return file;
    },
    chmod(file, mode) { calls.push(["chmod", file, mode]); },
    mkdtemp() {
      calls.push(["mkdtemp"]);
      return "/safe/backups/plain-064-temp";
    },
    rm(file, options) { calls.push(["rm", file, options]); },
    spawn(executable, args, options = {}) {
      calls.push(["spawn", executable, args, options]);
      if (executable === "psql" && args.includes("-At") && args.includes("-c")) {
        const query = args[args.indexOf("-c") + 1];
        if (query.includes("zero_impact")) return { status: 0, stdout: "t|0\n", stderr: "" };
        if (query.includes("storefront_checkout_preflight()") && !query.includes("server_version_num")) {
          return { status: 0, stdout: "t\n", stderr: "" };
        }
        const expectsAbsent = query.includes("to_regprocedure('saas.storefront_checkout_preflight()') IS NULL");
        return {
          status: 0,
          stdout: `16|${STAGING_DATABASE}|isolated_staging|f|t|t|t|${expectsAbsent ? "absent" : "present"}\n`,
          stderr: "",
        };
      }
      if (executable === "pg_restore") return { status: 0, stdout: "; Archive created at 2026-07-29\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
  };
  return Object.assign(deps, overrides);
}

function processCalls(deps) {
  return deps.calls.filter(([kind]) => kind === "spawn");
}

test("phase3w manifest pins the exact predecessor and 064 migration bytes", () => {
  const repositoryRoot = new URL("../../../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL(MANIFEST, repositoryRoot), "utf8"));
  const expected = {
    phase: "phase3w-storefront-one-page-checkout",
    postgresqlMajor: 16,
    artifacts: [PREDECESSOR, UP, ASSERTIONS],
    rollbackArtifacts: [DOWN],
    externalConnections: 0,
    productionMutations: 0,
  };

  assert.equal(manifest.phase, expected.phase);
  assert.equal(manifest.postgresqlMajor, expected.postgresqlMajor);
  assert.equal(manifest.externalConnections, expected.externalConnections);
  assert.equal(manifest.productionMutations, expected.productionMutations);
  assert.deepEqual(manifest.artifacts.map(({ file }) => file), expected.artifacts);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), expected.rollbackArtifacts);

  for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) {
    const bytes = readFileSync(new URL(`${SQL_ROOT}/${artifact.file}`, repositoryRoot));
    assert.equal(artifact.sha256, hash(bytes), `${artifact.file} checksum drifted`);
  }
});

test("dry-run requires a canonical source SHA at exact local and remote commit with clean pinned bytes", () => {
  const invalid = fixture();
  assert.throws(() => runIsolatedStaging([], invalid), /isolated staging runner failed/);
  assert.throws(
    () => runIsolatedStaging(["--source-sha", "A".repeat(40)], fixture()),
    /isolated staging runner failed/,
  );

  const remoteMismatch = fixture({
    git(args) {
      remoteMismatch.calls.push(["git", args]);
      if (args[0] === "cat-file") return "";
      if (args[0] === "rev-parse" && args[1] === "HEAD") return `${SHA}\n`;
      if (args[0] === "rev-parse" && args[1] === REMOTE_REF) return `${"b".repeat(40)}\n`;
      throw new Error("source read must not continue after remote mismatch");
    },
  });
  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--dry-run"], remoteMismatch),
    /isolated staging runner failed/,
  );
  assert.equal(processCalls(remoteMismatch).length, 0);

  const deps = fixture();
  assert.deepEqual(
    runIsolatedStaging(["--source-sha", SHA, "--dry-run"], deps),
    { mode: "dry-run", sourceSha: SHA },
  );
  assert.equal(processCalls(deps).length, 0);
  assert.ok(deps.calls.some(([kind, args]) => kind === "git" && args[0] === "status"));
});

test("dry-run follows the pinned predecessor manifest and rejects drifted 063 assertion bytes", () => {
  const clean = fixture();
  const deps = fixture({
    readFile(file) {
      if (String(file).endsWith(PRIOR_ASSERTIONS)) {
        return "BEGIN READ ONLY; SELECT false; ROLLBACK;\n";
      }
      return clean.readFile(file);
    },
  });

  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--dry-run"], deps),
    /isolated staging runner failed/,
  );
  assert.equal(processCalls(deps).length, 0);
});

test("apply enforces TLS certificate verification and SCRAM channel binding before connecting", () => {
  for (const envPatch of [
    { CELEBIX_SAAS_SSL_ROOT_CERT: undefined },
    { CELEBIX_SAAS_DATABASE_URL: `postgresql://storefront_runner:${SECRET}@staging-db.example.test/${STAGING_DATABASE}?sslmode=require&channel_binding=require` },
    { CELEBIX_SAAS_DATABASE_URL: `postgresql://storefront_runner:${SECRET}@staging-db.example.test/${STAGING_DATABASE}?sslmode=verify-full&channel_binding=disable` },
  ]) {
    const base = fixture();
    const deps = fixture({ env: { ...base.env, ...envPatch } });
    assert.throws(
      () => runIsolatedStaging(["--source-sha", SHA, "--apply"], deps),
      /isolated staging runner failed/,
    );
    assert.equal(processCalls(deps).length, 0);
  }
});

test("apply rejects a caller-selected alternate staging database before connecting", () => {
  const alternate = "celebix_saas_staging_shadow";
  const base = fixture();
  const deps = fixture({
    env: {
      ...base.env,
      CELEBIX_SAAS_STAGING_DATABASE: alternate,
      CELEBIX_SAAS_DATABASE_URL:
        `postgresql://storefront_runner:${SECRET}@staging-db.example.test/${alternate}?sslmode=verify-full&channel_binding=require`,
    },
  });

  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--apply"], deps),
    /isolated staging runner failed/,
  );
  assert.equal(processCalls(deps).length, 0);
});

test("apply rejects a filesystem root backup target before chmod or database access", () => {
  const base = fixture();
  const deps = fixture({
    env: { ...base.env, CELEBIX_SAAS_BACKUP_DIRECTORY: "/" },
    stat(file) {
      deps.calls.push(["stat", file]);
      if (String(file).endsWith("staging-root.pem")) {
        return { isFile: () => true, isDirectory: () => false, mode: 0o100600, size: 2048 };
      }
      if (String(file) === "/") {
        return { isFile: () => false, isDirectory: () => true, mode: 0o40700, size: 0 };
      }
      return { isFile: () => true, isDirectory: () => false, mode: 0o100600, size: 4096 };
    },
  });

  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--apply"], deps),
    /isolated staging runner failed/,
  );
  assert.equal(deps.calls.some(([kind, file]) => kind === "chmod" && file === "/"), false);
  assert.equal(processCalls(deps).length, 0);
});

test("apply rejects a backup directory symlink that resolves to a broad target", () => {
  const deps = fixture({
    realpath(file) {
      deps.calls.push(["realpath", file]);
      return String(file) === "/safe/backups" ? "/" : file;
    },
  });

  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--apply"], deps),
    /isolated staging runner failed/,
  );
  assert.equal(deps.calls.some(([kind, file]) => kind === "chmod" && file === "/safe/backups"), false);
  assert.equal(processCalls(deps).length, 0);
});

test("apply proves the 063 base read-only, verifies backup inventory, encrypts it, applies exact 064, and rechecks source", () => {
  const deps = fixture();
  const result = runIsolatedStaging(["--source-sha", SHA, "--apply"], deps);
  assert.equal(result.mode, "applied");
  assert.equal(result.sourceSha, SHA);
  assert.match(result.encryptedBackup, /storefront-checkout-before-064-[a-f0-9]{40}[.]dump[.]enc$/);

  const processes = processCalls(deps);
  const sequence = processes.map(([, command, args]) => `${command}:${args.join(" ")}`);
  const at = (fragment) => sequence.findIndex((entry) => entry.includes(fragment));
  assert.ok(at("server_version_num") >= 0);
  assert.ok(at(PRIOR_ASSERTIONS) > at("server_version_num"));
  assert.ok(at("pg_dump:-Fc") > at(PRIOR_ASSERTIONS));
  assert.ok(at("pg_restore:-l") > at("pg_dump:-Fc"));
  assert.ok(at("openssl:enc -aes-256-cbc -pbkdf2") > at("pg_restore:-l"));
  assert.ok(at(UP) > at("openssl:enc -aes-256-cbc -pbkdf2"));
  assert.ok(at(ASSERTIONS) > at(UP));
  assert.ok(at("SELECT saas.storefront_checkout_preflight()") > at(ASSERTIONS));

  const migration = processes.find(([, command, args]) =>
    command === "psql" && args.some((argument) => argument.endsWith(UP)));
  assert.equal(migration[2].includes("--single-transaction"), true);
  for (const [, command, args, options] of processes) {
    assert.equal(args.join(" ").includes(SECRET), false, `${command} argv leaked password`);
    if (["psql", "pg_dump", "pg_restore"].includes(command)) {
      assert.equal(options.env.PGSSLMODE, "verify-full");
      assert.equal(options.env.PGCHANNELBINDING, "require");
      assert.equal(options.env.PGSSLROOTCERT, "/safe/certs/staging-root.pem");
    }
  }
  const openssl = processes.find(([, command]) => command === "openssl");
  assert.deepEqual(openssl[2].slice(0, 5), ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in"]);
  assert.match(openssl[2].join(" "), /-pass env:CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY/);
  assert.ok(deps.calls.some(([kind, file, mode]) => kind === "chmod" && file === result.encryptedBackup && mode === 0o600));
  assert.ok(deps.calls.some(([kind, file]) => kind === "rm" && file.endsWith("before-064.dump")));
  assert.ok(deps.calls.filter(([kind, args]) => kind === "git" && args[0] === "rev-parse" && args[1] === REMOTE_REF).length >= 2);
});

test("apply fails before backup when the database sentinel is not the exact writable 063 isolated-staging base", () => {
  const deps = fixture({
    spawn(executable, args, options) {
      deps.calls.push(["spawn", executable, args, options]);
      if (executable === "psql" && args.includes("-At")) {
        return { status: 0, stdout: `16|${STAGING_DATABASE}|isolated_staging|f|t|t|t|present\n`, stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--apply"], deps),
    /isolated staging runner failed/,
  );
  assert.equal(processCalls(deps).some(([, command]) => command === "pg_dump"), false);
});

test("down requires writer-drain attestation and exact zero-impact state before backup or DDL", () => {
  const base = fixture();
  const noDrain = fixture({ env: { ...base.env, CELEBIX_STOREFRONT_WRITERS_DRAINED: undefined } });
  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--down"], noDrain),
    /isolated staging runner failed/,
  );
  assert.equal(processCalls(noDrain).length, 0);

  const impacted = fixture({
    spawn(executable, args, options) {
      impacted.calls.push(["spawn", executable, args, options]);
      if (executable === "psql" && args.includes("-At") && args.includes("-c")) {
        const query = args[args.indexOf("-c") + 1];
        if (query.includes("zero_impact")) return { status: 0, stdout: "f|0\n", stderr: "" };
        return { status: 0, stdout: `16|${STAGING_DATABASE}|isolated_staging|f|t|t|t|present\n`, stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.throws(
    () => runIsolatedStaging(["--source-sha", SHA, "--down"], impacted),
    /isolated staging runner failed/,
  );
  assert.equal(processCalls(impacted).some(([, command]) => command === "pg_dump"), false);
});

test("down drains writers, verifies zero impact, backs up, rolls 064 down, and proves 063 authority", () => {
  const deps = fixture();
  const result = runIsolatedStaging(["--source-sha", SHA, "--down"], deps);
  assert.equal(result.mode, "rolled-back");

  const processes = processCalls(deps);
  const sequence = processes.map(([, command, args]) => `${command}:${args.join(" ")}`);
  const at = (fragment) => sequence.findIndex((entry) => entry.includes(fragment));
  assert.ok(at("zero_impact") >= 0);
  assert.ok(at("pg_dump:-Fc") > at("zero_impact"));
  assert.ok(at(DOWN) > at("pg_dump:-Fc"));
  assert.ok(at(PRIOR_ASSERTIONS) > at(DOWN));
  const down = processes.find(([, command, args]) =>
    command === "psql" && args.some((argument) => argument.endsWith(DOWN)));
  assert.equal(down[2].includes("--single-transaction"), true);
  const zeroImpact = processes.find(([, command, args]) =>
    command === "psql" && args.includes("-c") && args.join(" ").includes("zero_impact"));
  assert.match(zeroImpact[2].join(" "), /celebix_saas_owner/);
});
