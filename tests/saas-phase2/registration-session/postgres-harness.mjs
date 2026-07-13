import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { createCanonicalTenantFingerprint, PostgresSaaSDataRepository, PostgresTenantOperationRecovery } from "@celebix/saas-data";
import { createStarterTenantService } from "@celebix/saas-tenant-core";

import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "../../../apps/owner/lib/saas-persistence/identity-crypto.ts";
import { RegistrationPersistenceError } from "../../../apps/owner/lib/saas-persistence/postgres-identity-common.ts";
import { PostgresOidcTransactionStore } from "../../../apps/owner/lib/saas-persistence/postgres-oidc-transaction-store.ts";
import { PostgresRegistrationAttemptStore } from "../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts";
import { createOwnerTenantCoreAdapter } from "../../../apps/owner/lib/saas-tenant-core/adapter.ts";
import { createPersistentRegistrationCompletionService } from "../../../apps/owner/lib/self-serve-registration-completion.ts";
import { OidcFlowError } from "../../../apps/owner/lib/self-serve-oidc.ts";
import { registerPostgresTestFailure } from "../../../packages/saas-data/src/postgres/repository.ts";
import {
  DISPOSABLE_IMAGE,
  REQUIRED_APPLY_ORDER,
  assertLocalEngineEndpoint,
  assertSafeEnvironment,
  selectExecutionBackend,
} from "../postgres/disposable-harness.mjs";

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sqlDirectory = path.join(root, "apps", "owner", "scripts", "sql", "saas");
const primaryDatabase = "phase2b1_identity";
const restoreDatabase = "phase2b1_restore";
const rollbackDatabase = "phase2b1_rollback";
const workloadRole = "celebix_phase2b1_test";
const completionResultAuthorities = { panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site" };
const phase2bFiles = [
  "202607110007_identity_roles.up.sql",
  "202607110008_identity_persistence.up.sql",
  "202607110008_identity_persistence.down.sql",
  "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql",
  "202607110011_identity_roles.down.sql",
];
const phase2b1b1Files = [
  "202607120012_verified_identity_snapshot.up.sql",
  "202607120012_verified_identity_snapshot.down.sql",
  "202607120013_verified_identity_grants.sql",
  "202607120014_verified_identity_catalog_assertions.sql",
];

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`disposable command failed: ${path.basename(executable)} (${result.status})\n${result.stderr.trim()}`);
  }
  return result;
}

function sqlText(file) { return readFileSync(path.join(sqlDirectory, file), "utf8"); }

function psql(backend, sql, database = primaryDatabase, options = {}) {
  const common = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database];
  return backend.kind === "container"
    ? command(backend.executable, ["exec", "-i", backend.container, "psql", ...common], { input: sql, ...options })
    : command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), ...common], { input: sql, ...options });
}

function assertIdentityMutationDenied(backend, sql, label) {
  const result = psql(
    backend,
    `BEGIN; SET LOCAL ROLE celebix_saas_identity; ${sql}; COMMIT;`,
    primaryDatabase,
    { allowFailure: true },
  );
  assert.notEqual(result.status, 0, `${label} unexpectedly succeeded`);
}

function migration(backend, file, database = primaryDatabase, asMigrator = true) {
  const sql = sqlText(file);
  psql(backend, asMigrator ? `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${sql}\nRESET SESSION AUTHORIZATION;` : sql, database);
}

function applyPhase2A(backend, database, includeRoles = false, includeAssertions = true) {
  for (const file of REQUIRED_APPLY_ORDER) {
    if (file === "202607110001_roles.up.sql" && !includeRoles) continue;
    if (file === "202607110005_catalog_assertions.sql" && !includeAssertions) continue;
    migration(backend, file, database, file !== "202607110001_roles.up.sql");
  }
}

function applyPhase2B(backend, database, includeRole = false) {
  if (includeRole) migration(backend, phase2bFiles[0], database, false);
  for (const file of [phase2bFiles[1], phase2bFiles[3], phase2bFiles[4]]) migration(backend, file, database);
}

function applyPhase2B1B1(backend, database) {
  for (const file of [phase2b1b1Files[0], phase2b1b1Files[2], phase2b1b1Files[3]]) migration(backend, file, database);
}

function startPostgres() {
  assertSafeEnvironment();
  const selected = selectExecutionBackend();
  if (!selected) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const token = randomBytes(6).toString("hex");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-phase2b1-"));
  const backend = { ...selected, temporaryDirectory, started: false };
  try {
    if (backend.kind === "container") {
      backend.container = `celebix-phase2b1-${token}`;
      if (backend.engine === "docker") {
        const context = command(backend.executable, ["context", "show"]).stdout.trim();
        assertLocalEngineEndpoint(command(backend.executable, ["context", "inspect", context, "--format={{.Endpoints.docker.Host}}"]).stdout.trim());
      } else {
        const connections = JSON.parse(command(backend.executable, ["system", "connection", "list", "--format=json"]).stdout);
        assertLocalEngineEndpoint((connections.find((entry) => entry.Default) ?? connections[0])?.URI);
      }
      command(backend.executable, ["pull", DISPOSABLE_IMAGE]);
      command(backend.executable, ["run", "--detach", "--rm", "--name", backend.container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", DISPOSABLE_IMAGE]);
      backend.started = true;
      const match = command(backend.executable, ["port", backend.container, "5432/tcp"]).stdout.trim().match(/127\.0\.0\.1:(\d+)$/);
      if (!match) throw new Error("loopback-only PostgreSQL publication required");
      backend.host = "127.0.0.1";
      backend.port = Number(match[1]);
    } else {
      backend.dataDirectory = path.join(temporaryDirectory, "data");
      backend.socketDirectory = path.join("/tmp", `c2b1-${token}`);
      backend.port = 20_000 + Math.floor(Math.random() * 20_000);
      mkdirSync(backend.socketDirectory, { mode: 0o700 });
      command(backend.executables.initdb, ["-D", backend.dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
      appendFileSync(path.join(backend.dataDirectory, "postgresql.conf"), `\nlisten_addresses = ''\nunix_socket_directories = '${backend.socketDirectory}'\nport = ${backend.port}\nmax_connections = 40\n`);
      command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-l", path.join(temporaryDirectory, "postgres.log"), "start"]);
      backend.started = true;
      backend.host = backend.socketDirectory;
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = backend.kind === "container"
        ? command(backend.executable, ["exec", backend.container, "pg_isready", "-U", "postgres"], { allowFailure: true })
        : command(backend.executables.pg_isready, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres"], { allowFailure: true });
      if (ready.status === 0) return backend;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    throw new Error("disposable PostgreSQL readiness timeout");
  } catch (error) {
    stopPostgres(backend);
    throw error;
  }
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started && backend.kind === "container") command(backend.executable, ["rm", "--force", backend.container], { allowFailure: true });
  if (backend.started && backend.kind === "native") command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
  if (backend.socketDirectory) rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function makePool(backend, database = primaryDatabase) {
  return new Pool({ host: backend.host, port: backend.port, user: workloadRole, database, max: 8 });
}

function dependencies(pool, material, context, keyring = material.keyring, currentKeyId = material.currentKeyId) {
  return {
    pool,
    stateDigester: createOpaqueStateDigester({ key: material.hmacKey, context }),
    payloadCipher: createAes256GcmPayloadCipher({ currentKeyId, resolveKey: (id) => keyring[id] }),
    timeouts: { poolCheckoutMs: 1_000, statementMs: 3_000, lockMs: 1_000, idleTransactionMs: 4_000 },
    clock: () => new Date("2026-07-12T10:00:00.000Z"),
    audit: (event) => {
      const encoded = JSON.stringify(event);
      assert.doesNotMatch(encoded, /state|nonce|verifier|cipher|keyId|@|postgres/i);
    },
    identityRole: "celebix_saas_identity",
  };
}

function completionService(workflowStore, pool, failAt, controls = {}) {
  const repositoryOptions = {
    pool,
    generateId: () => randomUUID(),
    audit: () => undefined,
    timeouts: { poolCheckoutMs: 1_000, statementMs: 3_000, lockMs: 1_000, idleTransactionMs: 4_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.celebix.site",
  };
  if (failAt) registerPostgresTestFailure(repositoryOptions, failAt);
  const baseTenantCore = createOwnerTenantCoreAdapter(createStarterTenantService({
    repository: new PostgresSaaSDataRepository(repositoryOptions),
    platformDomainSuffix: "celebix.site",
    panelBaseUrl: "https://panel.celebix.site",
  }));
  const tenantCore = controls.wrapTenantCore?.(baseTenantCore) ?? baseTenantCore;
  const recovery = controls.recovery ?? new PostgresTenantOperationRecovery({
    pool,
    timeouts: repositoryOptions.timeouts,
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.celebix.site",
  });
  return createPersistentRegistrationCompletionService({
    workflowStore,
    tenantCore,
    recovery,
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    clock: controls.clock ?? (() => new Date("2026-07-12T10:05:00.000Z")),
    audit: (event) => {
      assert.doesNotMatch(JSON.stringify(event), /@|subject|issuer|cipher|key|sql|postgres/i);
    },
  });
}

const verifiedIdentity = {
  issuer: "https://identity.example.test",
  subject: "verified-subject",
  email: "owner@example.test",
  emailVerified: true,
  displayName: "Verified Owner",
};

function registration(id, state, createdAt = "2026-07-12T10:00:00.000Z", expiresAt = "2026-07-12T10:10:00.000Z", slug = "disposable-store") {
  return {
    id, state,
    details: { storeName: "Disposable Store", storeSlug: slug, locale: "tr", currency: "TRY", themeKey: "starter", privacyAcceptedAt: createdAt },
    idempotencyKey: `ssik_${id.slice(8)}`,
    requestedAt: createdAt,
    status: "awaiting_identity",
    createdAt,
    expiresAt,
  };
}

function oidc(state, createdAt = "2026-07-12T10:00:00.000Z", expiresAt = "2026-07-12T10:10:00.000Z") {
  return {
    state,
    nonce: `nonce-${randomBytes(24).toString("base64url")}`,
    codeVerifier: randomBytes(48).toString("base64url"),
    redirectUri: "https://panel.celebix.site/auth/callback",
    returnTo: "/kayit",
    expectedIssuer: "https://identity.example.test",
    expectedAudience: "customer-panel",
    createdAt,
    expiresAt,
  };
}

function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

function validateManifest() {
  for (const file of ["phase2b1-manifest.json", "phase2b1b1-manifest.json"]) {
    const manifest = JSON.parse(sqlText(file));
    assert.equal(manifest.postgresqlMajor, 16);
    for (const artifact of manifest.artifacts) assert.equal(sha256(readFileSync(path.join(sqlDirectory, artifact.file))), artifact.sha256);
  }
}

function createDatabase(backend, database) {
  psql(backend, `CREATE DATABASE ${database}; GRANT CREATE ON DATABASE ${database} TO celebix_saas_owner;`, "postgres");
}

function dataDump(backend) {
  const args = [
    "-U", "postgres", "-d", primaryDatabase, "--data-only", "--inserts", "--disable-triggers", "--no-owner", "--no-privileges",
    "--table=saas.principals", "--table=saas.stores", "--table=saas.domains", "--table=saas.memberships",
    "--table=saas.subscriptions", "--table=saas.tenant_operations", "--table=saas.registration_workflows",
    "--table=saas.registration_verified_identities", "--table=saas.registration_tenant_completions", "--table=saas.oidc_transactions",
  ];
  return backend.kind === "container"
    ? command(backend.executable, ["exec", backend.container, "pg_dump", ...args]).stdout
    : command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), ...args]).stdout;
}

async function main() {
  const backend = startPostgres();
  const pools = [];
  let rolesCreated = false;
  try {
    validateManifest();
    const version = psql(backend, "SHOW server_version_num;", "postgres").stdout.trim();
    assert.match(version, /^16\d{4}$/);
    psql(backend, `CREATE DATABASE ${primaryDatabase};`, "postgres");
    applyPhase2A(backend, primaryDatabase, true);
    applyPhase2B(backend, primaryDatabase, true);
    applyPhase2B1B1(backend, primaryDatabase);
    rolesCreated = true;
    psql(backend, `CREATE ROLE ${workloadRole} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT celebix_saas_identity, celebix_saas_bootstrap TO ${workloadRole};`, "postgres");

    const attributes = psql(backend, "SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolsuper::int || ':' || rolcreatedb::int || ':' || rolcreaterole::int || ':' || rolreplication::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='celebix_saas_identity';", primaryDatabase).stdout.trim();
    assert.equal(attributes, "0:0:0:0:0:0:0");
    const unrelated = psql(backend, "SET ROLE celebix_saas_identity; SELECT count(*) FROM saas.stores;", primaryDatabase, { allowFailure: true });
    assert.notEqual(unrelated.status, 0);
    assert.equal(psql(backend, "SELECT has_table_privilege('celebix_saas_identity', 'saas.registration_verified_identities', 'SELECT,INSERT')::int || ':' || has_table_privilege('celebix_saas_identity', 'saas.registration_verified_identities', 'UPDATE,DELETE')::int || ':' || has_table_privilege('public', 'saas.registration_verified_identities', 'SELECT,INSERT,UPDATE,DELETE')::int;").stdout.trim(), "1:0:0");
    assert.equal(psql(backend, "SELECT has_table_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'SELECT,INSERT')::int || ':' || has_table_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'UPDATE,DELETE')::int || ':' || has_column_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'state', 'UPDATE')::int || ':' || has_column_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'canonical_fingerprint', 'UPDATE')::int;").stdout.trim(), "1:0:1:0");
    assert.equal(psql(backend, "SELECT has_column_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'tenant_operation_id', 'UPDATE')::int || ':' || has_column_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'completed_at', 'UPDATE')::int || ':' || has_function_privilege('celebix_saas_identity', 'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)', 'EXECUTE')::int || ':' || has_function_privilege('public', 'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)', 'EXECUTE')::int;").stdout.trim(), "0:0:1:0");
    assert.equal(psql(backend, "SELECT owner.rolname || ':' || procedure.prosecdef::int || ':' || array_to_string(procedure.proconfig, ',') FROM pg_proc AS procedure JOIN pg_roles AS owner ON owner.oid=procedure.proowner WHERE procedure.oid='saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'::regprocedure;").stdout.trim(), "celebix_saas_owner:1:search_path=pg_catalog, saas");

    const material = { hmacKey: randomBytes(32), currentKeyId: "key-current", keyring: { "key-current": randomBytes(32), "key-old": randomBytes(32) } };
    const poolA = makePool(backend);
    const poolB = makePool(backend);
    pools.push(poolA, poolB);
    const registrationsA = new PostgresRegistrationAttemptStore(dependencies(poolA, material, "registration-attempt-state"), completionResultAuthorities);
    const registrationsB = new PostgresRegistrationAttemptStore(dependencies(poolB, material, "registration-attempt-state"), completionResultAuthorities);
    const oidcA = new PostgresOidcTransactionStore(dependencies(poolA, material, "oidc-transaction-state"));
    const oidcB = new PostgresOidcTransactionStore(dependencies(poolB, material, "oidc-transaction-state"));
    const prepareVerified = async (store, attempt) => {
      await store.save(attempt);
      await store.consume(attempt.state, new Date("2026-07-12T10:01:00.000Z"));
      const recorded = await store.recordVerifiedIdentity({
        attemptId: attempt.id,
        expectedVersion: 1,
        identity: verifiedIdentity,
        now: new Date("2026-07-12T10:02:00.000Z"),
      });
      assert.equal(recorded.kind, "recorded");
      return recorded.authority;
    };

    const first = registration("attempt_1234567890abcdef", "registration-state-one");
    await registrationsA.save(first);
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET expires_at = expires_at + interval '1 hour' WHERE attempt_id='${first.id}'`, "identity registration expiry extension");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET requested_at = requested_at + interval '1 second' WHERE attempt_id='${first.id}'`, "identity requested_at rewrite");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET updated_at = updated_at - interval '1 second' WHERE attempt_id='${first.id}'`, "identity registration updated_at rollback");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET tenant_idempotency_digest = '${"f".repeat(64)}' WHERE attempt_id='${first.id}'`, "tenant idempotency authority rewrite");
    assert.equal(psql(backend, `SELECT tenant_idempotency_digest = encode(sha256(convert_to('${first.idempotencyKey}', 'UTF8')), 'hex') FROM saas.registration_workflows WHERE attempt_id='${first.id}';`).stdout.trim(), "t");
    await assert.rejects(registrationsB.save(first), (error) => error instanceof RegistrationPersistenceError && error.code === "registration_attempt_conflict");
    const consumed = await registrationsB.consume(first.state, new Date("2026-07-12T10:01:00.000Z"));
    assert.equal(consumed.id, first.id);
    await assert.rejects(registrationsA.consume(first.state, new Date("2026-07-12T10:01:01.000Z")), (error) => error.code === "registration_attempt_replayed");

    const race = registration("attempt_2234567890abcdef", "registration-state-race");
    await registrationsA.save(race);
    const raceResults = await Promise.allSettled([
      registrationsA.consume(race.state, new Date("2026-07-12T10:01:00.000Z")),
      registrationsB.consume(race.state, new Date("2026-07-12T10:01:00.000Z")),
    ]);
    assert.equal(raceResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(raceResults.filter((result) => result.status === "rejected" && result.reason.code === "registration_attempt_replayed").length, 1);

    const expired = registration("attempt_3234567890abcdef", "registration-state-expired", "2026-07-12T09:00:00.000Z", "2026-07-12T09:10:00.000Z");
    await registrationsA.save(expired);
    await assert.rejects(registrationsB.consume(expired.state, new Date("2026-07-12T10:00:00.000Z")), (error) => error.code === "registration_attempt_expired");
    await assert.rejects(registrationsA.consume(expired.state, new Date("2026-07-12T10:00:01.000Z")), (error) => error.code === "registration_attempt_expired");

    const workflow = registration("attempt_4234567890abcdef", "registration-state-workflow");
    await registrationsA.save(workflow);
    await registrationsA.consume(workflow.state, new Date("2026-07-12T10:01:00.000Z"));
    const identityRecord = await registrationsA.recordVerifiedIdentity({ attemptId: workflow.id, expectedVersion: 1, identity: verifiedIdentity, now: new Date("2026-07-12T10:02:00.000Z") });
    assert.equal(identityRecord.kind, "recorded");
    const identity = identityRecord.authority;
    assert.equal(identity.version, 2);
    assert.equal(identity.tenantInput.principal.subject, verifiedIdentity.subject);
    assert.equal(identity.canonicalFingerprint, createCanonicalTenantFingerprint(identity.tenantInput));
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET status='tenant_created', version=version+1, updated_at=updated_at+interval '1 second' WHERE attempt_id='${workflow.id}'`, "tenant_created without completed proof");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_tenant_completions SET state='completed', version=version+1, started_at=updated_at, completed_at=updated_at, updated_at=updated_at+interval '1 second' WHERE attempt_id='${workflow.id}'`, "completed without creating proof");
    const optimistic = await Promise.all([
      registrationsA.claimTenantCompletion({ attemptId: workflow.id, now: new Date("2026-07-12T10:03:00.000Z") }),
      registrationsB.claimTenantCompletion({ attemptId: workflow.id, now: new Date("2026-07-12T10:03:00.000Z") }),
    ]);
    assert.deepEqual(optimistic.map((result) => result.kind).sort(), ["claimed", "in_progress"]);
    const claimedOutcome = optimistic.find((result) => result.kind === "claimed");
    const claimed = claimedOutcome.authority;
    await assert.rejects(registrationsA.finalizeTenantCompletion({
      attemptId: workflow.id, expectedState: "creating",
      expectedCompletionVersion: claimed.completion.version, expectedWorkflowVersion: claimed.version,
      now: new Date("2026-07-12T10:03:01.000Z"), result: {},
    }), /registration_completion_corrupt/);
    await registrationsA.releaseTenantCompletion({
      attemptId: workflow.id, expectedState: "creating",
      expectedCompletionVersion: claimed.completion.version, expectedWorkflowVersion: claimed.version,
      now: new Date("2026-07-12T10:03:02.000Z"),
    });
    await claimedOutcome.lease.release();
    assert.equal((await completionService(registrationsA, poolA).resumeTenantCreation(workflow.id)).kind, "tenant_created");
    const tenant = await registrationsB.loadVerified(workflow.id);
    const session = await registrationsB.markSessionCreated({ attemptId: workflow.id, expectedStatus: "tenant_created", expectedVersion: tenant.version, now: new Date("2026-07-12T10:05:01.000Z") });
    assert.equal(session.status, "session_created");
    await assert.rejects(registrationsA.markFailed({ attemptId: workflow.id, expectedStatus: "session_created", expectedVersion: session.version, failureCode: "late", now: new Date("2026-07-12T10:05:02.000Z") }), (error) => error.code === "registration_workflow_invalid_transition");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET terminal_at = terminal_at + interval '1 second', updated_at = updated_at + interval '1 second' WHERE attempt_id='${workflow.id}'`, "registration terminal timestamp rewrite");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_verified_identities SET recorded_at = recorded_at + interval '1 second' WHERE attempt_id='${workflow.id}'`, "verified identity mutation");
    assertIdentityMutationDenied(backend, `DELETE FROM saas.registration_verified_identities WHERE attempt_id='${workflow.id}'`, "verified identity direct delete");
    assertIdentityMutationDenied(backend, `INSERT INTO saas.registration_verified_identities SELECT * FROM saas.registration_verified_identities WHERE attempt_id='${workflow.id}'`, "verified identity duplicate");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_tenant_completions SET canonical_fingerprint='${"f".repeat(64)}' WHERE attempt_id='${workflow.id}'`, "completion fingerprint mutation");
    assertIdentityMutationDenied(backend, `DELETE FROM saas.registration_tenant_completions WHERE attempt_id='${workflow.id}'`, "completion direct delete");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_tenant_completions SET state='ready', version=version+1, started_at=NULL, completed_at=NULL, updated_at=updated_at+interval '1 second' WHERE attempt_id='${workflow.id}'`, "completed completion reopening");

    const noSnapshot = registration("attempt_b1b1nosnapshot01", "registration-state-no-snapshot");
    await registrationsA.save(noSnapshot);
    await registrationsA.consume(noSnapshot.state, new Date("2026-07-12T10:01:00.000Z"));
    assertIdentityMutationDenied(
      backend,
      `UPDATE saas.registration_workflows SET status='identity_verified', version=version+1, canonical_fingerprint='${"a".repeat(64)}', updated_at=updated_at+interval '1 second' WHERE attempt_id='${noSnapshot.id}'`,
      "identity_verified without snapshot",
    );

    const mismatchedPair = registration("attempt_b1b1mismatch0010", "registration-state-mismatch-pair");
    await registrationsA.save(mismatchedPair);
    await registrationsA.consume(mismatchedPair.state, new Date("2026-07-12T10:01:00.000Z"));
    const mismatchedResult = psql(backend, `BEGIN;
      SET LOCAL ROLE celebix_saas_identity;
      INSERT INTO saas.registration_verified_identities
        (attempt_id, canonical_fingerprint, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, recorded_at)
      SELECT '${mismatchedPair.id}', canonical_fingerprint, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, '2026-07-12T10:02:00.000Z'::timestamptz
      FROM saas.registration_verified_identities WHERE attempt_id='${workflow.id}';
      UPDATE saas.registration_workflows SET status='identity_verified', version=version+1,
        canonical_fingerprint='${"b".repeat(64)}', updated_at='2026-07-12T10:02:00.000Z'::timestamptz
      WHERE attempt_id='${mismatchedPair.id}';
      COMMIT;`, primaryDatabase, { allowFailure: true });
    assert.notEqual(mismatchedResult.status, 0);
    assert.equal(psql(backend, `SELECT status || ':' || version || ':' || (canonical_fingerprint IS NULL)::int FROM saas.registration_workflows WHERE attempt_id='${mismatchedPair.id}';`).stdout.trim(), "awaiting_identity:1:1");
    assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_verified_identities WHERE attempt_id='${mismatchedPair.id}';`).stdout.trim(), "0");

    const versionRace = registration("attempt_b1b1versionrace1", "registration-state-version-race");
    await registrationsA.save(versionRace);
    await registrationsA.consume(versionRace.state, new Date("2026-07-12T10:01:00.000Z"));
    await assert.rejects(
      registrationsA.recordVerifiedIdentity({ attemptId: versionRace.id, expectedVersion: 2, identity: verifiedIdentity, now: new Date("2026-07-12T10:02:00.000Z") }),
      (error) => error.code === "registration_workflow_conflict",
    );

    const concurrentIdentity = registration("attempt_b1b1concurrent01", "registration-state-concurrent-identity");
    await registrationsA.save(concurrentIdentity);
    await registrationsA.consume(concurrentIdentity.state, new Date("2026-07-12T10:01:00.000Z"));
    const concurrentRecords = await Promise.all([
      registrationsA.recordVerifiedIdentity({ attemptId: concurrentIdentity.id, expectedVersion: 1, identity: verifiedIdentity, now: new Date("2026-07-12T10:02:00.000Z") }),
      registrationsB.recordVerifiedIdentity({ attemptId: concurrentIdentity.id, expectedVersion: 1, identity: verifiedIdentity, now: new Date("2026-07-12T10:02:00.000Z") }),
    ]);
    assert.deepEqual(concurrentRecords.map((result) => result.kind).sort(), ["already_recorded", "recorded"]);
    await assert.rejects(
      registrationsA.recordVerifiedIdentity({ attemptId: concurrentIdentity.id, expectedVersion: 2, identity: { ...verifiedIdentity, subject: "different-subject" }, now: new Date("2026-07-12T10:02:01.000Z") }),
      (error) => error.code === "registration_verified_identity_conflict",
    );
    const restartedAuthority = await new PostgresRegistrationAttemptStore(dependencies(poolB, material, "registration-attempt-state")).loadVerified(concurrentIdentity.id);
    assert.equal(restartedAuthority.tenantInput.principal.subject, verifiedIdentity.subject);
    assert.equal(restartedAuthority.canonicalFingerprint, createCanonicalTenantFingerprint(restartedAuthority.tenantInput));

    const oldKeyIdentity = registration("attempt_b1b1oldkeyident1", "registration-state-old-key-identity", undefined, undefined, "b1b1-old-key");
    const oldKeyRegistrationStore = new PostgresRegistrationAttemptStore(dependencies(
      poolA,
      material,
      "registration-attempt-state",
      material.keyring,
      "key-old",
    ));
    await prepareVerified(oldKeyRegistrationStore, oldKeyIdentity);
    assert.equal(psql(backend, `SELECT encryption_key_id FROM saas.registration_verified_identities WHERE attempt_id='${oldKeyIdentity.id}';`).stdout.trim(), "key-old");
    assert.equal((await registrationsB.loadVerified(oldKeyIdentity.id)).tenantInput.store.slug, "b1b1-old-key");
    assert.equal(psql(backend, `SELECT encryption_key_id FROM saas.registration_verified_identities WHERE attempt_id='${oldKeyIdentity.id}';`).stdout.trim(), "key-old");

    const failedWorkflow = registration("attempt_5234567890abcdef", "registration-state-failed");
    await registrationsA.save(failedWorkflow);
    await registrationsA.markFailed({ attemptId: failedWorkflow.id, expectedStatus: "awaiting_identity", expectedVersion: 1, failureCode: "safe_failure", now: new Date("2026-07-12T10:02:00.000Z") });
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET failure_code = 'rewritten_failure', updated_at = updated_at + interval '1 second' WHERE attempt_id='${failedWorkflow.id}'`, "registration failure code rewrite");

    const oidcOne = oidc("oidc-state-one-secure");
    await oidcA.save(oidcOne);
    const oidcOneDigest = createOpaqueStateDigester({ key: material.hmacKey, context: "oidc-transaction-state" }).digest(oidcOne.state);
    assertIdentityMutationDenied(backend, `UPDATE saas.oidc_transactions SET expires_at = expires_at + interval '1 hour' WHERE state_digest='${oidcOneDigest}'`, "identity OIDC expiry extension");
    assertIdentityMutationDenied(backend, `UPDATE saas.oidc_transactions SET updated_at = updated_at - interval '1 second' WHERE state_digest='${oidcOneDigest}'`, "identity OIDC updated_at rollback");
    assert.equal((await oidcB.consume(oidcOne.state, new Date("2026-07-12T10:01:00.000Z"))).nonce, oidcOne.nonce);
    await assert.rejects(oidcA.consume(oidcOne.state, new Date("2026-07-12T10:01:01.000Z")), (error) => error instanceof OidcFlowError && error.code === "oidc_state_replayed");

    const oidcRace = oidc("oidc-state-race-secure");
    await oidcA.save(oidcRace);
    const oidcRaceResults = await Promise.allSettled([
      oidcA.consume(oidcRace.state, new Date("2026-07-12T10:01:00.000Z")),
      oidcB.consume(oidcRace.state, new Date("2026-07-12T10:01:00.000Z")),
    ]);
    assert.equal(oidcRaceResults.filter((result) => result.status === "fulfilled").length, 1);

    const oidcExpired = oidc("oidc-state-expired", "2026-07-12T09:00:00.000Z", "2026-07-12T09:10:00.000Z");
    await oidcA.save(oidcExpired);
    await assert.rejects(oidcB.consume(oidcExpired.state, new Date("2026-07-12T10:00:00.000Z")), (error) => error.code === "oidc_state_expired");
    await assert.rejects(oidcA.consume(oidcExpired.state, new Date("2026-07-12T10:00:01.000Z")), (error) => error.code === "oidc_state_expired");

    const discarded = oidc("oidc-state-discarded");
    await oidcA.save(discarded);
    await oidcB.discard(discarded.state);
    await oidcA.discard(discarded.state);
    await assert.rejects(oidcB.consume(discarded.state, new Date("2026-07-12T10:01:00.000Z")), (error) => error.code === "oidc_invalid_state");

    const oldWriter = new PostgresOidcTransactionStore(dependencies(poolA, material, "oidc-transaction-state", material.keyring, "key-old"));
    const rotated = oidc("oidc-state-old-key");
    await oldWriter.save(rotated);
    assert.equal((await oidcB.consume(rotated.state, new Date("2026-07-12T10:01:00.000Z"))).state, rotated.state);

    const wrongKeyTransaction = oidc("oidc-state-wrong-key");
    await oidcA.save(wrongKeyTransaction);
    const wrongKeyStore = new PostgresOidcTransactionStore(dependencies(poolB, { ...material, keyring: { "key-current": randomBytes(32) } }, "oidc-transaction-state"));
    await assert.rejects(wrongKeyStore.consume(wrongKeyTransaction.state, new Date("2026-07-12T10:01:00.000Z")), /identity_crypto_failed/);

    const hmacAuthority = oidc("oidc-state-hmac-authority");
    await oidcA.save(hmacAuthority);
    const wrongHmacStore = new PostgresOidcTransactionStore(dependencies(poolB, { ...material, hmacKey: randomBytes(32) }, "oidc-transaction-state"));
    await assert.rejects(wrongHmacStore.consume(hmacAuthority.state, new Date("2026-07-12T10:01:00.000Z")), (error) => error.code === "oidc_invalid_state");
    assert.equal((await oidcB.consume(hmacAuthority.state, new Date("2026-07-12T10:01:00.000Z"))).state, hmacAuthority.state);

    const aadSource = oidc("oidc-state-aad-source");
    const aadTargetState = "oidc-state-aad-target";
    await oidcA.save(aadSource);
    const oidcDigester = createOpaqueStateDigester({ key: material.hmacKey, context: "oidc-transaction-state" });
    const aadSourceDigest = oidcDigester.digest(aadSource.state);
    const aadTargetDigest = oidcDigester.digest(aadTargetState);
    psql(backend, `INSERT INTO saas.oidc_transactions (state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, created_at, updated_at, expires_at) SELECT '${aadTargetDigest}', payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, created_at, updated_at, expires_at FROM saas.oidc_transactions WHERE state_digest='${aadSourceDigest}';`);
    await assert.rejects(oidcB.consume(aadTargetState, new Date("2026-07-12T10:01:00.000Z")), /identity_crypto_failed/);

    const unknownKey = oidc("oidc-state-unknown-key");
    await oidcA.save(unknownKey);
    const unknownKeyDigest = oidcDigester.digest(unknownKey.state);
    psql(backend, `ALTER TABLE saas.oidc_transactions DISABLE TRIGGER oidc_transactions_guard; UPDATE saas.oidc_transactions SET encryption_key_id='unknown-key' WHERE state_digest='${unknownKeyDigest}'; ALTER TABLE saas.oidc_transactions ENABLE TRIGGER oidc_transactions_guard;`);
    await assert.rejects(oidcB.consume(unknownKey.state, new Date("2026-07-12T10:01:00.000Z")), /identity_crypto_failed/);

    await assert.rejects(oidcA.save({ ...oidc("oidc-invalid-return"), returnTo: "https://evil.example.test" }), (error) => error.code === "oidc_invalid_state");
    await assert.rejects(oidcA.save({ ...oidc("oidc-invalid-callback"), redirectUri: "https://evil.example.test/callback" }), (error) => error.code === "oidc_invalid_callback");

    const registrationMismatch = registration("attempt_6234567890abcdef", "registration-state-db-mismatch");
    await registrationsA.save(registrationMismatch);
    psql(backend, `ALTER TABLE saas.registration_workflows DISABLE TRIGGER registration_workflows_guard; UPDATE saas.registration_workflows SET expires_at = expires_at + interval '1 hour' WHERE attempt_id='${registrationMismatch.id}'; ALTER TABLE saas.registration_workflows ENABLE TRIGGER registration_workflows_guard;`);
    await assert.rejects(registrationsB.load(registrationMismatch.id), (error) => error.message === "identity_persistence_failed");

    const oidcMismatch = oidc("oidc-state-db-mismatch");
    await oidcA.save(oidcMismatch);
    const oidcMismatchDigest = oidcDigester.digest(oidcMismatch.state);
    psql(backend, `ALTER TABLE saas.oidc_transactions DISABLE TRIGGER oidc_transactions_guard; UPDATE saas.oidc_transactions SET expires_at = expires_at + interval '1 hour' WHERE state_digest='${oidcMismatchDigest}'; ALTER TABLE saas.oidc_transactions ENABLE TRIGGER oidc_transactions_guard;`);
    await assert.rejects(oidcB.consume(oidcMismatch.state, new Date("2026-07-12T10:20:00.000Z")), (error) => error.message === "identity_persistence_failed");

    const firstCreation = registration("attempt_b1b1firstcreate0", "registration-state-first-create", undefined, undefined, "b1b1-first-store");
    await prepareVerified(registrationsA, firstCreation);
    let releaseCreation;
    const creationGate = new Promise((resolve) => { releaseCreation = resolve; });
    let tenantCoreCalls = 0;
    const firstCompletion = completionService(registrationsA, poolA, undefined, {
      wrapTenantCore: (base) => ({
        createStarterTenant: async (input) => {
          tenantCoreCalls += 1;
          await creationGate;
          return base.createStarterTenant(input);
        },
      }),
    });
    const firstWinner = firstCompletion.resumeTenantCreation(firstCreation.id);
    while (tenantCoreCalls === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const expiryDuringCreation = await registrationsB.expireDue(new Date("2026-07-12T11:00:00.000Z"), 100);
    assert.ok(expiryDuringCreation >= 0);
    assert.equal((await registrationsB.loadVerified(firstCreation.id)).status, "identity_verified");
    assert.equal((await registrationsB.loadVerified(firstCreation.id)).completion.state, "creating");
    assert.deepEqual(await completionService(registrationsB, poolB).reconcileUnknownCommit(firstCreation.id), { kind: "pending" });
    assert.equal((await registrationsB.loadVerified(firstCreation.id)).completion.state, "creating");
    assert.deepEqual(await firstCompletion.resumeTenantCreation(firstCreation.id), { kind: "in_progress" });
    assert.equal(tenantCoreCalls, 1);
    releaseCreation();
    const firstCreationResult = await firstWinner;
    assert.equal(firstCreationResult.kind, "tenant_created");
    assert.equal((await registrationsB.loadVerified(firstCreation.id)).status, "tenant_created");
    assert.equal((await registrationsB.loadVerified(firstCreation.id)).completion.state, "completed");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-first-store';").stdout.trim(), "1");
    const firstCompletedAuthority = await registrationsB.loadVerified(firstCreation.id);
    assert.equal(firstCompletedAuthority.completion.tenantOperationId, firstCreationResult.result.operationId);
    assert.equal(psql(backend, `SELECT tenant_operation_id::text FROM saas.registration_tenant_completions WHERE attempt_id='${firstCreation.id}';`).stdout.trim(), firstCreationResult.result.operationId);
    assert.equal(await registrationsB.isTenantCompletionActive(firstCreation.id), false);

    let completedRecoveryCoreCalls = 0;
    const postLossRegistrationStore = new PostgresRegistrationAttemptStore(
      dependencies(poolB, material, "registration-attempt-state"),
      completionResultAuthorities,
    );
    const completedRecoveryService = completionService(postLossRegistrationStore, poolB, undefined, {
      wrapTenantCore: (base) => ({
        createStarterTenant: async (input) => {
          completedRecoveryCoreCalls += 1;
          return base.createStarterTenant(input);
        },
      }),
    });
    const completedVersion = firstCompletedAuthority.completion.version;
    const completedResume = await completedRecoveryService.resumeTenantCreation(firstCreation.id);
    assert.equal(completedResume.kind, "tenant_already_created");
    assert.equal(completedResume.result.operationId, firstCreationResult.result.operationId);
    const completedReconcile = await completedRecoveryService.reconcileUnknownCommit(firstCreation.id);
    assert.equal(completedReconcile.kind, "tenant_recovered");
    assert.equal(completedReconcile.result.operationId, firstCreationResult.result.operationId);
    assert.equal(completedRecoveryCoreCalls, 0);
    assert.equal((await registrationsA.loadVerified(firstCreation.id)).completion.version, completedVersion);
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-first-store';").stdout.trim(), "1");

    for (const recoveryResult of [
      { kind: "committed_mismatch" },
      { kind: "corrupt" },
      { kind: "absent" },
      { kind: "processing" },
      { kind: "failed" },
      { kind: "committed_match", result: { ...structuredClone(firstCreationResult.result), operationId: randomUUID(), replayed: true } },
    ]) {
      let forbiddenCoreCalls = 0;
      const denied = await completionService(postLossRegistrationStore, poolB, undefined, {
        recovery: { recover: async () => recoveryResult },
        wrapTenantCore: (base) => ({
          createStarterTenant: async (input) => {
            forbiddenCoreCalls += 1;
            return base.createStarterTenant(input);
          },
        }),
      }).resumeTenantCreation(firstCreation.id);
      assert.deepEqual(denied, { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } });
      assert.equal(forbiddenCoreCalls, 0);
    }
    assert.deepEqual(await completionService(postLossRegistrationStore, poolB, undefined, {
      recovery: { recover: async () => { throw new Error("private pool failure"); } },
    }).resumeTenantCreation(firstCreation.id), {
      kind: "rejected", error: { code: "tenant_transaction_failed", retryable: true },
    });

    const fabricateResult = (authority, operationId = randomUUID()) => {
      const storeId = randomUUID();
      const hostname = `${authority.tenantInput.store.slug}.celebix.site`;
      return {
        ...structuredClone(firstCreationResult.result),
        operationId,
        replayed: false,
        store: { id: storeId, slug: authority.tenantInput.store.slug, status: "active" },
        primaryDomain: {
          ...structuredClone(firstCreationResult.result.primaryDomain),
          domainId: randomUUID(), storeId, storeSlug: authority.tenantInput.store.slug,
          hostname, canonicalHostname: hostname,
        },
        membership: {
          ...structuredClone(firstCreationResult.result.membership),
          id: randomUUID(), principalId: randomUUID(), storeId,
          createdAt: authority.tenantInput.requestedAt,
          updatedAt: authority.tenantInput.requestedAt,
        },
        plan: {
          ...structuredClone(firstCreationResult.result.plan),
          planId: randomUUID(), validFrom: authority.tenantInput.requestedAt,
        },
        panelUrl: `https://panel.celebix.site/stores/${authority.tenantInput.store.slug}`,
        storefrontUrl: `https://${hostname}`,
      };
    };

    const missingOperation = registration("attempt_b1b1missingop001", "registration-state-missing-operation", undefined, undefined, "b1b1-missing-op");
    await prepareVerified(registrationsA, missingOperation);
    const missingClaim = await registrationsA.claimTenantCompletion({ attemptId: missingOperation.id, now: new Date("2026-07-12T10:03:00.000Z") });
    assert.equal(missingClaim.kind, "claimed");
    missingClaim.lease.release();
    const missingResult = fabricateResult(missingClaim.authority);
    await assert.rejects(registrationsA.finalizeTenantCompletion({
      attemptId: missingOperation.id, expectedState: "creating",
      expectedCompletionVersion: missingClaim.authority.completion.version,
      expectedWorkflowVersion: missingClaim.authority.version,
      now: new Date("2026-07-12T10:05:00.000Z"), result: missingResult,
    }), /registration_completion_corrupt/);
    assert.equal((await registrationsB.loadVerified(missingOperation.id)).status, "identity_verified");
    assert.equal((await registrationsB.loadVerified(missingOperation.id)).completion.state, "creating");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-missing-op';").stdout.trim(), "0");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_tenant_completions SET tenant_operation_id='${missingResult.operationId}', state='completed', version=version+1, completed_at='2026-07-12T10:05:00.000Z', updated_at='2026-07-12T10:05:00.000Z' WHERE attempt_id='${missingOperation.id}'; UPDATE saas.registration_workflows SET status='tenant_created', version=version+1, updated_at='2026-07-12T10:05:00.000Z' WHERE attempt_id='${missingOperation.id}'`, "direct paired completion/workflow bypass");

    for (const [operationStatus, suffix] of [["processing", "process"], ["failed", "failed"]]) {
      const candidate = registration(`attempt_b1b1${suffix}op0001`, `registration-state-${suffix}-operation`, undefined, undefined, `b1b1-${suffix}-op`);
      await prepareVerified(registrationsA, candidate);
      const candidateClaim = await registrationsA.claimTenantCompletion({ attemptId: candidate.id, now: new Date("2026-07-12T10:03:00.000Z") });
      assert.equal(candidateClaim.kind, "claimed");
      candidateClaim.lease.release();
      const operationId = randomUUID();
      const candidateResult = fabricateResult(candidateClaim.authority, operationId);
      psql(backend, `INSERT INTO saas.tenant_operations (id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at) VALUES ('${operationId}', 'negative_${operationId}', '${candidateClaim.authority.canonicalFingerprint}', '${operationStatus}', '${candidateClaim.authority.tenantInput.requestedAt}', '${candidateClaim.authority.tenantInput.requestedAt}', '${candidateClaim.authority.tenantInput.requestedAt}');`);
      await assert.rejects(registrationsA.finalizeTenantCompletion({
        attemptId: candidate.id, expectedState: "creating",
        expectedCompletionVersion: candidateClaim.authority.completion.version,
        expectedWorkflowVersion: candidateClaim.authority.version,
        now: new Date("2026-07-12T10:05:00.000Z"), result: candidateResult,
      }), /registration_completion_corrupt/);
      assert.equal((await registrationsB.loadVerified(candidate.id)).completion.state, "creating");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.stores WHERE slug='b1b1-${suffix}-op';`).stdout.trim(), "0");
    }

    const anotherAttempt = registration("attempt_b1b1anotherop001", "registration-state-another-operation", undefined, undefined, "b1b1-another-op");
    await prepareVerified(registrationsA, anotherAttempt);
    const anotherClaim = await registrationsA.claimTenantCompletion({ attemptId: anotherAttempt.id, now: new Date("2026-07-12T10:03:00.000Z") });
    assert.equal(anotherClaim.kind, "claimed");
    anotherClaim.lease.release();
    await assert.rejects(registrationsA.finalizeTenantCompletion({
      attemptId: anotherAttempt.id, expectedState: "creating",
      expectedCompletionVersion: anotherClaim.authority.completion.version,
      expectedWorkflowVersion: anotherClaim.authority.version,
      now: new Date("2026-07-12T10:05:00.000Z"),
      result: fabricateResult(anotherClaim.authority, firstCreationResult.result.operationId),
    }), /registration_completion_corrupt/);
    assert.equal((await registrationsB.loadVerified(anotherAttempt.id)).completion.state, "creating");

    const reusedOperation = registration("attempt_b1b1reuseop00001", "registration-state-reused-operation", undefined, undefined, "b1b1-first-store");
    const reusedAuthority = await prepareVerified(registrationsA, reusedOperation);
    assert.equal(reusedAuthority.canonicalFingerprint, firstCompletedAuthority.canonicalFingerprint);
    const reusedClaim = await registrationsA.claimTenantCompletion({ attemptId: reusedOperation.id, now: new Date("2026-07-12T10:03:00.000Z") });
    assert.equal(reusedClaim.kind, "claimed");
    reusedClaim.lease.release();
    await assert.rejects(registrationsA.finalizeTenantCompletion({
      attemptId: reusedOperation.id, expectedState: "creating",
      expectedCompletionVersion: reusedClaim.authority.completion.version,
      expectedWorkflowVersion: reusedClaim.authority.version,
      now: new Date("2026-07-12T10:05:00.000Z"), result: firstCreationResult.result,
    }), /registration_completion_corrupt/);
    assert.equal((await registrationsB.loadVerified(reusedOperation.id)).completion.state, "creating");

    const finalizationLossStore = {
      recordVerifiedIdentity: registrationsA.recordVerifiedIdentity.bind(registrationsA),
      loadVerified: registrationsA.loadVerified.bind(registrationsA),
      claimTenantCompletion: registrationsA.claimTenantCompletion.bind(registrationsA),
      isTenantCompletionActive: registrationsA.isTenantCompletionActive.bind(registrationsA),
      markTenantCompletionCommitUnknown: registrationsA.markTenantCompletionCommitUnknown.bind(registrationsA),
      releaseTenantCompletion: registrationsA.releaseTenantCompletion.bind(registrationsA),
      finalizeTenantCompletion: async () => { throw new Error("simulated response loss before finalization"); },
      recoverAbsentTenantCompletion: registrationsA.recoverAbsentTenantCompletion.bind(registrationsA),
    };
    const recoveryReader = new PostgresTenantOperationRecovery({
      pool: poolB,
      timeouts: { poolCheckoutMs: 1_000, statementMs: 3_000, lockMs: 1_000, idleTransactionMs: 4_000 },
      bootstrapRole: "celebix_saas_bootstrap",
      panelOrigin: "https://panel.celebix.site",
    });

    const crossAttemptSource = registration(
      "attempt_b1b1crosssource1",
      "registration-state-cross-source",
      undefined,
      undefined,
      "b1b1-cross-attempt",
    );
    crossAttemptSource.idempotencyKey = "ssik_cross_attempt_source_123456";
    const crossAttemptTarget = registration(
      "attempt_b1b1crosstarget1",
      "registration-state-cross-target",
      undefined,
      undefined,
      "b1b1-cross-attempt",
    );
    crossAttemptTarget.idempotencyKey = "ssik_cross_attempt_target_123456";
    const crossSourceAuthority = await prepareVerified(registrationsA, crossAttemptSource);
    const crossTargetAuthority = await prepareVerified(registrationsB, crossAttemptTarget);
    assert.equal(crossSourceAuthority.canonicalFingerprint, crossTargetAuthority.canonicalFingerprint);
    assert.deepEqual(
      await completionService(finalizationLossStore, poolA).resumeTenantCreation(crossAttemptSource.id),
      { kind: "reconciliation_required" },
    );
    const crossSourceRecovery = await recoveryReader.recover(
      crossAttemptSource.idempotencyKey,
      crossSourceAuthority.canonicalFingerprint,
    );
    assert.equal(crossSourceRecovery.kind, "committed_match");
    const crossTargetClaim = await registrationsB.claimTenantCompletion({
      attemptId: crossAttemptTarget.id,
      now: new Date("2026-07-12T10:03:00.000Z"),
    });
    assert.equal(crossTargetClaim.kind, "claimed");
    crossTargetClaim.lease.release();
    await assert.rejects(registrationsB.finalizeTenantCompletion({
      attemptId: crossAttemptTarget.id,
      expectedState: "creating",
      expectedCompletionVersion: crossTargetClaim.authority.completion.version,
      expectedWorkflowVersion: crossTargetClaim.authority.version,
      now: new Date("2026-07-12T10:06:00.000Z"),
      result: crossSourceRecovery.result,
    }), /registration_completion_corrupt/);
    assert.equal((await registrationsA.loadVerified(crossAttemptTarget.id)).completion.state, "creating");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-cross-attempt';").stdout.trim(), "1");

    const fingerprintMismatch = registration("attempt_b1b1fingerprint01", "registration-state-fingerprint-mismatch", undefined, undefined, "b1b1-fingerprint");
    const fingerprintAuthority = await prepareVerified(registrationsA, fingerprintMismatch);
    assert.deepEqual(await completionService(finalizationLossStore, poolA).resumeTenantCreation(fingerprintMismatch.id), { kind: "reconciliation_required" });
    const fingerprintRecovery = await recoveryReader.recover(fingerprintMismatch.idempotencyKey, fingerprintAuthority.canonicalFingerprint);
    assert.equal(fingerprintRecovery.kind, "committed_match");
    psql(backend, `ALTER TABLE saas.tenant_operations DISABLE TRIGGER tenant_operations_replay_immutable; UPDATE saas.tenant_operations SET payload_fingerprint='${"f".repeat(64)}' WHERE id='${fingerprintRecovery.result.operationId}'; ALTER TABLE saas.tenant_operations ENABLE TRIGGER tenant_operations_replay_immutable;`);
    const fingerprintCreating = await registrationsB.loadVerified(fingerprintMismatch.id);
    await assert.rejects(registrationsA.finalizeTenantCompletion({
      attemptId: fingerprintMismatch.id, expectedState: "creating",
      expectedCompletionVersion: fingerprintCreating.completion.version,
      expectedWorkflowVersion: fingerprintCreating.version,
      now: new Date("2026-07-12T10:06:00.000Z"), result: fingerprintRecovery.result,
    }), /registration_completion_corrupt/);
    psql(backend, `ALTER TABLE saas.tenant_operations DISABLE TRIGGER tenant_operations_replay_immutable; UPDATE saas.tenant_operations SET payload_fingerprint='${fingerprintAuthority.canonicalFingerprint}' WHERE id='${fingerprintRecovery.result.operationId}'; ALTER TABLE saas.tenant_operations ENABLE TRIGGER tenant_operations_replay_immutable;`);
    assert.equal((await registrationsB.loadVerified(fingerprintMismatch.id)).completion.state, "creating");

    const graphMismatch = registration("attempt_b1b1graphmismatch1", "registration-state-graph-mismatch", undefined, undefined, "b1b1-graph-mismatch");
    const graphAuthority = await prepareVerified(registrationsA, graphMismatch);
    assert.deepEqual(await completionService(finalizationLossStore, poolA).resumeTenantCreation(graphMismatch.id), { kind: "reconciliation_required" });
    const graphRecovery = await recoveryReader.recover(graphMismatch.idempotencyKey, graphAuthority.canonicalFingerprint);
    assert.equal(graphRecovery.kind, "committed_match");
    psql(backend, `UPDATE saas.stores SET status='suspended' WHERE id='${graphRecovery.result.store.id}';`);
    const graphCreating = await registrationsB.loadVerified(graphMismatch.id);
    await assert.rejects(registrationsA.finalizeTenantCompletion({
      attemptId: graphMismatch.id, expectedState: "creating",
      expectedCompletionVersion: graphCreating.completion.version,
      expectedWorkflowVersion: graphCreating.version,
      now: new Date("2026-07-12T10:06:00.000Z"), result: graphRecovery.result,
    }), /registration_completion_corrupt/);
    psql(backend, `UPDATE saas.stores SET status='active' WHERE id='${graphRecovery.result.store.id}';`);
    assert.equal((await registrationsB.loadVerified(graphMismatch.id)).completion.state, "creating");

    const persistedResponse = registration(
      "attempt_b1b1persistedres",
      "registration-state-persisted-response",
      undefined,
      undefined,
      "b1b1-persisted-response",
    );
    const persistedResponseAuthority = await prepareVerified(registrationsA, persistedResponse);
    const precommitOptions = {
      pool: poolA,
      generateId: () => randomUUID(),
      audit: () => undefined,
      timeouts: { poolCheckoutMs: 1_000, statementMs: 3_000, lockMs: 1_000, idleTransactionMs: 4_000 },
      bootstrapRole: "celebix_saas_bootstrap",
      panelOrigin: "https://panel.celebix.site",
    };
    const precommitCore = createOwnerTenantCoreAdapter(createStarterTenantService({
      repository: new PostgresSaaSDataRepository(precommitOptions),
      platformDomainSuffix: "celebix.site",
      panelBaseUrl: "https://panel.celebix.site",
    }));
    const persistedOperation = await precommitCore.createStarterTenant(persistedResponseAuthority.tenantInput);
    assert.equal(persistedOperation.ok, true);
    const fabricatedPersistedResponse = fabricateResult(
      persistedResponseAuthority,
      persistedOperation.value.operationId,
    );
    const authoritativeResponse = await completionService(registrationsA, poolA, undefined, {
      wrapTenantCore: () => ({
        createStarterTenant: async () => ({ ok: true, value: fabricatedPersistedResponse }),
      }),
    }).resumeTenantCreation(persistedResponse.id);
    assert.equal(authoritativeResponse.kind, "tenant_created");
    assert.deepEqual(authoritativeResponse.result, persistedOperation.value);
    assert.notEqual(authoritativeResponse.result.store.id, fabricatedPersistedResponse.store.id);
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-persisted-response';").stdout.trim(), "1");

    const lostLease = registration("attempt_b1b1lostlease000", "registration-state-lost-lease", undefined, undefined, "b1b1-lost-lease");
    await prepareVerified(registrationsA, lostLease);
    let releaseLostLeaseCreation;
    const lostLeaseGate = new Promise((resolve) => { releaseLostLeaseCreation = resolve; });
    let lostLeaseCoreCalls = 0;
    const lostLeaseCompletion = completionService(registrationsA, poolA, undefined, {
      wrapTenantCore: (base) => ({
        createStarterTenant: async (input) => {
          lostLeaseCoreCalls += 1;
          await lostLeaseGate;
          return base.createStarterTenant(input);
        },
      }),
    });
    const lostLeaseWinner = lostLeaseCompletion.resumeTenantCreation(lostLease.id);
    while (lostLeaseCoreCalls === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(psql(backend, "SELECT count(*) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND granted AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database());").stdout.trim(), "1");
    assert.equal(psql(backend, "SELECT count(*) FROM (SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND granted AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())) AS terminated;").stdout.trim(), "1");
    assert.equal(await registrationsB.isTenantCompletionActive(lostLease.id), false);
    assert.deepEqual(await completionService(registrationsB, poolB).reconcileUnknownCommit(lostLease.id), { kind: "recovery_absent", state: "ready" });
    assert.equal(lostLeaseCoreCalls, 1);
    const recoveredAbsentAuthority = await registrationsB.loadVerified(lostLease.id);
    assert.equal(recoveredAbsentAuthority.completion.state, "ready");
    assert.equal(recoveredAbsentAuthority.completion.recoveryAbsentAt, "2026-07-12T10:05:00.000Z");
    await registrationsB.expireDue(new Date("2026-07-12T11:00:00.000Z"), 100);
    assert.equal((await registrationsB.loadVerified(lostLease.id)).status, "identity_verified");
    await assert.rejects(registrationsB.markExpired({
      attemptId: lostLease.id,
      expectedStatus: "identity_verified",
      expectedVersion: recoveredAbsentAuthority.version,
      now: new Date("2026-07-12T11:00:01.000Z"),
    }));
    releaseLostLeaseCreation();
    assert.deepEqual(await lostLeaseWinner, { kind: "reconciliation_required" });
    const lostLeaseRecovery = completionService(registrationsB, poolB, undefined, {
      clock: () => new Date("2026-07-12T11:00:02.000Z"),
      wrapTenantCore: (base) => ({
        createStarterTenant: async (input) => {
          lostLeaseCoreCalls += 1;
          return base.createStarterTenant(input);
        },
      }),
    });
    assert.deepEqual(await lostLeaseRecovery.resumeTenantCreation(lostLease.id), { kind: "reconciliation_required" });
    assert.equal(lostLeaseCoreCalls, 1);
    const lostLeaseReconciled = await lostLeaseRecovery.reconcileUnknownCommit(lostLease.id);
    assert.equal(lostLeaseReconciled.kind, "tenant_recovered");
    assert.equal(lostLeaseCoreCalls, 1);
    assert.equal((await registrationsA.loadVerified(lostLease.id)).completion.state, "completed");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-lost-lease';").stdout.trim(), "1");

    const finalizationGap = registration(
      "attempt_b1b1finalizegap0",
      "registration-state-finalization-gap",
      undefined,
      undefined,
      "b1b1-finalization-gap",
    );
    await prepareVerified(registrationsA, finalizationGap);
    let enterFinalizationGap;
    let releaseFinalizationGap;
    const finalizationGapEntered = new Promise((resolve) => { enterFinalizationGap = resolve; });
    const finalizationGapGate = new Promise((resolve) => { releaseFinalizationGap = resolve; });
    const finalizationGapStore = {
      recordVerifiedIdentity: registrationsA.recordVerifiedIdentity.bind(registrationsA),
      loadVerified: registrationsA.loadVerified.bind(registrationsA),
      claimTenantCompletion: registrationsA.claimTenantCompletion.bind(registrationsA),
      isTenantCompletionActive: registrationsA.isTenantCompletionActive.bind(registrationsA),
      markTenantCompletionCommitUnknown: registrationsA.markTenantCompletionCommitUnknown.bind(registrationsA),
      releaseTenantCompletion: registrationsA.releaseTenantCompletion.bind(registrationsA),
      finalizeTenantCompletion: async (input) => {
        enterFinalizationGap();
        await finalizationGapGate;
        return registrationsA.finalizeTenantCompletion(input);
      },
      recoverAbsentTenantCompletion: registrationsA.recoverAbsentTenantCompletion.bind(registrationsA),
    };
    let finalizationGapCoreCalls = 0;
    const finalizationGapWinner = completionService(finalizationGapStore, poolA, undefined, {
      wrapTenantCore: (base) => ({
        createStarterTenant: async (input) => {
          finalizationGapCoreCalls += 1;
          return base.createStarterTenant(input);
        },
      }),
    }).resumeTenantCreation(finalizationGap.id);
    await finalizationGapEntered;
    assert.equal(await registrationsB.isTenantCompletionActive(finalizationGap.id), false);
    const finalizationGapRecovery = await completionService(registrationsB, poolB).reconcileUnknownCommit(finalizationGap.id);
    assert.equal(finalizationGapRecovery.kind, "tenant_recovered");
    releaseFinalizationGap();
    const finalizationGapResult = await finalizationGapWinner;
    assert.equal(finalizationGapResult.kind, "tenant_created");
    assert.equal(finalizationGapResult.result.operationId, finalizationGapRecovery.result.operationId);
    assert.equal(finalizationGapCoreCalls, 1);
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-finalization-gap';").stdout.trim(), "1");

    const forgedProof = registration("attempt_b1b1forgedproof0", "registration-state-forged-proof", undefined, undefined, "b1b1-forged-proof");
    await prepareVerified(registrationsA, forgedProof);
    const forgedClaim = await registrationsA.claimTenantCompletion({ attemptId: forgedProof.id, now: new Date("2026-07-12T10:05:00.000Z") });
    assert.equal(forgedClaim.kind, "claimed");
    const forgedResult = structuredClone(firstCreationResult.result);
    forgedResult.store.slug = "b1b1-forged-proof";
    forgedResult.primaryDomain.storeSlug = "b1b1-forged-proof";
    forgedResult.primaryDomain.hostname = "evil.test";
    forgedResult.primaryDomain.canonicalHostname = "evil.test";
    forgedResult.panelUrl = "https://evil.test/stores/b1b1-forged-proof";
    forgedResult.storefrontUrl = "https://evil.test/";
    await assert.rejects(registrationsA.finalizeTenantCompletion({
      attemptId: forgedProof.id, expectedState: "creating",
      expectedCompletionVersion: forgedClaim.authority.completion.version,
      expectedWorkflowVersion: forgedClaim.authority.version,
      now: new Date("2026-07-12T10:05:01.000Z"), result: forgedResult,
    }), /registration_completion_corrupt/);
    await forgedClaim.lease.release();
    assert.equal((await registrationsB.loadVerified(forgedProof.id)).status, "identity_verified");

    const malformedSuccess = registration("attempt_b1b1malformresult", "registration-state-malformed-result", undefined, undefined, "b1b1-malformed-result");
    await prepareVerified(registrationsA, malformedSuccess);
    const malformedCompletion = completionService(registrationsA, poolA, undefined, {
      wrapTenantCore: () => ({
        createStarterTenant: async () => ({
          ok: true,
          value: { ...structuredClone(firstCreationResult.result), store: { ...firstCreationResult.result.store, slug: "wrong-store" } },
        }),
      }),
    });
    assert.deepEqual(await malformedCompletion.resumeTenantCreation(malformedSuccess.id), {
      kind: "rejected", error: { code: "durable_authority_invalid", retryable: false },
    });
    assert.equal((await registrationsB.loadVerified(malformedSuccess.id)).completion.state, "creating");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-malformed-result';").stdout.trim(), "0");

    const replayCrash = registration("attempt_b1b1crashreplay0", "registration-state-crash-replay", undefined, undefined, "b1b1-replay-store");
    await prepareVerified(registrationsA, replayCrash);
    const crashWindowStore = {
      recordVerifiedIdentity: registrationsA.recordVerifiedIdentity.bind(registrationsA),
      loadVerified: registrationsA.loadVerified.bind(registrationsA),
      claimTenantCompletion: registrationsA.claimTenantCompletion.bind(registrationsA),
      isTenantCompletionActive: registrationsA.isTenantCompletionActive.bind(registrationsA),
      markTenantCompletionCommitUnknown: registrationsA.markTenantCompletionCommitUnknown.bind(registrationsA),
      releaseTenantCompletion: registrationsA.releaseTenantCompletion.bind(registrationsA),
      finalizeTenantCompletion: async () => { throw new Error("simulated process loss after tenant commit"); },
      recoverAbsentTenantCompletion: registrationsA.recoverAbsentTenantCompletion.bind(registrationsA),
    };
    const crashedCompletion = completionService(crashWindowStore, poolA);
    const crashedResult = await crashedCompletion.resumeTenantCreation(replayCrash.id);
    assert.deepEqual(crashedResult, { kind: "reconciliation_required" });
    assert.equal((await registrationsB.loadVerified(replayCrash.id)).status, "identity_verified");
    assert.deepEqual(await completionService(registrationsB, poolB).resumeTenantCreation(replayCrash.id), { kind: "in_progress" });
    const replayedResult = await completionService(registrationsB, poolB, undefined, {
      clock: () => new Date("2026-07-12T10:06:01.000Z"),
    }).reconcileUnknownCommit(replayCrash.id);
    assert.equal(replayedResult.kind, "tenant_recovered");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-replay-store';").stdout.trim(), "1");
    assert.equal(psql(backend, `SELECT count(*) FROM saas.tenant_operations WHERE idempotency_key='${replayCrash.idempotencyKey}';`).stdout.trim(), "1");

    const unknownCommitted = registration("attempt_b1b1unknownmatch", "registration-state-unknown-match", undefined, undefined, "b1b1-unknown-match");
    await prepareVerified(registrationsA, unknownCommitted);
    const uncertainCommitted = completionService(registrationsA, poolA, "commit_forwarded_then_connection_failure");
    assert.deepEqual(await uncertainCommitted.resumeTenantCreation(unknownCommitted.id), { kind: "commit_unknown" });
    assert.equal((await registrationsB.loadVerified(unknownCommitted.id)).status, "identity_verified");
    assert.equal((await registrationsB.loadVerified(unknownCommitted.id)).completion.state, "commit_unknown");
    const recoveredCommitted = await completionService(registrationsB, poolB).reconcileUnknownCommit(unknownCommitted.id);
    assert.equal(recoveredCommitted.kind, "tenant_recovered");
    assert.equal((await registrationsA.loadVerified(unknownCommitted.id)).status, "tenant_created");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-unknown-match';").stdout.trim(), "1");

    const recoveryFinalize = registration("attempt_b1b1recoveryfinal", "registration-state-recovery-finalize", undefined, undefined, "b1b1-recovery-finalize");
    await prepareVerified(registrationsA, recoveryFinalize);
    assert.deepEqual(await completionService(registrationsA, poolA, "commit_forwarded_then_connection_failure").resumeTenantCreation(recoveryFinalize.id), { kind: "commit_unknown" });
    const recoveryFinalizeStore = {
      recordVerifiedIdentity: registrationsA.recordVerifiedIdentity.bind(registrationsA),
      loadVerified: registrationsA.loadVerified.bind(registrationsA),
      claimTenantCompletion: registrationsA.claimTenantCompletion.bind(registrationsA),
      isTenantCompletionActive: registrationsA.isTenantCompletionActive.bind(registrationsA),
      markTenantCompletionCommitUnknown: registrationsA.markTenantCompletionCommitUnknown.bind(registrationsA),
      releaseTenantCompletion: registrationsA.releaseTenantCompletion.bind(registrationsA),
      finalizeTenantCompletion: async () => { throw new Error("simulated recovery finalization loss"); },
      recoverAbsentTenantCompletion: registrationsA.recoverAbsentTenantCompletion.bind(registrationsA),
    };
    assert.deepEqual(await completionService(recoveryFinalizeStore, poolA).reconcileUnknownCommit(recoveryFinalize.id), { kind: "reconciliation_required" });
    assert.equal((await registrationsB.loadVerified(recoveryFinalize.id)).completion.state, "commit_unknown");
    assert.equal((await completionService(registrationsB, poolB).reconcileUnknownCommit(recoveryFinalize.id)).kind, "tenant_recovered");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-recovery-finalize';").stdout.trim(), "1");

    const unknownAbsent = registration("attempt_b1b1unknownabsent", "registration-state-unknown-absent", undefined, undefined, "b1b1-unknown-absent");
    await prepareVerified(registrationsA, unknownAbsent);
    const uncertainAbsent = completionService(registrationsA, poolA, "commit_blocked_before_forwarding");
    assert.deepEqual(await uncertainAbsent.resumeTenantCreation(unknownAbsent.id), { kind: "commit_unknown" });
    assert.equal((await registrationsB.loadVerified(unknownAbsent.id)).status, "identity_verified");
    assert.deepEqual(await completionService(registrationsB, poolB).reconcileUnknownCommit(unknownAbsent.id), { kind: "recovery_absent", state: "ready" });
    assert.equal((await registrationsA.loadVerified(unknownAbsent.id)).status, "identity_verified");
    assert.equal((await registrationsA.loadVerified(unknownAbsent.id)).completion.state, "ready");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.stores WHERE slug='b1b1-unknown-absent';").stdout.trim(), "0");
    assert.equal(psql(backend, `SELECT count(*) FROM saas.tenant_operations WHERE idempotency_key='${unknownAbsent.idempotencyKey}';`).stdout.trim(), "0");
    assert.equal(psql(backend, "SELECT count(*) FROM saas.domains WHERE normalized_hostname='b1b1-unknown-absent.celebix.site';").stdout.trim(), "0");

    const expiryReady = registration("attempt_b1b1expiryready0", "registration-state-expiry-ready", undefined, undefined, "b1b1-expiry-ready");
    const expiryCreating = registration("attempt_b1b1expirycreate", "registration-state-expiry-creating", undefined, undefined, "b1b1-expiry-creating");
    const expiryUnknown = registration("attempt_b1b1expiryunknown", "registration-state-expiry-unknown", undefined, undefined, "b1b1-expiry-unknown");
    await prepareVerified(registrationsA, expiryReady);
    await prepareVerified(registrationsA, expiryCreating);
    await prepareVerified(registrationsA, expiryUnknown);
    const creatingClaim = await registrationsA.claimTenantCompletion({ attemptId: expiryCreating.id, now: new Date("2026-07-12T10:03:00.000Z") });
    const unknownClaim = await registrationsA.claimTenantCompletion({ attemptId: expiryUnknown.id, now: new Date("2026-07-12T10:03:00.000Z") });
    assert.equal(creatingClaim.kind, "claimed");
    assert.equal(unknownClaim.kind, "claimed");
    const creatingAuthority = creatingClaim.authority;
    const unknownCreating = unknownClaim.authority;
    await registrationsA.markTenantCompletionCommitUnknown({
      attemptId: expiryUnknown.id,
      expectedState: "creating",
      expectedCompletionVersion: unknownCreating.completion.version,
      expectedWorkflowVersion: unknownCreating.version,
      now: new Date("2026-07-12T10:04:00.000Z"),
    });
    await unknownClaim.lease.release();
    await registrationsA.expireDue(new Date("2026-07-12T11:00:00.000Z"), 100);
    assert.equal((await registrationsA.loadVerified(expiryReady.id)).status, "expired");
    assert.equal((await registrationsA.loadVerified(expiryCreating.id)).status, "identity_verified");
    assert.equal((await registrationsA.loadVerified(expiryCreating.id)).completion.state, "creating");
    assert.equal((await registrationsA.loadVerified(expiryUnknown.id)).status, "identity_verified");
    assert.equal((await registrationsA.loadVerified(expiryUnknown.id)).completion.state, "commit_unknown");
    await assert.rejects(registrationsA.markExpired({
      attemptId: expiryCreating.id,
      expectedStatus: "identity_verified",
      expectedVersion: creatingAuthority.version,
      now: new Date("2026-07-12T11:00:01.000Z"),
    }));
    await creatingClaim.lease.release();

    const explicitRegistrationExpiry = registration("attempt_7234567890abcdef", "registration-state-explicit-expiry", "2026-07-12T09:00:00.000Z", "2026-07-12T09:10:00.000Z");
    await registrationsA.save(explicitRegistrationExpiry);
    const explicitlyExpired = await registrationsA.markExpired({
      attemptId: explicitRegistrationExpiry.id,
      expectedStatus: "awaiting_identity",
      expectedVersion: 1,
      now: new Date("2026-07-12T10:00:00.000Z"),
    });
    assert.equal(explicitlyExpired.status, "expired");
    assert.equal(explicitlyExpired.consumedAt, undefined);
    await assert.rejects(registrationsB.consume(explicitRegistrationExpiry.state, new Date("2026-07-12T10:00:01.000Z")), (error) => error.code === "registration_attempt_expired");

    for (const [index, store] of [registrationsA, registrationsB, registrationsA].entries()) {
      await store.save(registration(`attempt_8${index}34567890abcdef`, `registration-due-worker-${index}`, "2026-07-12T09:00:00.000Z", "2026-07-12T09:10:00.000Z"));
    }
    const activeRegistration = registration("attempt_9034567890abcdef", "registration-active-not-due");
    await registrationsA.save(activeRegistration);
    const registrationExpiryRace = await Promise.all([
      registrationsA.expireDue(new Date("2026-07-12T10:00:00.000Z"), 2),
      registrationsB.expireDue(new Date("2026-07-12T10:00:00.000Z"), 2),
    ]);
    assert.equal(registrationExpiryRace.reduce((sum, count) => sum + count, 0), 3);
    assert.equal((await registrationsA.load(activeRegistration.id)).status, "awaiting_identity");

    for (const index of [0, 1, 2]) {
      await oidcA.save(oidc(`oidc-due-worker-${index}`, "2026-07-12T09:00:00.000Z", "2026-07-12T09:10:00.000Z"));
    }
    const activeOidc = oidc("oidc-active-not-due");
    await oidcA.save(activeOidc);
    const oidcExpiryRace = await Promise.all([
      oidcA.expireDue(new Date("2026-07-12T10:00:00.000Z"), 2),
      oidcB.expireDue(new Date("2026-07-12T10:00:00.000Z"), 2),
    ]);
    assert.equal(oidcExpiryRace.reduce((sum, count) => sum + count, 0), 3);
    assert.equal((await oidcB.consume(activeOidc.state, new Date("2026-07-12T10:01:00.000Z"))).state, activeOidc.state);
    const expiredOidcRows = psql(backend, "SELECT count(*) FROM saas.oidc_transactions WHERE status='expired' AND consumed_at IS NOT NULL;").stdout.trim();
    assert.ok(Number(expiredOidcRows) >= 3);

    const corrupted = oidc("oidc-state-corrupted");
    await oidcA.save(corrupted);
    const corruptedDigest = createOpaqueStateDigester({ key: material.hmacKey, context: "oidc-transaction-state" }).digest(corrupted.state);
    psql(backend, `ALTER TABLE saas.oidc_transactions DISABLE TRIGGER oidc_transactions_guard; UPDATE saas.oidc_transactions SET payload_ciphertext = set_byte(payload_ciphertext, 0, get_byte(payload_ciphertext, 0) # 1) WHERE state_digest='${corruptedDigest}'; ALTER TABLE saas.oidc_transactions ENABLE TRIGGER oidc_transactions_guard;`);
    await assert.rejects(oidcB.consume(corrupted.state, new Date("2026-07-12T10:01:00.000Z")), /identity_crypto_failed/);

    const wrongIdentityKey = registration("attempt_b1b1wrongkey0010", "registration-state-identity-wrong-key", undefined, undefined, "b1b1-wrong-key");
    await prepareVerified(registrationsA, wrongIdentityKey);
    psql(backend, `ALTER TABLE saas.registration_verified_identities DISABLE TRIGGER registration_verified_identities_immutable_guard; UPDATE saas.registration_verified_identities SET encryption_key_id='unknown-key' WHERE attempt_id='${wrongIdentityKey.id}'; ALTER TABLE saas.registration_verified_identities ENABLE TRIGGER registration_verified_identities_immutable_guard;`);
    await assert.rejects(registrationsB.loadVerified(wrongIdentityKey.id), /registration_completion_corrupt/);

    const identityAadSource = registration("attempt_b1b1aadsource010", "registration-state-identity-aad-source", undefined, undefined, "b1b1-aad-source");
    const identityAadTarget = registration("attempt_b1b1aadtarget010", "registration-state-identity-aad-target", undefined, undefined, "b1b1-aad-target");
    await prepareVerified(registrationsA, identityAadSource);
    await prepareVerified(registrationsA, identityAadTarget);
    psql(backend, `ALTER TABLE saas.registration_verified_identities DISABLE TRIGGER registration_verified_identities_immutable_guard;
      UPDATE saas.registration_verified_identities AS target SET
        payload_ciphertext = source.payload_ciphertext,
        payload_iv = source.payload_iv,
        encryption_key_id = source.encryption_key_id,
        payload_schema_version = source.payload_schema_version
      FROM saas.registration_verified_identities AS source
      WHERE target.attempt_id='${identityAadTarget.id}' AND source.attempt_id='${identityAadSource.id}';
      ALTER TABLE saas.registration_verified_identities ENABLE TRIGGER registration_verified_identities_immutable_guard;`);
    await assert.rejects(registrationsB.loadVerified(identityAadTarget.id), /registration_completion_corrupt/);

    const tamperedIdentity = registration("attempt_b1b1tampered0010", "registration-state-identity-tamper", undefined, undefined, "b1b1-tampered");
    await prepareVerified(registrationsA, tamperedIdentity);
    psql(backend, `ALTER TABLE saas.registration_verified_identities DISABLE TRIGGER registration_verified_identities_immutable_guard; UPDATE saas.registration_verified_identities SET payload_ciphertext = set_byte(payload_ciphertext, 0, get_byte(payload_ciphertext, 0) # 1) WHERE attempt_id='${tamperedIdentity.id}'; ALTER TABLE saas.registration_verified_identities ENABLE TRIGGER registration_verified_identities_immutable_guard;`);
    await assert.rejects(registrationsB.loadVerified(tamperedIdentity.id), /registration_completion_corrupt/);

    const persistedText = psql(backend, "SELECT encode(payload_ciphertext, 'hex') || ':' || encode(payload_iv, 'hex') FROM saas.oidc_transactions UNION ALL SELECT encode(payload_ciphertext, 'hex') || ':' || encode(payload_iv, 'hex') FROM saas.registration_workflows UNION ALL SELECT encode(payload_ciphertext, 'hex') || ':' || encode(payload_iv, 'hex') FROM saas.registration_verified_identities;").stdout;
    assert.doesNotMatch(persistedText, /registration-state|oidc-state|nonce|verifier|password/i);
    const rawScan = psql(backend, "SELECT coalesce(string_agg(row_to_json(row)::text, E'\\n'), '') FROM (SELECT * FROM saas.registration_workflows UNION ALL SELECT NULL::text AS attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, 1::bigint AS version, NULL::character(64) AS canonical_fingerprint, created_at AS requested_at, created_at, updated_at, expires_at, consumed_at, NULL::text AS failure_code, COALESCE(discarded_at, consumed_at) AS terminal_at, NULL::character(64) AS tenant_idempotency_digest FROM saas.oidc_transactions) AS row;").stdout;
    assert.doesNotMatch(rawScan, /registration-state|oidc-state|nonce-|vvvv|password/i);
    const verifiedRawScan = psql(backend, "SELECT coalesce(string_agg(row_to_json(snapshot)::text, E'\\n'), '') FROM saas.registration_verified_identities AS snapshot;").stdout;
    assert.doesNotMatch(verifiedRawScan, /identity\.example|verified-subject|owner@example|Verified Owner|nonce|audience|token|password/i);

    const backupReadable = oidc("oidc-state-backup-readable");
    const backupWrong = oidc("oidc-state-backup-wrong");
    await oidcA.save(backupReadable);
    await oidcA.save(backupWrong);
    const backupRegistration = registration("attempt_b1b1backuprestore", "registration-state-backup-identity", undefined, undefined, "b1b1-backup-store");
    await prepareVerified(registrationsA, backupRegistration);
    const dump = dataDump(backend);
    createDatabase(backend, restoreDatabase);
    applyPhase2A(backend, restoreDatabase, false, false);
    applyPhase2B(backend, restoreDatabase);
    applyPhase2B1B1(backend, restoreDatabase);
    psql(backend, dump, restoreDatabase);
    const restorePool = makePool(backend, restoreDatabase);
    pools.push(restorePool);
    const restored = new PostgresOidcTransactionStore(dependencies(restorePool, material, "oidc-transaction-state"));
    assert.equal((await restored.consume(backupReadable.state, new Date("2026-07-12T10:01:00.000Z"))).nonce, backupReadable.nonce);
    const restoredRegistration = new PostgresRegistrationAttemptStore(dependencies(restorePool, material, "registration-attempt-state"));
    assert.equal((await restoredRegistration.loadVerified(backupRegistration.id)).tenantInput.store.slug, "b1b1-backup-store");
    const restoredCompletionStore = new PostgresRegistrationAttemptStore(
      dependencies(restorePool, material, "registration-attempt-state"),
      completionResultAuthorities,
    );
    let restoredTenantCoreCalls = 0;
    const restoredCompleted = await completionService(restoredCompletionStore, restorePool, undefined, {
      wrapTenantCore: (base) => ({
        createStarterTenant: async (input) => {
          restoredTenantCoreCalls += 1;
          return base.createStarterTenant(input);
        },
      }),
    }).resumeTenantCreation(firstCreation.id);
    assert.equal(restoredCompleted.kind, "tenant_already_created");
    assert.equal(restoredCompleted.result.operationId, firstCreationResult.result.operationId);
    assert.equal(restoredTenantCoreCalls, 0);
    assert.equal(psql(backend, "SELECT count(*) FROM saas.registration_tenant_completions AS completion LEFT JOIN saas.tenant_operations AS operation ON operation.id=completion.tenant_operation_id WHERE completion.state='completed' AND operation.id IS NULL;", restoreDatabase).stdout.trim(), "0");
    const restoreWrong = new PostgresOidcTransactionStore(dependencies(restorePool, { ...material, keyring: { "key-current": randomBytes(32) } }, "oidc-transaction-state"));
    await assert.rejects(restoreWrong.consume(backupWrong.state, new Date("2026-07-12T10:01:00.000Z")), /identity_crypto_failed/);

    const cascadeCleanup = registration("attempt_b1b1cleanupcascade", "registration-state-cleanup-cascade", undefined, undefined, "b1b1-cleanup-store");
    const cascadeAuthority = await prepareVerified(registrationsA, cascadeCleanup);
    await registrationsA.markCancelled({
      attemptId: cascadeCleanup.id,
      expectedStatus: "identity_verified",
      expectedVersion: cascadeAuthority.version,
      now: new Date("2026-07-12T10:04:00.000Z"),
    });
    assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_verified_identities WHERE attempt_id='${cascadeCleanup.id}';`).stdout.trim(), "1");
    assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_tenant_completions WHERE attempt_id='${cascadeCleanup.id}';`).stdout.trim(), "1");
    assert.ok(await registrationsA.cleanupTerminal(new Date("2026-07-12T10:06:00.000Z"), 100) >= 4);
    assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_verified_identities WHERE attempt_id='${cascadeCleanup.id}';`).stdout.trim(), "0");
    assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_tenant_completions WHERE attempt_id='${cascadeCleanup.id}';`).stdout.trim(), "0");
    assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_tenant_completions WHERE attempt_id='${expiryCreating.id}' AND state='creating';`).stdout.trim(), "1");
    assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_tenant_completions WHERE attempt_id='${expiryUnknown.id}' AND state='commit_unknown';`).stdout.trim(), "1");
    assert.ok(await oidcA.cleanupTerminal(new Date("2026-07-12T10:06:00.000Z"), 100) >= 3);

    createDatabase(backend, rollbackDatabase);
    applyPhase2A(backend, rollbackDatabase, false, false);
    applyPhase2B(backend, rollbackDatabase);
    applyPhase2B1B1(backend, rollbackDatabase);
    migration(backend, "202607120012_verified_identity_snapshot.down.sql", rollbackDatabase);
    assert.equal(psql(backend, "SELECT (to_regclass('saas.registration_verified_identities') IS NULL)::int || ':' || (to_regclass('saas.registration_tenant_completions') IS NULL)::int || ':' || (to_regclass('saas.registration_tenant_operation_proofs') IS NULL)::int || ':' || (to_regprocedure('saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)') IS NULL)::int || ':' || (to_regclass('saas.registration_workflows') IS NOT NULL)::int || ':' || (SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name='registration_workflows' AND column_name='tenant_idempotency_digest');", rollbackDatabase).stdout.trim(), "1:1:1:1:1:0");
    applyPhase2B1B1(backend, rollbackDatabase);
    assert.equal(psql(backend, "SELECT (to_regclass('saas.registration_verified_identities') IS NOT NULL)::int || ':' || (to_regclass('saas.registration_tenant_completions') IS NOT NULL)::int || ':' || (to_regclass('saas.registration_tenant_operation_proofs') IS NOT NULL)::int || ':' || (to_regprocedure('saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)') IS NOT NULL)::int || ':' || (SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name='registration_workflows' AND column_name='tenant_idempotency_digest');", rollbackDatabase).stdout.trim(), "1:1:1:1:1");
    migration(backend, "202607120012_verified_identity_snapshot.down.sql", rollbackDatabase);
    migration(backend, "202607110008_identity_persistence.down.sql", rollbackDatabase);
    assert.equal(psql(backend, "SELECT (to_regclass('saas.registration_workflows') IS NULL)::int || ':' || (to_regclass('saas.stores') IS NOT NULL)::int;", rollbackDatabase).stdout.trim(), "1:1");
    applyPhase2B(backend, rollbackDatabase);
    applyPhase2B1B1(backend, rollbackDatabase);
    assert.equal(psql(backend, "SELECT count(*) FROM saas.registration_workflows;", rollbackDatabase).stdout.trim(), "0");

    console.log(JSON.stringify({
      status: "PASS",
      backend: backend.kind === "native" ? "native-postgresql" : backend.engine,
      postgresqlVersion: version,
      scenarios: 156,
      forward: "PASS", rollback: "PASS", reapply: "PASS", backupRestore: "PASS",
      concurrency: "PASS", cleanup: "PASS", plaintextScan: "PASS", roleGrants: "PASS",
      productionConnectionUsed: false,
    }, null, 2));
  } finally {
    await Promise.allSettled(pools.map((pool) => pool.end()));
    if (rolesCreated) {
      psql(backend, `REVOKE celebix_saas_identity, celebix_saas_bootstrap FROM ${workloadRole}; DROP ROLE IF EXISTS ${workloadRole};`, "postgres", { allowFailure: true });
      for (const database of [restoreDatabase, rollbackDatabase, primaryDatabase]) {
        if (psql(backend, `SELECT count(*) FROM pg_database WHERE datname='${database}';`, "postgres").stdout.trim() !== "1") continue;
        if (psql(backend, "SELECT (to_regclass('saas.registration_verified_identities') IS NOT NULL)::int;", database).stdout.trim() === "1") {
          migration(backend, "202607120012_verified_identity_snapshot.down.sql", database, true);
        }
        if (psql(backend, "SELECT (to_regclass('saas.registration_workflows') IS NOT NULL)::int;", database).stdout.trim() === "1") {
          migration(backend, "202607110008_identity_persistence.down.sql", database, true);
        }
        migration(backend, "202607110002_foundation.down.sql", database, true);
      }
      migration(backend, "202607110011_identity_roles.down.sql", "postgres", false);
      migration(backend, "202607110006_roles.down.sql", "postgres", false);
      for (const database of [restoreDatabase, rollbackDatabase, primaryDatabase]) psql(backend, `DROP DATABASE ${database} WITH (FORCE);`, "postgres", { allowFailure: true });
    }
    stopPostgres(backend);
  }
}

await main();
