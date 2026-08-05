import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  accessSync,
  appendFileSync,
  constants as fsConstants,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DISPOSABLE_IMAGE = "postgres:16-alpine";
export const REQUIRED_NATIVE_TOOLS = ["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore", "pg_isready"];

export const REQUIRED_APPLY_ORDER = [
  "202607110001_roles.up.sql",
  "202607110002_foundation.up.sql",
  "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql",
  "202607110004_grants.sql",
  "202607110005_catalog_assertions.sql",
];

const REFUSED_ENVIRONMENT_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "PGHOST",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "SUPABASE_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OWNER_SUPABASE_SERVICE_ROLE_KEY",
  "DOCKER_HOST",
  "CONTAINER_HOST",
];

export function validatePinnedImage(image) {
  if (!/^postgres:[1-9][0-9]*-alpine$/.test(image)) {
    throw new Error("Harness requires a pinned official PostgreSQL major image.");
  }
  return image;
}

export function assertSafeEnvironment(environment = process.env) {
  for (const key of REFUSED_ENVIRONMENT_KEYS) {
    if (environment[key]) {
      throw new Error(`${key} is refused; this harness creates and addresses its own disposable database.`);
    }
  }
}

function findExecutableOnPath(name, environment = process.env) {
  const searchPath = environment.PATH ?? "";
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}

export function selectContainerEngine(findExecutable = (name) => findExecutableOnPath(name)) {
  if (findExecutable("docker")) return "docker";
  if (findExecutable("podman")) return "podman";
  return null;
}

export function selectExecutionBackend(findExecutable = (name) => findExecutableOnPath(name)) {
  const docker = findExecutable("docker");
  if (docker) return { kind: "container", engine: "docker", executable: docker };
  const podman = findExecutable("podman");
  if (podman) return { kind: "container", engine: "podman", executable: podman };

  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, findExecutable(name)]));
  if (Object.values(executables).every(Boolean)) return { kind: "native", executables };
  return null;
}

export function assertLocalEngineEndpoint(endpoint) {
  const value = String(endpoint ?? "").trim();
  if (/^(?:unix|npipe):\/\//i.test(value)) return value;
  if (/^ssh:\/\/(?:[^@/]+@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:\/|$)/i.test(value)) return value;
  throw new Error(`Remote container-engine endpoint is refused: ${value || "<empty>"}`);
}

export function createRunNames(token = randomBytes(8).toString("hex")) {
  if (!/^[a-f0-9]{16}$/.test(token)) {
    throw new Error("Disposable run token must be exactly 16 lowercase hexadecimal characters.");
  }
  return {
    container: `celebix-phase2a1-${token}`,
    network: `celebix-phase2a1-net-${token}`,
    primaryDatabase: "phase2a1_primary",
    restoreDatabase: "phase2a1_restore",
    rollbackDatabase: "phase2a1_rollback",
    reapplyDatabase: "phase2a1_reapply",
  };
}

export function normalizeSchemaDump(dump) {
  return dump
    .split(/\r?\n/)
    .filter((line) => !/^-- Dumped (?:from database|by pg_dump) version /.test(line))
    .map((line) => line.replace(/^(\\(?:un)?restrict) [A-Za-z0-9]+$/, "$1 <random-token>"))
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

const modulePath = fileURLToPath(import.meta.url);
const testDir = path.dirname(modulePath);
const repoRoot = path.resolve(testDir, "..", "..", "..");
const sqlDir = path.join(repoRoot, "apps", "owner", "scripts", "sql", "saas");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function quoteCommandPart(value) {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatCommand(engine, args) {
  return [engine, ...args].map(quoteCommandPart).join(" ");
}

function runEngine(engine, args, options = {}) {
  const result = spawnSync(engine, args, {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(`Command failed (${result.status}): ${formatCommand(engine, args)}${stderr ? `\n${stderr}` : ""}`);
  }
  return result;
}

function resolveContainerEngineEndpoint(engine) {
  if (engine === "docker") {
    const context = runEngine(engine, ["context", "show"]).stdout.trim();
    assert(context, "Docker did not report an active context.");
    return runEngine(engine, ["context", "inspect", context, "--format={{.Endpoints.docker.Host}}"])
      .stdout.trim();
  }

  const connections = JSON.parse(runEngine(engine, ["system", "connection", "list", "--format=json"]).stdout);
  const selected = connections.find((connection) => connection.Default === true)
    ?? (connections.length === 1 ? connections[0] : null);
  assert(selected?.URI, "Podman did not report one unambiguous default connection.");
  return selected.URI;
}

function commandForPsql(backend, names, database) {
  const common = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database];
  if (backend.kind === "container") {
    return { executable: backend.executable, args: ["exec", "-i", names.container, "psql", ...common] };
  }
  return {
    executable: backend.executables.psql,
    args: ["-h", backend.socketDirectory, "-p", String(backend.port), ...common],
  };
}

function runSql(backend, names, database, sql) {
  const command = commandForPsql(backend, names, database);
  return runEngine(command.executable, command.args, { input: sql }).stdout.trim();
}

function runSqlFile(engine, names, database, file) {
  const sql = readFileSync(path.join(sqlDir, file), "utf8");
  return runSql(engine, names, database, sql);
}

function runSqlFileAsMigrator(engine, names, database, file) {
  const sql = readFileSync(path.join(sqlDir, file), "utf8");
  return runSql(
    engine,
    names,
    database,
    `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${sql}\nRESET SESSION AUTHORIZATION;`,
  );
}

function expectSqlFailure(engine, names, database, sql, label) {
  const command = commandForPsql(engine, names, database);
  const result = runEngine(command.executable, command.args, {
    input: sql,
    allowFailure: true,
  });
  assert(result.status !== 0, `${label} unexpectedly succeeded`);
  return result.stderr.trim();
}

function runSqlAsync(engine, names, database, sql) {
  return new Promise((resolve) => {
    const command = commandForPsql(engine, names, database);
    const child = spawn(command.executable, command.args, {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ status: null, stdout, stderr, error }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}

async function runConcurrentSql(engine, names, database, statements) {
  return Promise.all(statements.map((sql) => runSqlAsync(engine, names, database, sql)));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateManifestChecksums() {
  const manifestPath = path.join(sqlDir, "phase2a1-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert(manifest.bundleId === "phase2a1-202607110001", "Unexpected Phase 2A1 bundle ID.");
  assert(manifest.postgresqlMajor === 16, "Disposable PostgreSQL major drifted.");
  for (const artifact of manifest.artifacts) {
    const content = readFileSync(path.join(sqlDir, artifact.file));
    assert(sha256(content) === artifact.sha256, `Manifest checksum drift: ${artifact.file}`);
  }
  return manifest;
}

function databaseIdentifier(value) {
  assert(/^[a-z][a-z0-9_]{2,62}$/.test(value), `Unsafe disposable database name: ${value}`);
  return `"${value}"`;
}

function createDatabase(engine, names, database) {
  const identifier = databaseIdentifier(database);
  runSql(engine, names, "postgres", `CREATE DATABASE ${identifier}; GRANT CREATE ON DATABASE ${identifier} TO celebix_saas_owner;`);
}

function applyFoundation(engine, names, database, { includeRoles = false } = {}) {
  if (includeRoles) runSqlFile(engine, names, database, "202607110001_roles.up.sql");
  runSqlFileAsMigrator(engine, names, database, "202607110002_foundation.up.sql");
  runSqlFileAsMigrator(engine, names, database, "202607110003_free_starter.seed.sql");
  runSqlFileAsMigrator(engine, names, database, "202607110003_plan_versions.freeze.sql");
  runSqlFileAsMigrator(engine, names, database, "202607110004_grants.sql");
  runSqlFileAsMigrator(engine, names, database, "202607110005_catalog_assertions.sql");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function tenantIds(suffix) {
  return {
    principal: `10000000-0000-4000-8000-00000000000${suffix}`,
    store: `20000000-0000-4000-8000-00000000000${suffix}`,
    domain: `30000000-0000-4000-8000-00000000000${suffix}`,
    membership: `40000000-0000-4000-8000-00000000000${suffix}`,
    subscription: `50000000-0000-4000-8000-00000000000${suffix}`,
    settingLocale: `60000000-0000-4000-8000-0000000000${suffix}1`,
    settingCurrency: `60000000-0000-4000-8000-0000000000${suffix}2`,
    settingTheme: `60000000-0000-4000-8000-0000000000${suffix}3`,
    operation: `70000000-0000-4000-8000-00000000000${suffix}`,
  };
}

function tenantFixture(suffix) {
  const ids = tenantIds(suffix);
  const slug = suffix === "1" ? "tenant-a" : "tenant-b";
  const timestamp = `2026-07-11T0${suffix}:00:00.000Z`;
  const hostname = `${slug}.example.test`;
  const payload = {
    schemaVersion: 1,
    operationId: ids.operation,
    replayed: false,
    store: { id: ids.store, slug, status: "active" },
    primaryDomain: {
      schemaVersion: 1,
      hostname,
      domainId: ids.domain,
      domainType: "platform_subdomain",
      storeId: ids.store,
      storeSlug: slug,
      canonicalHostname: hostname,
      status: "active",
      cacheVersion: 1,
    },
    membership: {
      schemaVersion: 1,
      id: ids.membership,
      principalId: ids.principal,
      storeId: ids.store,
      role: "store_owner",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    plan: {
      schemaVersion: 1,
      planId: "00000000-0000-4000-8000-000000000001",
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: ["catalog", "orders", "customers", "content", "media", "analytics", "checkout"],
      limits: { products: 100, staff: 1, storageBytes: 1000000000, monthlyOrders: 100, customDomains: 0 },
      validFrom: timestamp,
    },
    provisioningStatus: "ready",
    panelUrl: `https://panel.example.test/stores/${slug}`,
    storefrontUrl: `https://${hostname}`,
  };

  return `
BEGIN;
SET LOCAL ROLE celebix_saas_bootstrap;
INSERT INTO saas.tenant_operations (
  id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at
) VALUES (
  '${ids.operation}', 'fixture-${slug}', '${suffix.repeat(64)}', 'processing',
  '${timestamp}', '${timestamp}', '${timestamp}'
);
INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at)
VALUES ('${ids.principal}', 'https://identity.example.test', 'subject-${suffix}', 'owner-${suffix}@example.test', true, '${timestamp}', '${timestamp}');
INSERT INTO saas.stores (id, name, slug, status, locale, currency, theme_key, created_at, updated_at)
VALUES ('${ids.store}', 'Tenant ${suffix}', '${slug}', 'active', 'tr', 'TRY', 'starter', '${timestamp}', '${timestamp}');
INSERT INTO saas.domains (id, store_id, normalized_hostname, domain_type, status, canonical, cache_version, created_at, updated_at)
VALUES ('${ids.domain}', '${ids.store}', '${hostname}', 'platform_subdomain', 'active', true, 1, '${timestamp}', '${timestamp}');
INSERT INTO saas.memberships (id, principal_id, store_id, role, status, created_at, updated_at)
VALUES ('${ids.membership}', '${ids.principal}', '${ids.store}', 'store_owner', 'active', '${timestamp}', '${timestamp}');
INSERT INTO saas.subscriptions (id, store_id, plan_id, plan_code, plan_version, status, valid_from, created_at, updated_at)
VALUES ('${ids.subscription}', '${ids.store}', '00000000-0000-4000-8000-000000000001', 'free_starter', 1, 'active', '${timestamp}', '${timestamp}', '${timestamp}');
INSERT INTO saas.store_settings (id, store_id, key, value, created_at, updated_at) VALUES
  ('${ids.settingLocale}', '${ids.store}', 'locale', '"tr"'::jsonb, '${timestamp}', '${timestamp}'),
  ('${ids.settingCurrency}', '${ids.store}', 'currency', '"TRY"'::jsonb, '${timestamp}', '${timestamp}'),
  ('${ids.settingTheme}', '${ids.store}', 'themeKey', '"starter"'::jsonb, '${timestamp}', '${timestamp}');
UPDATE saas.tenant_operations
SET status = 'committed',
    result_store_id = '${ids.store}',
    result_domain_id = '${ids.domain}',
    result_membership_id = '${ids.membership}',
    result_principal_id = '${ids.principal}',
    result_subscription_id = '${ids.subscription}',
    result_plan_id = '00000000-0000-4000-8000-000000000001',
    result_payload = ${sqlLiteral(JSON.stringify(payload))}::jsonb,
    committed_at = '${timestamp}',
    updated_at = '${timestamp}'
WHERE id = '${ids.operation}' AND status = 'processing';
COMMIT;
`;
}

function roleQuery(role, body, context = {}) {
  const settings = [
    context.principal ? `SET LOCAL app.current_principal_id = '${context.principal}';` : "",
    context.store ? `SET LOCAL app.current_store_id = '${context.store}';` : "",
  ].filter(Boolean).join("\n");
  return `BEGIN;\nSET LOCAL ROLE ${role};\n${settings}\n${body}\nCOMMIT;`;
}

function assertQuery(engine, names, database, sql, expected, label) {
  const actual = runSql(engine, names, database, sql).split(/\r?\n/).filter(Boolean).at(-1) ?? "";
  assert(actual === expected, `${label}: expected ${expected}, received ${actual}`);
}

function runConstraintTests(engine, names, database) {
  // constraint tests
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at)
    VALUES ('81000000-0000-4000-8000-000000000001', '', 'blank', 'blank@example.test', true, now(), now());
    COMMIT;
  `, "blank principal authority");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.stores (id, name, slug, status, locale, currency, theme_key, created_at, updated_at)
    VALUES ('82000000-0000-4000-8000-000000000001', 'Duplicate', 'tenant-a', 'active', 'tr', 'TRY', 'starter', now(), now());
    COMMIT;
  `, "duplicate active slug");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.domains (id, store_id, normalized_hostname, domain_type, status, canonical, cache_version, created_at, updated_at)
    VALUES ('83000000-0000-4000-8000-000000000001', '${tenantIds("1").store}', 'Upper.example.test', 'custom', 'active', false, 1, now(), now());
    COMMIT;
  `, "unnormalized hostname");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.tenant_operations (
      id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at
    ) VALUES (
      '84000000-0000-4000-8000-000000000001', 'invalid-committed', '${"8".repeat(64)}',
      'committed', now(), now(), now()
    );
    COMMIT;
  `, "committed operation without result snapshot");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.tenant_operations (
      id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at
    ) VALUES (
      '84000000-0000-4000-8000-000000000002', 'invalid-result-shape', '${"9".repeat(64)}',
      'processing', '2026-07-11T02:00:00.000Z', '2026-07-11T02:00:00.000Z', '2026-07-11T02:00:00.000Z'
    );
    UPDATE saas.tenant_operations AS target
    SET status = 'committed',
        result_store_id = source.result_store_id,
        result_domain_id = source.result_domain_id,
        result_membership_id = source.result_membership_id,
        result_principal_id = source.result_principal_id,
        result_subscription_id = source.result_subscription_id,
        result_plan_id = source.result_plan_id,
        result_payload = pg_catalog.jsonb_set(
          source.result_payload, '{operationId}',
          pg_catalog.to_jsonb('84000000-0000-4000-8000-000000000002'::text), false
        ) #- ARRAY['membership', 'principalId'],
        committed_at = '2026-07-11T02:00:00.000Z',
        updated_at = '2026-07-11T02:00:00.000Z'
    FROM saas.tenant_operations AS source
    WHERE target.id = '84000000-0000-4000-8000-000000000002'
      AND source.id = '${tenantIds("1").operation}';
    COMMIT;
  `, "malformed committed result payload");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    UPDATE saas.plans SET status = 'inactive' WHERE plan_code = 'free_starter' AND version = 1;
    COMMIT;
  `, "immutable plan version");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    UPDATE saas.tenant_operations SET updated_at = updated_at + interval '1 second'
    WHERE id = '${tenantIds("1").operation}';
    COMMIT;
  `, "immutable committed result snapshot");

  runSql(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at)
    VALUES ('85000000-0000-4000-8000-000000000001', 'https://identity.example.test', 'email-metadata-only', 'owner-1@example.test', true, now(), now());
    COMMIT;
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    DELETE FROM saas.principals WHERE id = '85000000-0000-4000-8000-000000000001';
    COMMIT;
  `);
}

function runSnapshotIntegrityTests(engine, names, database) {
  const sourceId = tenantIds("1").operation;
  const cases = [
    ["01", "snapshot store drift", "", "pg_catalog.jsonb_set(payload, '{store,slug}', '\"drifted-store\"'::jsonb, false)"],
    ["02", "snapshot canonical domain drift", `UPDATE saas.domains SET canonical = false WHERE id = '${tenantIds("1").domain}';`, "payload"],
    ["03", "snapshot membership authority drift", `UPDATE saas.memberships SET role = 'admin' WHERE id = '${tenantIds("1").membership}';`, "payload"],
    ["04", "snapshot membership timestamp drift", "", "pg_catalog.jsonb_set(payload, '{membership,updatedAt}', '\"2026-07-11T01:00:01.000Z\"'::jsonb, false)"],
    ["05", "snapshot subscription status drift", `UPDATE saas.subscriptions SET status = 'inactive' WHERE id = '${tenantIds("1").subscription}';`, "payload"],
    ["06", "snapshot subscription validity drift", `UPDATE saas.subscriptions SET valid_until = '2026-07-11T01:30:00.000Z' WHERE id = '${tenantIds("1").subscription}';`, "payload"],
    ["07", "snapshot plan identity drift", "", "pg_catalog.jsonb_set(payload, '{plan,version}', '2'::jsonb, false)"],
    ["08", "snapshot feature order drift", "", "pg_catalog.jsonb_set(payload, '{plan,features}', '[\"orders\",\"catalog\",\"customers\",\"content\",\"media\",\"analytics\",\"checkout\"]'::jsonb, false)"],
    ["09", "snapshot effective limits drift", "", "pg_catalog.jsonb_set(payload, '{plan,limits,products}', '99'::jsonb, false)"],
    ["10", "snapshot storefront hostname drift", "", "pg_catalog.jsonb_set(payload, '{storefrontUrl}', '\"https://other.example.test\"'::jsonb, false)"],
  ];

  for (const [suffix, label, persistedMutation, payloadExpression] of cases) {
    const operationId = `88000000-0000-4000-8000-0000000000${suffix}`;
    const fingerprint = suffix.padStart(2, "0").repeat(32);
    expectSqlFailure(engine, names, database, `
      BEGIN;
      SET LOCAL ROLE celebix_saas_owner;
      ${persistedMutation}
      INSERT INTO saas.tenant_operations (
        id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at
      ) VALUES (
        '${operationId}', 'snapshot-negative-${suffix}', '${fingerprint}', 'processing',
        '2026-07-11T02:00:00.000Z', '2026-07-11T02:00:00.000Z', '2026-07-11T02:00:00.000Z'
      );
      UPDATE saas.tenant_operations AS target
      SET status = 'committed',
          result_store_id = source.result_store_id,
          result_domain_id = source.result_domain_id,
          result_membership_id = source.result_membership_id,
          result_principal_id = source.result_principal_id,
          result_subscription_id = source.result_subscription_id,
          result_plan_id = source.result_plan_id,
          result_payload = transformed.result_payload,
          committed_at = '2026-07-11T02:00:00.000Z',
          updated_at = '2026-07-11T02:00:00.000Z'
      FROM saas.tenant_operations AS source
      CROSS JOIN LATERAL (
        SELECT ${payloadExpression.replaceAll("payload", `pg_catalog.jsonb_set(source.result_payload, '{operationId}', pg_catalog.to_jsonb('${operationId}'::text), false)`)} AS result_payload
      ) AS transformed
      WHERE target.id = '${operationId}' AND source.id = '${sourceId}';
      COMMIT;
    `, label);
  }
}

function runRolePrivilegeTests(engine, names, database) {
  // role privilege tests
  assertQuery(
    engine,
    names,
    database,
    "SELECT count(*) FROM pg_catalog.pg_authid WHERE rolname LIKE 'celebix_saas_%' AND rolpassword IS NOT NULL;",
    "0",
    "cluster-admin passwordless role proof",
  );
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    CREATE TABLE saas.bootstrap_must_not_create (id integer);
    COMMIT;
  `, "bootstrap DDL denial");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    UPDATE saas.principals SET issuer = 'https://attacker.example.test' WHERE id = '${tenantIds("1").principal}';
    COMMIT;
  `, "bootstrap authority-column denial");
  for (const [column, value] of [
    ["email", "'mutated@example.test'"],
    ["email_verified", "false"],
    ["updated_at", "updated_at + interval '1 second'"],
  ]) {
    expectSqlFailure(engine, names, database, `
      BEGIN; SET LOCAL ROLE celebix_saas_app;
      SELECT pg_catalog.set_config('app.principal_id', '${tenantIds("1").principal}', true);
      SELECT pg_catalog.set_config('app.store_id', '${tenantIds("1").store}', true);
      UPDATE saas.principals SET ${column} = ${value} WHERE id = '${tenantIds("1").principal}';
      COMMIT;
    `, `application principal mutation denial: ${column}`);
  }
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_app;
    ALTER TABLE saas.stores DISABLE ROW LEVEL SECURITY;
    COMMIT;
  `, "runtime RLS mutation denial");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_host_resolver;
    SELECT count(*) FROM saas.domains;
    COMMIT;
  `, "host resolver direct table denial");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_workflow;
    SELECT count(*) FROM saas.stores;
    COMMIT;
  `, "workflow placeholder tenant access denial");
  expectSqlFailure(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_observability;
    SELECT email FROM saas.principals;
    COMMIT;
  `, "observability raw PII denial");
  runSqlFileAsMigrator(engine, names, database, "202607110005_catalog_assertions.sql");
}

function runRlsIsolationTests(engine, names, database) {
  // RLS isolation tests
  const a = tenantIds("1");
  const b = tenantIds("2");
  const allRoles = "celebix_saas_app";
  assertQuery(engine, names, database, roleQuery(allRoles, "SELECT count(*) FROM saas.stores;"), "0", "no GUC");
  assertQuery(engine, names, database, roleQuery(allRoles, "SELECT count(*) FROM saas.stores;", { store: a.store }), "0", "store GUC only");
  assertQuery(engine, names, database, roleQuery(allRoles, "SELECT count(*) FROM saas.memberships;", { principal: a.principal }), "1", "principal membership discovery");
  assertQuery(engine, names, database, roleQuery(allRoles, "SELECT count(*) FROM saas.stores;", { principal: a.principal }), "0", "principal GUC without store");
  assertQuery(engine, names, database, roleQuery(allRoles, `SELECT count(*) FROM saas.stores WHERE id = '${a.store}';`, { principal: a.principal, store: a.store }), "1", "valid principal/store membership");
  assertQuery(engine, names, database, roleQuery(allRoles, `SELECT count(*) FROM saas.stores WHERE id = '${b.store}';`, { principal: a.principal, store: a.store }), "0", "cross-store read denial");
  assertQuery(engine, names, database, roleQuery(allRoles, "SELECT count(*) FROM saas.stores;", { principal: a.principal, store: b.store }), "0", "wrong principal/store pair");
  assertQuery(engine, names, database, roleQuery(allRoles, "SELECT count(*) FROM saas.store_settings;", { principal: a.principal, store: a.store }), "3", "own store settings");
  assertQuery(engine, names, database, roleQuery(allRoles, `SELECT count(*) FROM saas.store_settings WHERE store_id = '${b.store}';`, { principal: a.principal, store: a.store }), "0", "cross-store settings read denial");

  expectSqlFailure(engine, names, database, roleQuery(allRoles, `
    INSERT INTO saas.store_settings (id, store_id, key, value, created_at, updated_at)
    VALUES ('86000000-0000-4000-8000-000000000001', '${b.store}', 'locale', '"tr"'::jsonb, now(), now());
  `, { principal: a.principal, store: a.store }), "cross-store insert denial");

  assertQuery(engine, names, database, roleQuery(allRoles, `
    WITH changed AS (
      UPDATE saas.store_settings SET value = '"changed"'::jsonb, updated_at = now()
      WHERE store_id = '${b.store}' RETURNING 1
    ) SELECT count(*) FROM changed;
  `, { principal: a.principal, store: a.store }), "0", "cross-store update denial");

  assertQuery(engine, names, database, roleQuery(allRoles, `
    WITH removed AS (
      DELETE FROM saas.store_settings WHERE store_id = '${b.store}' RETURNING 1
    ) SELECT count(*) FROM removed;
  `, { principal: a.principal, store: a.store }), "0", "cross-store delete denial");

  runSql(engine, names, database, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status = 'revoked', updated_at = now() WHERE id = '${a.membership}'; COMMIT;`);
  assertQuery(engine, names, database, roleQuery(allRoles, "SELECT count(*) FROM saas.stores;", { principal: a.principal, store: a.store }), "0", "revoked membership denial");
  runSql(engine, names, database, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status = 'active', updated_at = '2026-07-11T01:00:00.000Z' WHERE id = '${a.membership}'; COMMIT;`);

  const resetOutput = runSql(engine, names, database, `
    BEGIN;
    SET LOCAL ROLE celebix_saas_app;
    SET LOCAL app.current_principal_id = '${a.principal}';
    SET LOCAL app.current_store_id = '${a.store}';
    SELECT count(*) FROM saas.stores;
    COMMIT;
    BEGIN;
    SET LOCAL ROLE celebix_saas_app;
    SELECT count(*) FROM saas.stores;
    COMMIT;
  `).split(/\r?\n/).filter((line) => /^\d+$/.test(line));
  assert(resetOutput.join(",") === "1,0", `pool context reset expected 1,0, received ${resetOutput.join(",")}`);
}

function runResolverTests(engine, names, database) {
  // exact-host resolver tests
  const a = tenantIds("1");
  assertQuery(engine, names, database, roleQuery("celebix_saas_host_resolver", "SELECT count(*) FROM saas.resolve_store_host('tenant-a.example.test');"), "1", "active exact host");
  assertQuery(engine, names, database, roleQuery("celebix_saas_host_resolver", "SELECT count(*) FROM saas.resolve_store_host('unknown.example.test');"), "0", "unknown exact host denial");
  assertQuery(engine, names, database, roleQuery("celebix_saas_host_resolver", "SELECT count(*) FROM saas.resolve_store_host('Tenant-A.example.test');"), "0", "unnormalized host denial");
  runSql(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.domains (id, store_id, normalized_hostname, domain_type, status, canonical, cache_version, created_at, updated_at)
    VALUES ('87000000-0000-4000-8000-000000000001', '${a.store}', 'alias-a.example.test', 'custom', 'active', false, 2, now(), now());
    COMMIT;
  `);
  assertQuery(engine, names, database, roleQuery("celebix_saas_host_resolver", "SELECT canonical_hostname FROM saas.resolve_store_host('alias-a.example.test');"), "tenant-a.example.test", "alias canonical same-store projection");
  runSql(engine, names, database, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.domains SET status = 'disabled', updated_at = now() WHERE id = '${a.domain}'; COMMIT;`);
  assertQuery(engine, names, database, roleQuery("celebix_saas_host_resolver", "SELECT count(*) FROM saas.resolve_store_host('tenant-a.example.test');"), "0", "inactive host denial");
  runSql(engine, names, database, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.domains SET status = 'active', updated_at = now() WHERE id = '${a.domain}'; COMMIT;`);
}

function assertOneWinner(results, label) {
  const successes = results.filter((result) => result.status === 0).length;
  const failures = results.filter((result) => result.status !== 0).length;
  assert(successes === 1 && failures === 1, `${label}: expected one success and one rejected transaction, received ${successes}/${failures}`);
}

async function runConcurrencyTests(engine, names, database) {
  const raceTime = "2026-07-11T03:00:00.000Z";
  const sourceOperationId = tenantIds("1").operation;

  const committedWinnerSql = (operationId, key, fingerprint) => `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.tenant_operations (
      id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at
    ) VALUES (
      '${operationId}', '${key}', '${fingerprint}', 'processing', '${raceTime}', '${raceTime}', '${raceTime}'
    );
    SELECT pg_catalog.pg_sleep(0.2);
    UPDATE saas.tenant_operations AS target
    SET status = 'committed',
        result_store_id = source.result_store_id,
        result_domain_id = source.result_domain_id,
        result_membership_id = source.result_membership_id,
        result_principal_id = source.result_principal_id,
        result_subscription_id = source.result_subscription_id,
        result_plan_id = source.result_plan_id,
        result_payload = pg_catalog.jsonb_set(
          source.result_payload, '{operationId}', pg_catalog.to_jsonb('${operationId}'::text), false
        ),
        committed_at = '${raceTime}',
        updated_at = '${raceTime}'
    FROM saas.tenant_operations AS source
    WHERE target.id = '${operationId}' AND source.id = '${sourceOperationId}';
    COMMIT;
  `;

  const losingClaimSql = (operationId, key, fingerprint) => `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    WITH claimed AS (
      INSERT INTO saas.tenant_operations (
        id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at
      ) VALUES (
        '${operationId}', '${key}', '${fingerprint}', 'processing', '${raceTime}', '${raceTime}', '${raceTime}'
      ) ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    )
    SELECT 'claimed:' || count(*) FROM claimed;
    -- Loser separate SELECT occurs only after the unique-key wait has observed the winner commit.
    SELECT concat_ws('|', 'loser separate select', status, payload_fingerprint,
      (result_payload IS NOT NULL
       AND result_store_id IS NOT NULL
       AND result_domain_id IS NOT NULL
       AND result_membership_id IS NOT NULL
       AND result_principal_id IS NOT NULL
       AND result_subscription_id IS NOT NULL
       AND result_plan_id IS NOT NULL)::text)
    FROM saas.tenant_operations WHERE idempotency_key = '${key}';
    COMMIT;
  `;

  const runWinnerAndLoser = async (winnerSql, loserSql) => {
    const winner = runSqlAsync(engine, names, database, winnerSql);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const loser = runSqlAsync(engine, names, database, loserSql);
    return Promise.all([winner, loser]);
  };

  // same key same fingerprint
  const sameFingerprint = "a".repeat(64);
  const sameResults = await runWinnerAndLoser(
    committedWinnerSql("91000000-0000-4000-8000-000000000001", "race-same-key", sameFingerprint),
    losingClaimSql("91000000-0000-4000-8000-000000000002", "race-same-key", sameFingerprint),
  );
  assert(sameResults.every((result) => result.status === 0), "same-fingerprint winner and loser transactions must complete");
  assert(sameResults[1].stdout.includes("claimed:0"), "same-fingerprint loser must lose the insert claim");
  assert(
    sameResults[1].stdout.includes(`loser separate select|committed|${sameFingerprint}|true`),
    "same-fingerprint loser must read the winner's committed graph references",
  );
  runSql(engine, names, database, "BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.tenant_operations WHERE idempotency_key = 'race-same-key'; COMMIT;");

  // same key different fingerprint
  const winnerFingerprint = "b".repeat(64);
  const loserFingerprint = "c".repeat(64);
  const differentResults = await runWinnerAndLoser(
    committedWinnerSql("92000000-0000-4000-8000-000000000001", "race-different-key", winnerFingerprint),
    losingClaimSql("92000000-0000-4000-8000-000000000002", "race-different-key", loserFingerprint),
  );
  assert(differentResults.every((result) => result.status === 0), "different-fingerprint winner and loser transactions must complete");
  assert(differentResults[1].stdout.includes("claimed:0"), "different-fingerprint loser must lose the insert claim");
  assert(
    differentResults[1].stdout.includes(`loser separate select|committed|${winnerFingerprint}|true`)
      && winnerFingerprint !== loserFingerprint,
    "different-fingerprint loser must classify the committed winner as a mismatch with committed graph references",
  );
  runSql(engine, names, database, "BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.tenant_operations WHERE idempotency_key = 'race-different-key'; COMMIT;");

  // slug race
  const slugResults = await runConcurrentSql(engine, names, database, ["1", "2"].map((suffix) => `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.stores (id, name, slug, status, locale, currency, theme_key, created_at, updated_at)
    VALUES ('93000000-0000-4000-8000-00000000000${suffix}', 'Slug Race ${suffix}', 'same-race-slug', 'active', 'tr', 'TRY', 'starter', '${raceTime}', '${raceTime}');
    SELECT pg_catalog.pg_sleep(0.2);
    COMMIT;
  `));
  assertOneWinner(slugResults, "slug race");
  assertQuery(engine, names, database, "SELECT count(*) FROM saas.stores WHERE slug = 'same-race-slug';", "1", "slug race row count");
  runSql(engine, names, database, "BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.stores WHERE slug = 'same-race-slug'; COMMIT;");

  // hostname race
  runSql(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores (id, name, slug, status, locale, currency, theme_key, created_at, updated_at) VALUES
      ('94000000-0000-4000-8000-000000000001', 'Host Race 1', 'host-race-1', 'active', 'tr', 'TRY', 'starter', '${raceTime}', '${raceTime}'),
      ('94000000-0000-4000-8000-000000000002', 'Host Race 2', 'host-race-2', 'active', 'tr', 'TRY', 'starter', '${raceTime}', '${raceTime}');
    COMMIT;
  `);
  const hostResults = await runConcurrentSql(engine, names, database, ["1", "2"].map((suffix) => `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.domains (id, store_id, normalized_hostname, domain_type, status, canonical, cache_version, created_at, updated_at)
    VALUES ('95000000-0000-4000-8000-00000000000${suffix}', '94000000-0000-4000-8000-00000000000${suffix}', 'same-host-race.example.test', 'custom', 'active', true, 1, '${raceTime}', '${raceTime}');
    SELECT pg_catalog.pg_sleep(0.2);
    COMMIT;
  `));
  assertOneWinner(hostResults, "hostname race");
  assertQuery(engine, names, database, "SELECT count(*) FROM saas.domains WHERE normalized_hostname = 'same-host-race.example.test';", "1", "hostname race row count");
  runSql(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    DELETE FROM saas.domains WHERE normalized_hostname = 'same-host-race.example.test';
    DELETE FROM saas.stores WHERE id IN ('94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002');
    COMMIT;
  `);

  // principal authority race
  const principalResults = await runConcurrentSql(engine, names, database, ["1", "2"].map((suffix) => `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at)
    VALUES ('96000000-0000-4000-8000-00000000000${suffix}', 'https://race-identity.example.test', 'same-subject', 'race-${suffix}@example.test', true, '${raceTime}', '${raceTime}');
    SELECT pg_catalog.pg_sleep(0.2);
    COMMIT;
  `));
  assertOneWinner(principalResults, "principal authority race");
  assertQuery(engine, names, database, "SELECT count(*) FROM saas.principals WHERE issuer = 'https://race-identity.example.test' AND subject = 'same-subject';", "1", "principal authority row count");
  runSql(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    UPDATE saas.principals SET email = 'race-final@example.test', updated_at = now()
    WHERE issuer = 'https://race-identity.example.test' AND subject = 'same-subject';
    COMMIT;
  `);
  assertQuery(engine, names, database, "SELECT email FROM saas.principals WHERE issuer = 'https://race-identity.example.test' AND subject = 'same-subject';", "race-final@example.test", "principal email metadata update");
  runSql(engine, names, database, "BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.principals WHERE issuer = 'https://race-identity.example.test' AND subject = 'same-subject'; COMMIT;");

  // owner membership race
  runSql(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at)
    VALUES ('97000000-0000-4000-8000-000000000001', 'https://membership-race.example.test', 'owner', 'membership-race@example.test', true, '${raceTime}', '${raceTime}');
    INSERT INTO saas.stores (id, name, slug, status, locale, currency, theme_key, created_at, updated_at)
    VALUES ('97000000-0000-4000-8000-000000000002', 'Membership Race', 'membership-race', 'active', 'tr', 'TRY', 'starter', '${raceTime}', '${raceTime}');
    COMMIT;
  `);
  const membershipResults = await runConcurrentSql(engine, names, database, ["3", "4"].map((suffix) => `
    BEGIN; SET LOCAL ROLE celebix_saas_bootstrap;
    INSERT INTO saas.memberships (id, principal_id, store_id, role, status, created_at, updated_at)
    VALUES ('97000000-0000-4000-8000-00000000000${suffix}', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000002', 'store_owner', 'active', '${raceTime}', '${raceTime}');
    SELECT pg_catalog.pg_sleep(0.2);
    COMMIT;
  `));
  assertOneWinner(membershipResults, "owner membership race");
  assertQuery(engine, names, database, "SELECT count(*) FROM saas.memberships WHERE principal_id = '97000000-0000-4000-8000-000000000001' AND store_id = '97000000-0000-4000-8000-000000000002';", "1", "owner membership row count");
  runSql(engine, names, database, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    DELETE FROM saas.memberships WHERE store_id = '97000000-0000-4000-8000-000000000002';
    DELETE FROM saas.stores WHERE id = '97000000-0000-4000-8000-000000000002';
    DELETE FROM saas.principals WHERE id = '97000000-0000-4000-8000-000000000001';
    COMMIT;
  `);

  // free_starter seed race
  const seedSql = `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${readFileSync(path.join(sqlDir, "202607110003_free_starter.seed.sql"), "utf8")}\nRESET SESSION AUTHORIZATION;`;
  const seedResults = await runConcurrentSql(engine, names, database, [seedSql, seedSql]);
  assert(seedResults.every((result) => result.status === 0), "free_starter seed race must verify concurrently without mutation");
  assertQuery(engine, names, database, "SELECT concat((SELECT count(*) FROM saas.plans WHERE plan_code='free_starter' AND version=1), '/', (SELECT count(*) FROM saas.plan_features WHERE plan_id='00000000-0000-4000-8000-000000000001'), '/', (SELECT count(*) FROM saas.plan_limits WHERE plan_id='00000000-0000-4000-8000-000000000001'));", "1/13/5", "free_starter seed race counts");
}

async function waitForPostgres(engine, names) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const executable = engine.kind === "container" ? engine.executable : engine.executables.pg_isready;
    const args = engine.kind === "container"
      ? ["exec", names.container, "pg_isready", "-U", "postgres", "-d", names.primaryDatabase]
      : ["-h", engine.socketDirectory, "-p", String(engine.port), "-U", "postgres", "-d", "postgres"];
    const result = runEngine(executable, args, { allowFailure: true });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 45 seconds.");
}

function schemaDump(engine, names, database) {
  const executable = engine.kind === "container" ? engine.executable : engine.executables.pg_dump;
  const args = engine.kind === "container"
    ? ["exec", names.container, "pg_dump", "-U", "postgres", "-d", database, "--schema-only"]
    : ["-h", engine.socketDirectory, "-p", String(engine.port), "-U", "postgres", "-d", database, "--schema-only"];
  return runEngine(executable, args).stdout;
}

function runBackupRestore(engine, names, evidence) {
  // schema-only dump
  evidence.schemaDumpBefore = sha256(normalizeSchemaDump(schemaDump(engine, names, names.primaryDatabase)));

  // backup
  const backupPath = engine.kind === "container"
    ? `/tmp/phase2a1-${names.container.slice(-16)}.dump`
    : path.join(engine.temporaryDirectory, "phase2a1.dump");
  const dumpExecutable = engine.kind === "container" ? engine.executable : engine.executables.pg_dump;
  const dumpArgs = engine.kind === "container"
    ? ["exec", names.container, "pg_dump", "-U", "postgres", "-d", names.primaryDatabase, "-Fc", "-f", backupPath]
    : ["-h", engine.socketDirectory, "-p", String(engine.port), "-U", "postgres", "-d", names.primaryDatabase, "-Fc", "-f", backupPath];
  runEngine(dumpExecutable, dumpArgs);
  evidence.backupSha256 = engine.kind === "container"
    ? runEngine(engine.executable, ["exec", names.container, "sha256sum", backupPath]).stdout.trim().split(/\s+/)[0]
    : sha256(readFileSync(backupPath));
  assert(/^[a-f0-9]{64}$/.test(evidence.backupSha256), "Backup checksum was not recorded.");

  const restoreExecutable = engine.kind === "container" ? engine.executable : engine.executables.pg_restore;
  const expandedBackup = runEngine(
    restoreExecutable,
    engine.kind === "container"
      ? ["exec", names.container, "pg_restore", "-f", "-", backupPath]
      : ["-f", "-", backupPath],
  ).stdout;
  assert(!/(?:postgres(?:ql)?:\/\/|OWNER_SUPABASE|SERVICE_ROLE|PRIVATE KEY|PASSWORD\s*=)/i.test(expandedBackup), "Backup contains a forbidden connection or secret marker.");

  // restore
  createDatabase(engine, names, names.restoreDatabase);
  runEngine(
    restoreExecutable,
    engine.kind === "container"
      ? ["exec", names.container, "pg_restore", "-U", "postgres", "-d", names.restoreDatabase, "--exit-on-error", backupPath]
      : ["-h", engine.socketDirectory, "-p", String(engine.port), "-U", "postgres", "-d", names.restoreDatabase, "--exit-on-error", backupPath],
  );
  runSqlFileAsMigrator(engine, names, names.restoreDatabase, "202607110003_free_starter.seed.sql");
  runSqlFileAsMigrator(engine, names, names.restoreDatabase, "202607110005_catalog_assertions.sql");
  assertQuery(engine, names, names.restoreDatabase, "SELECT count(*) FROM saas.stores;", "2", "restored store count");
  assertQuery(engine, names, names.restoreDatabase, "SELECT count(*) FROM saas.tenant_operations WHERE status = 'committed' AND result_payload IS NOT NULL;", "2", "restored immutable operation snapshots");
  assertQuery(engine, names, names.restoreDatabase, "SELECT count(*) FROM saas.resolve_store_host('tenant-a.example.test');", "1", "restored exact-host resolver");
  assertQuery(engine, names, names.restoreDatabase, "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;", "10", "restored FORCE RLS");
  // restored RLS and privileges
  runRlsIsolationTests(engine, names, names.restoreDatabase);
  runRolePrivilegeTests(engine, names, names.restoreDatabase);
  if (engine.kind === "container") runEngine(engine.executable, ["exec", names.container, "rm", "-f", backupPath]);
  else rmSync(backupPath, { force: true });
}

function runRollbackAndReapply(engine, names, evidence) {
  // rollback
  createDatabase(engine, names, names.rollbackDatabase);
  runSqlFileAsMigrator(engine, names, names.rollbackDatabase, "202607110002_forward_recovery.sql");
  applyFoundation(engine, names, names.rollbackDatabase);
  runSqlFileAsMigrator(engine, names, names.rollbackDatabase, "202607110002_forward_recovery.sql");
  runSqlFileAsMigrator(engine, names, names.rollbackDatabase, "202607110002_foundation.down.sql");
  assertQuery(engine, names, names.rollbackDatabase, "SELECT (pg_catalog.to_regnamespace('saas') IS NULL)::int;", "1", "rollback removed Phase 2A1 schema");

  // reapply
  createDatabase(engine, names, names.reapplyDatabase);
  applyFoundation(engine, names, names.reapplyDatabase);
  runSqlFileAsMigrator(engine, names, names.reapplyDatabase, "202607110002_forward_recovery.sql");
  const reappliedDump = normalizeSchemaDump(schemaDump(engine, names, names.reapplyDatabase));
  evidence.schemaDumpAfterReapply = sha256(reappliedDump);
  assert(evidence.schemaDumpBefore === evidence.schemaDumpAfterReapply, "normalized schema comparison failed after clean reapply");
}

function dropDisposableDatabasesAndRoles(engine, names) {
  for (const database of [names.restoreDatabase, names.reapplyDatabase, names.primaryDatabase]) {
    runSqlFileAsMigrator(engine, names, database, "202607110002_foundation.down.sql");
  }
  runSqlFile(engine, names, "postgres", "202607110006_roles.down.sql");
  for (const database of [
    names.restoreDatabase,
    names.rollbackDatabase,
    names.reapplyDatabase,
    names.primaryDatabase,
  ]) {
    runSql(engine, names, "postgres", `DROP DATABASE ${databaseIdentifier(database)} WITH (FORCE);`);
  }
}

function cleanupResources(engine, names, temporaryDirectory, state) {
  const cleanup = { containerRemoved: true, networkRemoved: true, nativeClusterStopped: true, temporaryFilesRemoved: true };
  if (engine.kind === "container") {
    if (state.containerCreated) {
      runEngine(engine.executable, ["rm", "-f", names.container], { allowFailure: true });
      cleanup.containerRemoved = runEngine(engine.executable, ["inspect", names.container], { allowFailure: true }).status !== 0;
    }
    if (state.networkCreated) {
      runEngine(engine.executable, ["network", "rm", names.network], { allowFailure: true });
      cleanup.networkRemoved = runEngine(engine.executable, ["network", "inspect", names.network], { allowFailure: true }).status !== 0;
    }
  } else if (state.nativeStarted) {
    const stopped = runEngine(engine.executables.pg_ctl, ["-D", engine.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
    cleanup.nativeClusterStopped = stopped.status === 0;
  }
  if (engine.kind === "native" && engine.socketDirectory) {
    rmSync(engine.socketDirectory, { recursive: true, force: true });
  }
  rmSync(temporaryDirectory, { recursive: true, force: true });
  cleanup.temporaryFilesRemoved = !existsSync(temporaryDirectory)
    && (engine.kind !== "native" || !existsSync(engine.socketDirectory));
  cleanup.pass = cleanup.containerRemoved && cleanup.networkRemoved && cleanup.nativeClusterStopped && cleanup.temporaryFilesRemoved;
  return cleanup;
}

async function main() {
  assertSafeEnvironment();
  validatePinnedImage(DISPOSABLE_IMAGE);
  // manifest checksums
  const manifest = validateManifestChecksums();
  const engine = selectExecutionBackend();
  if (!engine) {
    console.error("DISPOSABLE_DB_EXECUTION_BLOCKED");
    console.error("No Docker, Podman, or complete isolated native PostgreSQL toolchain is available; no database connection was attempted.");
    process.exitCode = 77;
    return;
  }

  const names = createRunNames();
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-phase2a1-"));
  const state = { networkCreated: false, containerCreated: false, nativeStarted: false };
  let engineEndpoint = null;
  if (engine.kind === "container") {
    engineEndpoint = assertLocalEngineEndpoint(resolveContainerEngineEndpoint(engine.engine));
  } else {
    engine.temporaryDirectory = temporaryDirectory;
    engine.dataDirectory = path.join(temporaryDirectory, "data");
    engine.socketDirectory = path.join("/tmp", `celebix-pg-${names.container.slice(-16)}`);
    engine.port = 40000 + (Number.parseInt(names.container.slice(-4), 16) % 20000);
  }
  const commands = engine.kind === "container"
    ? [
        `${engine.engine} pull ${DISPOSABLE_IMAGE}`,
        `${engine.engine} network create ${names.network}`,
        `${engine.engine} run --detach --rm --name ${names.container} --network ${names.network} --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=${names.primaryDatabase} ${DISPOSABLE_IMAGE}`,
        `${engine.engine} exec -i ${names.container} psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d <disposable-db> < <reviewed-sql-artifact>`,
        `${engine.engine} exec ${names.container} pg_dump -U postgres -d ${names.primaryDatabase} --schema-only`,
        `${engine.engine} exec ${names.container} pg_dump -U postgres -d ${names.primaryDatabase} -Fc -f <container-temporary-dump>`,
        `${engine.engine} exec ${names.container} pg_restore -U postgres -d ${names.restoreDatabase} --exit-on-error <container-temporary-dump>`,
      ]
    : [
        "initdb -D <temporary-data-directory> --auth=trust --username=postgres --no-locale",
        "pg_ctl -D <temporary-data-directory> -l <temporary-log> start",
        "psql -h <temporary-unix-socket> -p <random-local-port> -X -qAt -v ON_ERROR_STOP=1 -U postgres -d <disposable-db>",
        "pg_dump -h <temporary-unix-socket> -p <random-local-port> -U postgres -d <disposable-db>",
        "pg_restore -h <temporary-unix-socket> -p <random-local-port> -U postgres -d <disposable-db>",
      ];
  const evidence = {
    status: "RUNNING",
    engine: engine.kind === "container" ? engine.engine : "native-postgresql",
    backend: engine.kind,
    engineEndpoint,
    image: engine.kind === "container" ? DISPOSABLE_IMAGE : null,
    imageDigest: null,
    postgresqlVersion: null,
    productionConnectionUsed: false,
    externalDatabaseUrlAccepted: false,
    productionDistributionCompatibility: manifest.productionDistributionCompatibility,
    migrationIds: manifest.artifacts.map((artifact) => artifact.id),
    migrationChecksums: Object.fromEntries(manifest.artifacts.map((artifact) => [artifact.file, artifact.sha256])),
    commands,
    steps: [],
  };
  let failure = null;
  let cleanupResult = null;
  const cleanupOnce = () => {
    if (!cleanupResult) cleanupResult = cleanupResources(engine, names, temporaryDirectory, state);
    return cleanupResult;
  };
  const onSigint = () => {
    cleanupOnce();
    process.exit(130);
  };
  const onSigterm = () => {
    cleanupOnce();
    process.exit(143);
  };
  const onExit = () => {
    cleanupOnce();
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  process.once("exit", onExit);

  try {
    if (engine.kind === "container") {
      runEngine(engine.executable, ["pull", DISPOSABLE_IMAGE]);
      const digest = runEngine(engine.executable, ["image", "inspect", "--format={{index .RepoDigests 0}}", DISPOSABLE_IMAGE]).stdout.trim();
      assert(/@sha256:[a-f0-9]{64}$/.test(digest), `Resolved image digest is missing or unsafe: ${digest}`);
      evidence.imageDigest = digest;
      evidence.steps.push("image digest: PASS");
      runEngine(engine.executable, ["network", "create", names.network]);
      state.networkCreated = true;
      runEngine(engine.executable, ["run", "--detach", "--rm", "--name", names.container, "--network", names.network, "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", `POSTGRES_DB=${names.primaryDatabase}`, DISPOSABLE_IMAGE]);
      state.containerCreated = true;
    } else {
      mkdirSync(engine.socketDirectory, { mode: 0o700 });
      runEngine(engine.executables.initdb, ["-D", engine.dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
      appendFileSync(
        path.join(engine.dataDirectory, "postgresql.conf"),
        `\nlisten_addresses = ''\nunix_socket_directories = '${engine.socketDirectory.replaceAll("'", "''")}'\nport = ${engine.port}\n`,
      );
      state.nativeStarted = true;
      runEngine(engine.executables.pg_ctl, ["-D", engine.dataDirectory, "-l", path.join(temporaryDirectory, "postgres.log"), "start"]);
    }
    await waitForPostgres(engine, names);

    if (engine.kind === "native") {
      runSql(engine, names, "postgres", `CREATE DATABASE ${databaseIdentifier(names.primaryDatabase)};`);
      evidence.steps.push("isolated native PostgreSQL readiness: PASS");
    } else {
      evidence.steps.push("disposable container readiness: PASS");
    }

    evidence.postgresqlVersion = runSql(engine, names, names.primaryDatabase, "SELECT version();");
    const serverVersionNumber = Number(runSql(engine, names, names.primaryDatabase, "SELECT current_setting('server_version_num');"));
    assert(serverVersionNumber >= 160000 && serverVersionNumber < 170000, `PostgreSQL 16 is required, received server_version_num=${serverVersionNumber}`);
    evidence.steps.push("PostgreSQL 16 major validation: PASS");
    evidence.steps.push("manifest checksums: PASS");

    // forward migration
    applyFoundation(engine, names, names.primaryDatabase, { includeRoles: true });
    evidence.steps.push("forward migration: PASS");

    runSql(engine, names, names.primaryDatabase, tenantFixture("1"));
    runSql(engine, names, names.primaryDatabase, tenantFixture("2"));
    assertQuery(engine, names, names.primaryDatabase, "SELECT count(*) FROM saas.stores;", "2", "synthetic tenant fixture count");

    runConstraintTests(engine, names, names.primaryDatabase);
    evidence.steps.push("constraint tests: PASS");
    runSnapshotIntegrityTests(engine, names, names.primaryDatabase);
    evidence.steps.push("negative snapshot-integrity tests: PASS");
    runRolePrivilegeTests(engine, names, names.primaryDatabase);
    evidence.steps.push("role privilege tests: PASS");
    runRlsIsolationTests(engine, names, names.primaryDatabase);
    evidence.steps.push("RLS isolation tests: PASS");
    evidence.steps.push("pool context reset: PASS");
    runResolverTests(engine, names, names.primaryDatabase);
    evidence.steps.push("exact-host resolver tests: PASS");

    await runConcurrencyTests(engine, names, names.primaryDatabase);
    evidence.steps.push("same key same fingerprint: PASS");
    evidence.steps.push("same key different fingerprint: PASS");
    evidence.steps.push("slug race: PASS");
    evidence.steps.push("hostname race: PASS");
    evidence.steps.push("principal authority race: PASS");
    evidence.steps.push("owner membership race: PASS");
    evidence.steps.push("free_starter seed race: PASS");

    runBackupRestore(engine, names, evidence);
    evidence.steps.push("schema-only dump: PASS");
    evidence.steps.push("backup: PASS");
    evidence.steps.push("restore: PASS");
    evidence.steps.push("restored RLS and privileges: PASS");

    runRollbackAndReapply(engine, names, evidence);
    evidence.steps.push("rollback: PASS");
    evidence.steps.push("reapply: PASS");
    evidence.steps.push("normalized schema comparison: PASS");

    dropDisposableDatabasesAndRoles(engine, names);
    evidence.steps.push("role cleanup: PASS");
    evidence.status = "PASS";
  } catch (error) {
    failure = error;
    evidence.status = "FAIL";
    evidence.failure = error instanceof Error ? error.message : String(error);
    const nativeLog = path.join(temporaryDirectory, "postgres.log");
    if (engine.kind === "native" && existsSync(nativeLog)) {
      evidence.nativePostgresLog = readFileSync(nativeLog, "utf8").trim();
    }
  }

  writeFileSync(path.join(temporaryDirectory, "phase2a1-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  // cleanup proof
  evidence.cleanup = cleanupOnce();
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);
  process.removeListener("exit", onExit);
  evidence.steps.push(`cleanup proof: ${evidence.cleanup.pass ? "PASS" : "FAIL"}`);
  if (!evidence.cleanup.pass && !failure) {
    failure = new Error("Disposable cleanup proof failed.");
    evidence.status = "FAIL";
    evidence.failure = failure.message;
  }

  console.log(JSON.stringify(evidence, null, 2));
  if (failure) throw failure;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === modulePath;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
