import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "../../../apps/owner/lib/saas-persistence/identity-crypto.ts";
import { RegistrationPersistenceError } from "../../../apps/owner/lib/saas-persistence/postgres-identity-common.ts";
import { PostgresOidcTransactionStore } from "../../../apps/owner/lib/saas-persistence/postgres-oidc-transaction-store.ts";
import { PostgresRegistrationAttemptStore } from "../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts";
import { OidcFlowError } from "../../../apps/owner/lib/self-serve-oidc.ts";
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
const phase2bFiles = [
  "202607110007_identity_roles.up.sql",
  "202607110008_identity_persistence.up.sql",
  "202607110008_identity_persistence.down.sql",
  "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql",
  "202607110011_identity_roles.down.sql",
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

function registration(id, state, createdAt = "2026-07-12T10:00:00.000Z", expiresAt = "2026-07-12T10:10:00.000Z") {
  return {
    id, state,
    details: { storeName: "Disposable Store", storeSlug: "disposable-store", locale: "tr", currency: "TRY", themeKey: "starter", privacyAcceptedAt: createdAt },
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
  const manifest = JSON.parse(sqlText("phase2b1-manifest.json"));
  assert.equal(manifest.postgresqlMajor, 16);
  for (const artifact of manifest.artifacts) assert.equal(sha256(readFileSync(path.join(sqlDirectory, artifact.file))), artifact.sha256);
}

function createDatabase(backend, database) {
  psql(backend, `CREATE DATABASE ${database}; GRANT CREATE ON DATABASE ${database} TO celebix_saas_owner;`, "postgres");
}

function dataDump(backend) {
  const args = ["-U", "postgres", "-d", primaryDatabase, "--data-only", "--inserts", "--no-owner", "--no-privileges", "--table=saas.registration_workflows", "--table=saas.oidc_transactions"];
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
    rolesCreated = true;
    psql(backend, `CREATE ROLE ${workloadRole} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT celebix_saas_identity TO ${workloadRole};`, "postgres");

    const attributes = psql(backend, "SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolsuper::int || ':' || rolcreatedb::int || ':' || rolcreaterole::int || ':' || rolreplication::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='celebix_saas_identity';", primaryDatabase).stdout.trim();
    assert.equal(attributes, "0:0:0:0:0:0:0");
    const unrelated = psql(backend, "SET ROLE celebix_saas_identity; SELECT count(*) FROM saas.stores;", primaryDatabase, { allowFailure: true });
    assert.notEqual(unrelated.status, 0);

    const material = { hmacKey: randomBytes(32), currentKeyId: "key-current", keyring: { "key-current": randomBytes(32), "key-old": randomBytes(32) } };
    const poolA = makePool(backend);
    const poolB = makePool(backend);
    pools.push(poolA, poolB);
    const registrationsA = new PostgresRegistrationAttemptStore(dependencies(poolA, material, "registration-attempt-state"));
    const registrationsB = new PostgresRegistrationAttemptStore(dependencies(poolB, material, "registration-attempt-state"));
    const oidcA = new PostgresOidcTransactionStore(dependencies(poolA, material, "oidc-transaction-state"));
    const oidcB = new PostgresOidcTransactionStore(dependencies(poolB, material, "oidc-transaction-state"));

    const first = registration("attempt_1234567890abcdef", "registration-state-one");
    await registrationsA.save(first);
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET expires_at = expires_at + interval '1 hour' WHERE attempt_id='${first.id}'`, "identity registration expiry extension");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET requested_at = requested_at + interval '1 second' WHERE attempt_id='${first.id}'`, "identity requested_at rewrite");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET updated_at = updated_at - interval '1 second' WHERE attempt_id='${first.id}'`, "identity registration updated_at rollback");
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
    const fingerprint = "a".repeat(64);
    const identity = await registrationsA.markIdentityVerified({ attemptId: workflow.id, expectedStatus: "awaiting_identity", expectedVersion: 1, canonicalFingerprint: fingerprint, now: new Date("2026-07-12T10:02:00.000Z") });
    assert.equal(identity.version, 2);
    const optimistic = await Promise.allSettled([
      registrationsA.markTenantCreated({ attemptId: workflow.id, expectedStatus: "identity_verified", expectedVersion: 2, now: new Date("2026-07-12T10:03:00.000Z") }),
      registrationsB.markTenantCreated({ attemptId: workflow.id, expectedStatus: "identity_verified", expectedVersion: 2, now: new Date("2026-07-12T10:03:00.000Z") }),
    ]);
    assert.equal(optimistic.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(optimistic.filter((result) => result.status === "rejected" && result.reason.code === "registration_workflow_conflict").length, 1);
    const tenant = optimistic.find((result) => result.status === "fulfilled").value;
    const session = await registrationsB.markSessionCreated({ attemptId: workflow.id, expectedStatus: "tenant_created", expectedVersion: tenant.version, now: new Date("2026-07-12T10:04:00.000Z") });
    assert.equal(session.status, "session_created");
    await assert.rejects(registrationsA.markFailed({ attemptId: workflow.id, expectedStatus: "session_created", expectedVersion: session.version, failureCode: "late", now: new Date("2026-07-12T10:05:00.000Z") }), (error) => error.code === "registration_workflow_invalid_transition");
    assertIdentityMutationDenied(backend, `UPDATE saas.registration_workflows SET terminal_at = terminal_at + interval '1 second', updated_at = updated_at + interval '1 second' WHERE attempt_id='${workflow.id}'`, "registration terminal timestamp rewrite");

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

    const persistedText = psql(backend, "SELECT encode(payload_ciphertext, 'hex') || ':' || encode(payload_iv, 'hex') FROM saas.oidc_transactions UNION ALL SELECT encode(payload_ciphertext, 'hex') || ':' || encode(payload_iv, 'hex') FROM saas.registration_workflows;").stdout;
    assert.doesNotMatch(persistedText, /registration-state|oidc-state|nonce|verifier|password/i);
    const rawScan = psql(backend, "SELECT coalesce(string_agg(row_to_json(row)::text, E'\\n'), '') FROM (SELECT * FROM saas.registration_workflows UNION ALL SELECT NULL::text AS attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, 1::bigint AS version, NULL::character(64) AS canonical_fingerprint, created_at AS requested_at, created_at, updated_at, expires_at, consumed_at, NULL::text AS failure_code, COALESCE(discarded_at, consumed_at) AS terminal_at FROM saas.oidc_transactions) AS row;").stdout;
    assert.doesNotMatch(rawScan, /registration-state|oidc-state|nonce-|vvvv|password/i);

    const backupReadable = oidc("oidc-state-backup-readable");
    const backupWrong = oidc("oidc-state-backup-wrong");
    await oidcA.save(backupReadable);
    await oidcA.save(backupWrong);
    const dump = dataDump(backend);
    createDatabase(backend, restoreDatabase);
    applyPhase2A(backend, restoreDatabase, false, false);
    applyPhase2B(backend, restoreDatabase);
    psql(backend, dump, restoreDatabase);
    const restorePool = makePool(backend, restoreDatabase);
    pools.push(restorePool);
    const restored = new PostgresOidcTransactionStore(dependencies(restorePool, material, "oidc-transaction-state"));
    assert.equal((await restored.consume(backupReadable.state, new Date("2026-07-12T10:01:00.000Z"))).nonce, backupReadable.nonce);
    const restoreWrong = new PostgresOidcTransactionStore(dependencies(restorePool, { ...material, keyring: { "key-current": randomBytes(32) } }, "oidc-transaction-state"));
    await assert.rejects(restoreWrong.consume(backupWrong.state, new Date("2026-07-12T10:01:00.000Z")), /identity_crypto_failed/);

    assert.ok(await registrationsA.cleanupTerminal(new Date("2026-07-12T10:06:00.000Z"), 100) >= 4);
    assert.ok(await oidcA.cleanupTerminal(new Date("2026-07-12T10:06:00.000Z"), 100) >= 3);

    createDatabase(backend, rollbackDatabase);
    applyPhase2A(backend, rollbackDatabase, false, false);
    applyPhase2B(backend, rollbackDatabase);
    migration(backend, "202607110008_identity_persistence.down.sql", rollbackDatabase);
    assert.equal(psql(backend, "SELECT (to_regclass('saas.registration_workflows') IS NULL)::int || ':' || (to_regclass('saas.stores') IS NOT NULL)::int;", rollbackDatabase).stdout.trim(), "1:1");
    applyPhase2B(backend, rollbackDatabase);
    assert.equal(psql(backend, "SELECT count(*) FROM saas.registration_workflows;", rollbackDatabase).stdout.trim(), "0");

    console.log(JSON.stringify({
      status: "PASS",
      backend: backend.kind === "native" ? "native-postgresql" : backend.engine,
      postgresqlVersion: version,
      scenarios: 52,
      forward: "PASS", rollback: "PASS", reapply: "PASS", backupRestore: "PASS",
      concurrency: "PASS", cleanup: "PASS", plaintextScan: "PASS", roleGrants: "PASS",
      productionConnectionUsed: false,
    }, null, 2));
  } finally {
    await Promise.allSettled(pools.map((pool) => pool.end()));
    if (rolesCreated) {
      psql(backend, `REVOKE celebix_saas_identity FROM ${workloadRole}; DROP ROLE IF EXISTS ${workloadRole};`, "postgres", { allowFailure: true });
      for (const database of [restoreDatabase, rollbackDatabase, primaryDatabase]) {
        if (psql(backend, `SELECT count(*) FROM pg_database WHERE datname='${database}';`, "postgres").stdout.trim() !== "1") continue;
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
