import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  PostgresSaaSDataRepository,
  PostgresTenantOperationRecovery,
  SaaSDataLockTimeoutError,
  SaaSDataStatementTimeoutError,
  createCanonicalTenantFingerprint,
} from "../../../packages/saas-data/src/index.ts";
import { createPostgresSaaSDataRepositoryForTesting } from "../../../packages/saas-data/src/testing/index.ts";
import { createStarterTenantService } from "../../../packages/saas-tenant-core/src/index.ts";
import {
  DISPOSABLE_IMAGE,
  REQUIRED_APPLY_ORDER,
  assertLocalEngineEndpoint,
  assertSafeEnvironment,
  selectExecutionBackend,
} from "./disposable-harness.mjs";

const { Pool } = pg;
const modulePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(modulePath), "..", "..", "..");
const sqlDirectory = path.join(repositoryRoot, "apps", "owner", "scripts", "sql", "saas");
const workloadRole = "celebix_phase2a2_repository_test";
const database = "phase2a2_repository";

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`Disposable command failed (${result.status}): ${path.basename(executable)} ${args.join(" ")}\n${result.stderr.trim()}`);
  }
  return result;
}

function sqlText(file) {
  return readFileSync(path.join(sqlDirectory, file), "utf8");
}

function psql(backend, sql, targetDatabase = database, options = {}) {
  const common = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", targetDatabase];
  if (backend.kind === "container") {
    return command(backend.executable, ["exec", "-i", backend.container, "psql", ...common], { input: sql, ...options });
  }
  return command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), ...common], { input: sql, ...options });
}

function applyFoundation(backend) {
  for (const file of REQUIRED_APPLY_ORDER) {
    const sql = sqlText(file);
    const wrapped = file === "202607110001_roles.up.sql"
      ? sql
      : `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${sql}\nRESET SESSION AUTHORIZATION;`;
    psql(backend, wrapped);
  }
}

function startDisposablePostgres() {
  assertSafeEnvironment();
  const selected = selectExecutionBackend();
  if (!selected) throw new Error("No isolated Docker, Podman, or native PostgreSQL 16 backend is available.");
  const token = randomBytes(6).toString("hex");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-phase2a2-"));
  const backend = { ...selected, temporaryDirectory, started: false };

  try {
    if (backend.kind === "container") {
      backend.container = `celebix-phase2a2-${token}`;
      if (backend.engine === "docker") {
        const context = command(backend.executable, ["context", "show"]).stdout.trim();
        const endpoint = command(backend.executable, ["context", "inspect", context, "--format={{.Endpoints.docker.Host}}"]).stdout.trim();
        assertLocalEngineEndpoint(endpoint);
      } else {
        const connections = JSON.parse(command(backend.executable, ["system", "connection", "list", "--format=json"]).stdout);
        const active = connections.find((connection) => connection.Default) ?? (connections.length === 1 ? connections[0] : null);
        assertLocalEngineEndpoint(active?.URI);
      }
      command(backend.executable, ["pull", DISPOSABLE_IMAGE]);
      command(backend.executable, ["run", "--detach", "--rm", "--name", backend.container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", DISPOSABLE_IMAGE]);
      backend.started = true;
      const portOutput = command(backend.executable, ["port", backend.container, "5432/tcp"]).stdout.trim();
      const match = portOutput.match(/127\.0\.0\.1:(\d+)$/);
      if (!match) throw new Error("Disposable container did not publish a loopback-only port.");
      backend.host = "127.0.0.1";
      backend.port = Number(match[1]);
    } else {
      backend.dataDirectory = path.join(temporaryDirectory, "data");
      backend.socketDirectory = path.join("/tmp", `c2a2-${token}`);
      backend.port = 20_000 + Math.floor(Math.random() * 20_000);
      mkdirSync(backend.socketDirectory, { mode: 0o700 });
      command(backend.executables.initdb, ["-D", backend.dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
      appendFileSync(path.join(backend.dataDirectory, "postgresql.conf"), `\nlisten_addresses = ''\nunix_socket_directories = '${backend.socketDirectory}'\nport = ${backend.port}\nmax_connections = 30\n`);
      command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-l", path.join(temporaryDirectory, "postgres.log"), "start"]);
      backend.started = true;
      backend.host = backend.socketDirectory;
    }

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const readiness = backend.kind === "container"
        ? command(backend.executable, ["exec", backend.container, "pg_isready", "-U", "postgres"], { allowFailure: true })
        : command(backend.executables.pg_isready, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres"], { allowFailure: true });
      if (readiness.status === 0) return backend;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    throw new Error("Disposable PostgreSQL did not become ready.");
  } catch (error) {
    stopDisposablePostgres(backend);
    throw error;
  }
}

function stopDisposablePostgres(backend) {
  if (!backend) return;
  if (backend.started && backend.kind === "container") command(backend.executable, ["rm", "--force", backend.container], { allowFailure: true });
  if (backend.started && backend.kind === "native") command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
  if (backend.socketDirectory) rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function input(sequence, overrides = {}) {
  const slug = overrides.slug ?? `phase-two-${sequence}`;
  return {
    schemaVersion: 1,
    idempotencyKey: overrides.idempotencyKey ?? `operation-${sequence}`,
    principal: {
      issuer: overrides.issuer ?? "https://identity.example.test/oidc",
      subject: overrides.subject ?? `subject-${sequence}`,
      email: overrides.email ?? `owner-${sequence}@example.test`,
      emailVerified: true,
    },
    store: { name: `Store ${sequence}`, slug, locale: "tr", currency: "TRY", themeKey: "starter" },
    consents: { privacyAcceptedAt: "2026-07-11T01:00:00.000Z" },
    requestedAt: "2026-07-11T01:00:00.000Z",
  };
}

function requireSuccess(outcome, label) {
  assert.equal(outcome.ok, true, `${label}: ${JSON.stringify(outcome)}`);
  return outcome.value;
}

function requireError(outcome, code, label) {
  assert.equal(outcome.ok, false, `${label}: unexpectedly succeeded`);
  assert.equal(outcome.error.code, code, `${label}: ${JSON.stringify(outcome)}`);
  return outcome.error;
}

function repositoryOptions(pool, auditEvents = []) {
  return {
    pool,
    generateId: () => randomUUID(),
    audit: (event) => auditEvents.push(event.type),
    timeouts: { statementMs: 2_000, lockMs: 500, idleTransactionMs: 3_000 },
    bootstrapRole: "celebix_saas_bootstrap",
  };
}

function service(repository) {
  return createStarterTenantService({ repository, platformDomainSuffix: "example.test", panelBaseUrl: "https://panel.example.test" });
}

async function scalar(pool, text, values = []) {
  const result = await pool.query(text, values);
  return result.rows[0]?.value;
}

async function countGraph(pool, slug, idempotencyKey) {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM saas.stores WHERE slug = $1) AS stores,
       (SELECT count(*)::int FROM saas.domains WHERE normalized_hostname = $1 || '.example.test') AS domains,
       (SELECT count(*)::int FROM saas.tenant_operations WHERE idempotency_key = $2) AS operations`,
    [slug, idempotencyKey],
  );
  return result.rows[0];
}

async function holdStoreLock(adminPool, action) {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE saas.stores IN ACCESS EXCLUSIVE MODE");
    return await action();
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function run() {
  let backend;
  let adminPool;
  let workloadPool;
  const evidence = { status: "FAIL", backend: null, postgresql: null, scenarios: [] };
  const pass = (label) => evidence.scenarios.push(`${label}: PASS`);

  try {
    backend = startDisposablePostgres();
    evidence.backend = backend.kind === "native" ? "isolated-native" : backend.engine;
    const adminConnection = { host: backend.host, port: backend.port, user: "postgres", database: "postgres", max: 4 };
    adminPool = new Pool(adminConnection);
    adminPool.on("error", () => undefined);
    evidence.postgresql = (await adminPool.query("SHOW server_version")).rows[0].server_version;
    assert.match(evidence.postgresql, /^16\./);
    await adminPool.query(`CREATE DATABASE ${database}`);
    await adminPool.end();
    adminPool = new Pool({ ...adminConnection, database });
    adminPool.on("error", () => undefined);
    applyFoundation(backend);
    await adminPool.query(`CREATE ROLE ${workloadRole} LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await adminPool.query(`GRANT celebix_saas_bootstrap TO ${workloadRole}`);
    workloadPool = new Pool({ host: backend.host, port: backend.port, user: workloadRole, database, max: 6 });
    workloadPool.on("error", () => undefined);

    const baseRepository = new PostgresSaaSDataRepository(repositoryOptions(workloadPool));
    const baseService = service(baseRepository);
    const firstInput = input("first");
    const first = requireSuccess(await baseService.execute(firstInput), "first creation");
    assert.equal(first.replayed, false);
    pass("first tenant creation");

    const replay = requireSuccess(await baseService.execute(firstInput), "same-key replay");
    assert.equal(replay.replayed, true);
    assert.deepEqual({ ...replay, replayed: false }, first);
    pass("matching immutable replay");

    const mismatchInput = structuredClone(firstInput);
    mismatchInput.store.name = "Different Payload";
    requireError(await baseService.execute(mismatchInput), "idempotency_mismatch", "fingerprint mismatch");
    pass("same key different fingerprint");

    const sameKeyInput = input("same-key");
    const sameKey = await Promise.all([baseService.execute(sameKeyInput), baseService.execute(sameKeyInput)]);
    assert.equal(sameKey.filter((outcome) => outcome.ok).length, 2);
    assert.deepEqual(sameKey.map((outcome) => outcome.ok && outcome.value.replayed).sort(), [false, true]);
    assert.equal(await scalar(adminPool, "SELECT count(*)::int AS value FROM saas.stores WHERE slug = $1", [sameKeyInput.store.slug]), 1);
    pass("concurrent same-key");

    const slugA = input("slug-a", { slug: "shared-slug" });
    const slugB = input("slug-b", { slug: "shared-slug" });
    const slugRace = await Promise.all([baseService.execute(slugA), baseService.execute(slugB)]);
    assert.equal(slugRace.filter((outcome) => outcome.ok).length, 1);
    assert.equal(slugRace.filter((outcome) => !outcome.ok && outcome.error.code === "slug_taken").length, 1);
    pass("concurrent slug");

    const hostname = "shared-host.example.test";
    const domainRace = async (sequence) => {
      const transaction = await baseRepository.beginTransaction();
      try {
        const timestamp = "2026-07-11T01:00:00.000Z";
        const store = await transaction.stores.create({ id: transaction.generateId("store"), name: `Domain ${sequence}`, slug: `domain-${sequence}`, status: "active", locale: "tr", currency: "TRY", themeKey: "starter", createdAt: timestamp, updatedAt: timestamp });
        await transaction.domains.create({ id: transaction.generateId("domain"), storeId: store.id, hostname, type: "platform_subdomain", status: "active", canonical: true, cacheVersion: 1, createdAt: timestamp, updatedAt: timestamp });
        await transaction.commit();
        return "created";
      } catch (error) {
        await transaction.rollback().catch(() => undefined);
        return error?.kind ?? "error";
      }
    };
    const hostnameRace = await Promise.all([domainRace("one"), domainRace("two")]);
    assert.deepEqual(hostnameRace.sort(), ["created", "domain_hostname"]);
    pass("concurrent hostname");

    const principalA = input("principal-a", { issuer: "https://race.example.test", subject: "same-subject", email: "race@example.test" });
    const principalB = input("principal-b", { issuer: "https://race.example.test", subject: "same-subject", email: "race@example.test" });
    const principalRace = await Promise.all([baseService.execute(principalA), baseService.execute(principalB)]);
    assert.equal(principalRace.filter((outcome) => outcome.ok).length, 1);
    assert.equal(await scalar(adminPool, "SELECT count(*)::int AS value FROM saas.principals WHERE issuer = $1 AND subject = $2", [principalA.principal.issuer, principalA.principal.subject]), 1);
    pass("concurrent principal identity");

    const rollbackPoints = [
      "after_operation_claim", "after_principal_create_or_update", "after_store_create", "after_domain_create",
      "after_membership_create", "after_subscription_create", "after_each_setting_create",
      "before_mark_committed", "after_mark_committed", "before_commit",
    ];
    for (const [index, failAt] of rollbackPoints.entries()) {
      const testInput = input(`rollback-${index}`);
      const testRepository = createPostgresSaaSDataRepositoryForTesting(repositoryOptions(workloadPool), { failAt });
      requireError(await service(testRepository).execute(testInput), "tenant_transaction_failed", `rollback ${failAt}`);
      assert.deepEqual(await countGraph(adminPool, testInput.store.slug, testInput.idempotencyKey), { stores: 0, domains: 0, operations: 0 });
    }
    pass("rollback checkpoint matrix and zero partial graph");

    await adminPool.query(
      `INSERT INTO saas.tenant_operations (id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at)
       VALUES ('b0000000-0000-4000-8000-000000000001', 'processing-proof', $1, 'processing', $2, $2, $2),
              ('b0000000-0000-4000-8000-000000000002', 'failed-proof', $3, 'failed', $2, $2, $2)`,
      [createCanonicalTenantFingerprint(input("processing", { idempotencyKey: "processing-proof" })), "2026-07-11T01:00:00.000Z", createCanonicalTenantFingerprint(input("failed", { idempotencyKey: "failed-proof" }))],
    );
    requireError(await baseService.execute(input("processing", { idempotencyKey: "processing-proof" })), "tenant_transaction_failed", "processing denial");
    requireError(await baseService.execute(input("failed", { idempotencyKey: "failed-proof" })), "tenant_transaction_failed", "failed denial");
    pass("processing and failed denial");

    await adminPool.query("UPDATE saas.stores SET name = 'Mutable Name', updated_at = updated_at + interval '1 second' WHERE id = $1", [first.store.id]);
    const immutableReplay = requireSuccess(await baseService.execute(firstInput), "immutable replay after mutable update");
    assert.deepEqual({ ...immutableReplay, replayed: false }, first);
    pass("mutable rows do not alter replay");

    const roleClient = await workloadPool.connect();
    const roleState = (await roleClient.query("SELECT current_user, current_role")).rows[0];
    roleClient.release();
    assert.deepEqual(roleState, { current_user: workloadRole, current_role: workloadRole });
    pass("role and transaction context cleanup");

    const singlePool = new Pool({ host: backend.host, port: backend.port, user: workloadRole, database, max: 1 });
    singlePool.on("error", () => undefined);
    const singleService = service(new PostgresSaaSDataRepository(repositoryOptions(singlePool)));
    const contentionInput = input("pool-one");
    const contention = await Promise.all([singleService.execute(contentionInput), singleService.execute(contentionInput)]);
    assert.equal(contention.filter((outcome) => outcome.ok).length, 2);
    assert.equal(singlePool.totalCount, 1);
    await singlePool.end();
    pass("pool size one contention");

    const statementOptions = repositoryOptions(workloadPool);
    statementOptions.timeouts = { statementMs: 20, lockMs: 2_000, idleTransactionMs: 3_000 };
    const statementTransaction = await new PostgresSaaSDataRepository(statementOptions).beginTransaction();
    await holdStoreLock(adminPool, async () => {
      await assert.rejects(statementTransaction.stores.findBySlug("timeout-proof"), SaaSDataStatementTimeoutError);
    });
    await statementTransaction.rollback();

    const lockOptions = repositoryOptions(workloadPool);
    lockOptions.timeouts = { statementMs: 2_000, lockMs: 20, idleTransactionMs: 3_000 };
    const lockTransaction = await new PostgresSaaSDataRepository(lockOptions).beginTransaction();
    await holdStoreLock(adminPool, async () => {
      await assert.rejects(lockTransaction.stores.findBySlug("lock-proof"), SaaSDataLockTimeoutError);
    });
    await lockTransaction.rollback();
    pass("statement and lock timeouts");

    for (let index = 0; index < 12; index += 1) {
      requireError(await baseService.execute(input(`repeat-${index}`, { slug: firstInput.store.slug })), "slug_taken", "repeated failure");
    }
    assert.equal(workloadPool.waitingCount, 0);
    assert.equal(workloadPool.totalCount, workloadPool.idleCount);
    pass("repeated failures without pool leak");

    const auditA = [];
    const unknownAInput = input("unknown-a");
    const unknownARepository = createPostgresSaaSDataRepositoryForTesting(repositoryOptions(workloadPool, auditA), { failAt: "commit_forwarded_then_connection_failure" });
    const unknownA = requireError(await service(unknownARepository).execute(unknownAInput), "tenant_transaction_failed", "unknown commit A");
    assert.equal(unknownA.retryable, false);
    assert.deepEqual(auditA, ["tenant_bootstrap_commit_unknown"]);
    const recovery = new PostgresTenantOperationRecovery({ pool: workloadPool, timeouts: { statementMs: 2_000, lockMs: 500, idleTransactionMs: 3_000 }, bootstrapRole: "celebix_saas_bootstrap" });
    const recoveredA = await recovery.recover(unknownAInput.idempotencyKey, createCanonicalTenantFingerprint(unknownAInput));
    assert.equal(recoveredA.kind, "committed_match");
    assert.equal(recoveredA.result.replayed, true);
    assert.equal(await scalar(adminPool, "SELECT count(*)::int AS value FROM saas.stores WHERE slug = $1", [unknownAInput.store.slug]), 1);
    pass("unknown COMMIT forwarded and durable recovery");

    const auditB = [];
    const unknownBInput = input("unknown-b");
    const unknownBRepository = createPostgresSaaSDataRepositoryForTesting(repositoryOptions(workloadPool, auditB), { failAt: "commit_blocked_before_forwarding" });
    const unknownB = requireError(await service(unknownBRepository).execute(unknownBInput), "tenant_transaction_failed", "unknown commit B");
    assert.equal(unknownB.retryable, false);
    assert.deepEqual(auditB, ["tenant_bootstrap_commit_unknown"]);
    const recoveredB = await recovery.recover(unknownBInput.idempotencyKey, createCanonicalTenantFingerprint(unknownBInput));
    assert.equal(recoveredB.kind, "absent");
    assert.deepEqual(await countGraph(adminPool, unknownBInput.store.slug, unknownBInput.idempotencyKey), { stores: 0, domains: 0, operations: 0 });
    pass("unknown COMMIT not forwarded and absent recovery");

    assert.equal((await recovery.recover("processing-proof", createCanonicalTenantFingerprint(input("processing", { idempotencyKey: "processing-proof" })))).kind, "processing");
    assert.equal((await recovery.recover(unknownAInput.idempotencyKey, "f".repeat(64))).kind, "committed_mismatch");
    pass("fresh recovery processing and mismatch classifications");

    await adminPool.query("ALTER TABLE saas.tenant_operations DROP CONSTRAINT tenant_operations_result_payload_shape_check");
    await adminPool.query("ALTER TABLE saas.tenant_operations DISABLE TRIGGER tenant_operations_replay_immutable");
    await adminPool.query("UPDATE saas.tenant_operations SET result_payload = jsonb_set(result_payload, '{store,slug}', '\"INVALID SLUG\"'::jsonb) WHERE id = $1", [first.operationId]);
    await adminPool.query("ALTER TABLE saas.tenant_operations ENABLE TRIGGER tenant_operations_replay_immutable");
    requireError(await baseService.execute(firstInput), "tenant_transaction_failed", "malformed committed replay");
    assert.equal((await recovery.recover(firstInput.idempotencyKey, createCanonicalTenantFingerprint(firstInput))).kind, "corrupt");
    pass("malformed committed payload denial");

    await workloadPool.end();
    workloadPool = undefined;
    await adminPool.query(`REVOKE celebix_saas_bootstrap FROM ${workloadRole}`);
    await adminPool.query(`DROP ROLE ${workloadRole}`);
    await adminPool.query(`SET SESSION AUTHORIZATION celebix_saas_migrator; ${sqlText("202607110002_foundation.down.sql")} RESET SESSION AUTHORIZATION;`);
    await adminPool.query(sqlText("202607110006_roles.down.sql"));
    await adminPool.end();
    adminPool = undefined;
    const cleanupPool = new Pool({ ...adminConnection, database: "postgres" });
    cleanupPool.on("error", () => undefined);
    await cleanupPool.query(`DROP DATABASE ${database}`);
    assert.equal(await scalar(cleanupPool, "SELECT count(*)::int AS value FROM pg_database WHERE datname = $1", [database]), 0);
    assert.equal(await scalar(cleanupPool, "SELECT count(*)::int AS value FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'", []), 0);
    await cleanupPool.end();
    pass("database and role cleanup");

    evidence.status = "PASS";
  } finally {
    if (workloadPool) await workloadPool.end().catch(() => undefined);
    if (adminPool) {
      await adminPool.query(`REVOKE celebix_saas_bootstrap FROM ${workloadRole}`).catch(() => undefined);
      await adminPool.query(`DROP ROLE IF EXISTS ${workloadRole}`).catch(() => undefined);
      await adminPool.query(`SET SESSION AUTHORIZATION celebix_saas_migrator; ${sqlText("202607110002_foundation.down.sql")} RESET SESSION AUTHORIZATION;`).catch(() => undefined);
      await adminPool.query(sqlText("202607110006_roles.down.sql")).catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
    stopDisposablePostgres(backend);
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
