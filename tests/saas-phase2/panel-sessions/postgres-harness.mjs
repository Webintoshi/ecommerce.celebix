import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { accessSync, appendFileSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { createPanelSessionPersistenceApproval } from "../../../apps/customer-panel/lib/panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../../../apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts";
import {
  DISPOSABLE_IMAGE,
  REQUIRED_APPLY_ORDER,
  REQUIRED_NATIVE_TOOLS,
  assertLocalEngineEndpoint,
  assertSafeEnvironment,
} from "../postgres/disposable-harness.mjs";

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sqlDirectory = path.join(root, "apps", "owner", "scripts", "sql", "saas");
const primaryDatabase = "phase2b2a_primary";
const restoreDatabase = "phase2b2a_restore";
const rollbackDatabase = "phase2b2a_rollback";
const workloadRole = "celebix_phase2b2a_test";
const principalA = "10000000-0000-4000-8000-000000000001";
const principalB = "10000000-0000-4000-8000-000000000002";
const principalNoStore = "10000000-0000-4000-8000-000000000003";
const storeA = "20000000-0000-4000-8000-000000000001";
const storeB = "20000000-0000-4000-8000-000000000002";
const membershipA = "30000000-0000-4000-8000-000000000001";
const membershipB = "30000000-0000-4000-8000-000000000002";
const planId = "00000000-0000-4000-8000-000000000001";
const keyId = "panel.active.v1";
const key = new Uint8Array(32).fill(0x5a);
const operationLockSeed = "6618472391047293";
const familyLockSeed = "-7329146802501471";
let lastDatabaseError;
const phase2bFiles = [
  "202607110007_identity_roles.up.sql",
  "202607110008_identity_persistence.up.sql",
  "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql",
];
const phase2b1b1Files = [
  "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql",
  "202607120014_verified_identity_catalog_assertions.sql",
];

function executable(name) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`disposable command failed: ${path.basename(program)} (${result.status})\n${String(result.stderr ?? "").trim()}`);
  }
  return result;
}

function selectBackend() {
  const native = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(native).every(Boolean)) return { kind: "native", executables: native };
  for (const engine of ["docker", "podman"]) {
    const program = executable(engine);
    if (program) return { kind: "container", engine, executable: program };
  }
  throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
}

function startPostgres() {
  assertSafeEnvironment();
  const backend = { ...selectBackend(), temporaryDirectory: mkdtempSync(path.join(tmpdir(), "celebix-phase2b2a-")), started: false };
  const token = randomBytes(6).toString("hex");
  if (backend.kind === "native") {
    backend.dataDirectory = path.join(backend.temporaryDirectory, "data");
    backend.socketDirectory = path.join("/tmp", `c2b2a-${token}`);
    backend.port = 20_000 + Math.floor(Math.random() * 20_000);
    mkdirSync(backend.socketDirectory, { mode: 0o700 });
    command(backend.executables.initdb, ["-D", backend.dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    appendFileSync(path.join(backend.dataDirectory, "postgresql.conf"), `\nlisten_addresses = ''\nunix_socket_directories = '${backend.socketDirectory}'\nport = ${backend.port}\nmax_connections = 60\n`);
    command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-l", path.join(backend.temporaryDirectory, "postgres.log"), "start"]);
    backend.started = true;
    backend.host = backend.socketDirectory;
  } else {
    backend.container = `celebix-phase2b2a-${token}`;
    if (backend.engine === "docker") {
      const context = command(backend.executable, ["context", "show"]).stdout.trim();
      assertLocalEngineEndpoint(command(backend.executable, ["context", "inspect", context, "--format={{.Endpoints.docker.Host}}"] ).stdout.trim());
      if (command(backend.executable, ["image", "inspect", DISPOSABLE_IMAGE], { allowFailure: true }).status !== 0) throw new Error("DISPOSABLE_IMAGE_NOT_LOCAL");
    } else {
      const connections = JSON.parse(command(backend.executable, ["system", "connection", "list", "--format=json"]).stdout);
      assertLocalEngineEndpoint((connections.find((entry) => entry.Default) ?? connections[0])?.URI);
      if (command(backend.executable, ["image", "exists", DISPOSABLE_IMAGE], { allowFailure: true }).status !== 0) throw new Error("DISPOSABLE_IMAGE_NOT_LOCAL");
    }
    command(backend.executable, ["run", "--detach", "--rm", "--pull=never", "--name", backend.container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", DISPOSABLE_IMAGE]);
    backend.started = true;
    const match = command(backend.executable, ["port", backend.container, "5432/tcp"]).stdout.trim().match(/127\.0\.0\.1:(\d+)$/);
    if (!match) throw new Error("loopback-only PostgreSQL publication required");
    backend.host = "127.0.0.1";
    backend.port = Number(match[1]);
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = backend.kind === "native"
      ? command(backend.executables.pg_isready, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres"], { allowFailure: true })
      : command(backend.executable, ["exec", backend.container, "pg_isready", "-U", "postgres"], { allowFailure: true });
    if (ready.status === 0) return backend;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  throw new Error("disposable PostgreSQL readiness timeout");
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started) {
    if (backend.kind === "native") command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
    else command(backend.executable, ["rm", "--force", backend.container], { allowFailure: true });
  }
  if (backend.socketDirectory) rmSync(backend.socketDirectory, { recursive: true, force: true });
  if (backend.temporaryDirectory) rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psql(backend, source, database = primaryDatabase, options = {}) {
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database];
  const result = backend.kind === "native"
    ? command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), ...args], { input: source, ...options })
    : command(backend.executable, ["exec", "-i", backend.container, "psql", ...args], { input: source, ...options });
  return String(result.stdout ?? "").trim();
}

function migration(backend, file, database = primaryDatabase, asMigrator = true) {
  const source = readFileSync(path.join(sqlDirectory, file), "utf8");
  psql(backend, asMigrator ? `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${source}\nRESET SESSION AUTHORIZATION;` : source, database);
}

function dumpDatabase(backend, database, destination) {
  const args = ["--format=custom", "--dbname", database, "--username", "postgres"];
  const result = backend.kind === "native"
    ? command(backend.executables.pg_dump, ["--host", backend.socketDirectory, "--port", String(backend.port), ...args], { binary: true })
    : command(backend.executable, ["exec", backend.container, "pg_dump", ...args], { binary: true });
  return result.stdout;
}

function restoreDatabaseDump(backend, database, dump) {
  const args = ["--exit-on-error", "--dbname", database, "--username", "postgres"];
  if (backend.kind === "native") command(backend.executables.pg_restore, ["--host", backend.socketDirectory, "--port", String(backend.port), ...args], { input: dump, binary: true });
  else command(backend.executable, ["exec", "-i", backend.container, "pg_restore", ...args], { input: dump, binary: true });
}

function pool(backend, database = primaryDatabase, user = workloadRole) {
  return new Pool({ host: backend.host, port: backend.port, user, database, max: 12, connectionTimeoutMillis: 2_000 });
}

function deterministic(seed) {
  let call = 0;
  return (size) => new Uint8Array(size).fill(((seed + call++) % 250) + 1);
}

function repository(databasePool, options = {}) {
  const clock = { value: new Date() };
  const approval = createPanelSessionPersistenceApproval("disposable_test");
  const instance = createPostgresPanelSessionRepository(approval, {
    pool: options.commitUnknown ? unknownCommitPool(databasePool) : observedPool(databasePool),
    keys: new Map([[keyId, key]]),
    activeKeyId: keyId,
    clock: () => new Date(clock.value),
    randomBytes: options.seed === undefined ? (size) => new Uint8Array(randomBytes(size)) : deterministic(options.seed),
    timeouts: { poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 },
    cleanupLimit: options.cleanupLimit ?? 25,
    audit: () => undefined,
  });
  return {
    instance,
    async at(now, operation) { clock.value = new Date(now); return operation(instance); },
  };
}

function observedPool(databasePool) {
  return {
    async connect() {
      const client = await databasePool.connect();
      return {
        async query(text, values) {
          try { return await client.query(text, values); }
          catch (error) { lastDatabaseError = error; throw error; }
        },
        release(destroy) { client.release(destroy); },
      };
    },
  };
}

function unknownCommitPool(databasePool) {
  return {
    async connect() {
      const client = await databasePool.connect();
      return {
        async query(text, values) {
          if (text === "COMMIT") {
            await client.query(text, values);
            throw new Error("simulated response loss after forwarded commit");
          }
          return client.query(text, values);
        },
        release(destroy) { client.release(destroy); },
      };
    },
  };
}

function changedCredential(value) {
  const last = value.at(-1);
  return `${value.slice(0, -1)}${last === "A" ? "B" : "A"}`;
}

function credentialProof(credential) {
  const separator = credential.length - 44;
  return {
    tokenKeyId: credential.slice(3, separator),
    tokenDigest: createHmac("sha256", key).update(`celebix-panel-session-v1\n${credential}`, "utf8").digest("hex"),
  };
}

function deterministicCredential(byte) {
  return `v1.${keyId}.${Buffer.alloc(32, byte).toString("base64url")}`;
}

async function assertPending(promise) {
  let settled = false;
  void promise.finally(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
}

async function run() {
  let backend;
  let workloadPool;
  let concurrencyPoolA;
  let concurrencyPoolB;
  let restorePool;
  let scenarios = 0;
  const evidence = [];
  const scenario = async (name, proof) => {
    await proof();
    scenarios += 1;
    evidence.push(name);
  };
  try {
    backend = startPostgres();
    await scenario("disposable PostgreSQL 16 cluster", async () => {
      const version = Number(psql(backend, "SHOW server_version_num;", "postgres"));
      assert.equal(Math.floor(version / 10_000), 16);
    });
    psql(backend, `CREATE DATABASE ${primaryDatabase};`, "postgres");
    migration(backend, REQUIRED_APPLY_ORDER[0], primaryDatabase, false);
    for (const file of REQUIRED_APPLY_ORDER.slice(1)) migration(backend, file);
    migration(backend, phase2bFiles[0], primaryDatabase, false);
    for (const file of phase2bFiles.slice(1)) migration(backend, file);
    for (const file of phase2b1b1Files) migration(backend, file);
    migration(backend, "202607140015_panel_sessions.up.sql");
    await scenario("migrations 001 through 015", async () => assert.equal(psql(backend, "SELECT to_regclass('saas.panel_sessions') IS NOT NULL;"), "t"));
    await scenario("transaction-scoped operation and family lock catalog", async () => {
      const definitions = psql(backend, "SELECT string_agg(pg_get_functiondef(p.oid), E'\\n') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN ('issue_panel_session','rotate_panel_session','revoke_panel_session_family');");
      assert.equal(definitions.includes("pg_advisory_xact_lock"), true);
      assert.equal(definitions.includes(operationLockSeed), true);
      assert.equal(definitions.includes(familyLockSeed), true);
      assert.equal(definitions.includes("pg_advisory_unlock"), false);
    });
    await scenario("manifest checksums", async () => {
      const manifest = JSON.parse(readFileSync(path.join(sqlDirectory, "phase2b2a-manifest.json"), "utf8"));
      for (const artifact of manifest.artifacts) {
        assert.equal(artifact.sha256, createHash("sha256").update(readFileSync(path.join(sqlDirectory, artifact.file))).digest("hex"));
      }
    });
    await scenario("database owner", async () => assert.equal(psql(backend, "SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='saas.panel_sessions'::regclass;"), "celebix_saas_owner"));
    psql(backend, `CREATE ROLE ${workloadRole} LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT celebix_saas_identity TO ${workloadRole};`, "postgres");
    await scenario("workload role", async () => assert.equal(psql(backend, "SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='celebix_saas_identity';"), "0:0:0"));
    await scenario("PUBLIC revocations", async () => assert.equal(psql(backend, "SELECT has_table_privilege('public','saas.panel_sessions','SELECT,INSERT,UPDATE,DELETE')::int || ':' || has_function_privilege('public','saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE')::int;"), "0:0"));
    await scenario("no direct table mutation grants", async () => assert.equal(psql(backend, "SELECT has_table_privilege('celebix_saas_identity','saas.panel_sessions','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')::int;"), "0"));

    const seedTime = new Date().toISOString();
    psql(backend, `SET ROLE celebix_saas_owner;
      INSERT INTO saas.principals (id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
        ('${principalA}','https://identity.example.test/oidc','subject-a','a@example.test',true,'${seedTime}','${seedTime}'),
        ('${principalB}','https://identity.example.test/oidc','subject-b','b@example.test',true,'${seedTime}','${seedTime}'),
        ('${principalNoStore}','https://identity.example.test/oidc','subject-c','c@example.test',true,'${seedTime}','${seedTime}');
      INSERT INTO saas.stores (id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${storeA}','Store A','store-a','active','tr','TRY','starter','${seedTime}','${seedTime}'),
        ('${storeB}','Store B','store-b','active','tr','TRY','starter','${seedTime}','${seedTime}');
      INSERT INTO saas.memberships (id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${membershipA}','${principalA}','${storeA}','store_owner','active','${seedTime}','${seedTime}'),
        ('${membershipB}','${principalB}','${storeB}','store_owner','active','${seedTime}','${seedTime}');
      INSERT INTO saas.subscriptions (id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
        ('40000000-0000-4000-8000-000000000001','${storeA}','${planId}','free_starter',1,'active','${seedTime}',NULL,'${seedTime}','${seedTime}'),
        ('40000000-0000-4000-8000-000000000002','${storeB}','${planId}','free_starter',1,'active','${seedTime}',NULL,'${seedTime}','${seedTime}');
      RESET ROLE;`);
    await scenario("test principal", async () => assert.equal(psql(backend, "SELECT count(*) FROM saas.principals;"), "3"));
    await scenario("two stores", async () => assert.equal(psql(backend, "SELECT count(*) FROM saas.stores;"), "2"));
    await scenario("active and foreign memberships", async () => assert.equal(psql(backend, "SELECT count(*) FROM saas.memberships WHERE status='active';"), "2"));
    await scenario("canonical key-id negative calls", async () => {
      const invalidKeyIds = [".leading", "trailing.", "double..dot"];
      for (const invalidKeyId of invalidKeyIds) {
        const result = psql(backend, `SET ROLE celebix_saas_identity;
          SELECT outcome FROM saas.issue_panel_session(
            '${randomUUID()}','${randomUUID()}','${randomUUID()}','${invalidKeyId}',
            '${createHash("sha256").update(invalidKeyId).digest("hex")}',
            '${principalA}',NULL,clock_timestamp(),clock_timestamp() + interval '1 hour'
          ); RESET ROLE;`);
        assert.equal(result, "durable_authority_invalid");
      }
    });

    workloadPool = pool(backend);
    concurrencyPoolA = pool(backend);
    concurrencyPoolB = pool(backend);
    const live = repository(workloadPool);

    const exactIssueNow = new Date();
    const exactIssueOperation = randomUUID();
    const exactIssueA = repository(concurrencyPoolA, { seed: 101 });
    const exactIssueB = repository(concurrencyPoolB, { seed: 101 });
    const exactIssueResults = await Promise.all([
      exactIssueA.at(exactIssueNow, (repo) => repo.issueSession({ operationId: exactIssueOperation, principalId: principalA, activeStoreId: storeA, now: exactIssueNow })),
      exactIssueB.at(exactIssueNow, (repo) => repo.issueSession({ operationId: exactIssueOperation, principalId: principalA, activeStoreId: storeA, now: exactIssueNow })),
    ]);
    await scenario("concurrent exact issue replay", async () => {
      assert.deepEqual(exactIssueResults.map((entry) => entry.kind).sort(), ["issued", "operation_replayed"]);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE operation_id='${exactIssueOperation}';`), "1");
    });

    const mismatchedIssueNow = new Date();
    const mismatchedIssueOperation = randomUUID();
    const mismatchedIssueA = repository(concurrencyPoolA, { seed: 102 });
    const mismatchedIssueB = repository(concurrencyPoolB, { seed: 103 });
    const mismatchedIssueResults = await Promise.all([
      mismatchedIssueA.at(mismatchedIssueNow, (repo) => repo.issueSession({ operationId: mismatchedIssueOperation, principalId: principalA, activeStoreId: storeA, now: mismatchedIssueNow })),
      mismatchedIssueB.at(mismatchedIssueNow, (repo) => repo.issueSession({ operationId: mismatchedIssueOperation, principalId: principalA, activeStoreId: storeA, now: mismatchedIssueNow })),
    ]);
    await scenario("concurrent mismatched issue replay", async () => {
      assert.deepEqual(mismatchedIssueResults.map((entry) => entry.kind).sort(), ["issued", "operation_mismatch"]);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE operation_id='${mismatchedIssueOperation}';`), "1");
    });

    const issueNow = new Date();
    const issue = await live.at(issueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: issueNow }));
    await scenario("issue session", async () => assert.equal(issue.kind, "issued"));
    assert.equal(issue.kind, "issued");
    await scenario("root row-shape and replacement continuity invariants", async () => {
      const invariantNow = new Date();
      const values = (operationKind, familyId, previousSessionId, digestSeed) => `(
        '${randomUUID()}','${familyId}','${randomUUID()}','${operationKind}','invariant.v1',
        '${createHash("sha256").update(digestSeed).digest("hex")}','${principalA}','${storeA}',
        ${previousSessionId ? `'${previousSessionId}'` : "NULL"},NULL,1,
        '${invariantNow.toISOString()}','${invariantNow.toISOString()}','${new Date(invariantNow.getTime() + 60 * 60_000).toISOString()}',
        NULL,NULL,'${invariantNow.toISOString()}','${invariantNow.toISOString()}'
      )`;
      psql(backend, `SET ROLE celebix_saas_owner;
        DO $invariants$
        BEGIN
          BEGIN
            INSERT INTO saas.panel_sessions VALUES ${values("issue", issue.session.familyId, null, "duplicate-root")};
            RAISE EXCEPTION 'PHASE2B2A_EXPECTED_ROOT_REJECTION';
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
          BEGIN
            INSERT INTO saas.panel_sessions VALUES ${values("issue", randomUUID(), issue.session.sessionId, "issue-with-previous")};
            RAISE EXCEPTION 'PHASE2B2A_EXPECTED_SHAPE_REJECTION';
          EXCEPTION WHEN check_violation THEN NULL;
          END;
          BEGIN
            INSERT INTO saas.panel_sessions VALUES ${values("rotate", randomUUID(), issue.session.sessionId, "broken-continuity")};
            RAISE EXCEPTION 'PHASE2B2A_EXPECTED_CONTINUITY_REJECTION';
          EXCEPTION WHEN raise_exception THEN
            IF SQLERRM <> 'PHASE2B2A_INVALID_SESSION_TRANSITION' THEN RAISE; END IF;
          END;
        END
        $invariants$;
        RESET ROLE;`);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE family_id='${issue.session.familyId}' AND operation_kind='issue';`), "1");
    });
    const originalCredential = issue.credential;
    await scenario("raw credential absent", async () => {
      const scan = psql(backend, "SELECT coalesce(string_agg(row_to_json(session)::text,''),'') FROM saas.panel_sessions AS session;");
      assert.equal(scan.includes(originalCredential), false);
      assert.equal(scan.includes(originalCredential.split(".").at(-1)), false);
    });
    const resolved = await live.at(new Date(), (repo) => repo.resolveSession({ credential: originalCredential, requestId: "request-real-1", now: liveTime(live) }));
    await scenario("resolve credential", async () => assert.equal(resolved.kind, "resolved", lastDatabaseError?.stack));
    await scenario("TenantContext", async () => {
      assert.equal(resolved.kind, "resolved");
      assert.equal(resolved.tenantContext?.store.id, storeA);
      assert.equal(resolved.tenantContext?.membership.id, membershipA);
      assert.deepEqual(resolved.tenantContext?.entitlements.features, ["catalog", "orders", "customers", "content", "media", "analytics", "checkout"]);
    });
    await scenario("deep-frozen runtime authority", async () => {
      assert.equal(Object.isFrozen(resolved), true);
      assert.equal(Object.isFrozen(resolved.kind === "resolved" ? resolved.session : null), true);
      assert.equal(Object.isFrozen(resolved.kind === "resolved" ? resolved.tenantContext : null), true);
      assert.equal(Object.isFrozen(resolved.kind === "resolved" ? resolved.tenantContext?.entitlements.features : null), true);
      assert.equal(Object.isFrozen(resolved.kind === "resolved" ? resolved.tenantContext?.entitlements.limits : null), true);
    });
    const wrong = await live.at(new Date(), (repo) => repo.resolveSession({ credential: changedCredential(originalCredential), requestId: "request-wrong", now: liveTime(live) }));
    await scenario("wrong credential", async () => assert.equal(wrong.kind, "unauthenticated"));
    const unknownKey = originalCredential.replace(keyId, "panel.removed.v1");
    const unknown = await live.at(new Date(), (repo) => repo.resolveSession({ credential: unknownKey, requestId: "request-key", now: liveTime(live) }));
    await scenario("unknown key", async () => assert.equal(unknown.kind, "unauthenticated"));
    const missingPrincipalNow = new Date();
    const missingPrincipal = await live.at(missingPrincipalNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: "90000000-0000-4000-8000-000000000009", activeStoreId: storeA, now: missingPrincipalNow }));
    await scenario("invalid principal", async () => assert.equal(missingPrincipal.kind, "durable_authority_invalid"));
    const deniedNow = new Date();
    const deniedStore = await live.at(deniedNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeB, now: deniedNow }));
    await scenario("unauthorized store", async () => assert.equal(deniedStore.kind, "membership_denied"));
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended',updated_at=clock_timestamp() WHERE id='${storeB}'; RESET ROLE;`);
    const inactiveNow = new Date();
    const inactiveStore = await live.at(inactiveNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalB, activeStoreId: storeB, now: inactiveNow }));
    await scenario("inactive store issue denial", async () => assert.equal(inactiveStore.kind, "membership_denied"));
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='active',updated_at=clock_timestamp() WHERE id='${storeB}'; RESET ROLE;`);
    const crossNow = new Date();
    const crossPrincipal = await live.at(crossNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalB, activeStoreId: storeA, now: crossNow }));
    await scenario("cross-principal denial", async () => assert.equal(crossPrincipal.kind, "membership_denied"));
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked',updated_at=clock_timestamp() WHERE id='${membershipA}'; RESET ROLE;`);
    const revokedMembership = await live.at(new Date(), (repo) => repo.resolveSession({ credential: originalCredential, requestId: "request-revoked-membership", now: liveTime(live) }));
    await scenario("membership revocation denial", async () => assert.equal(revokedMembership.kind, "membership_denied"));
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='active',updated_at=clock_timestamp() WHERE id='${membershipA}'; RESET ROLE;`);
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended',updated_at=clock_timestamp() WHERE id='${storeA}'; RESET ROLE;`);
    const suspended = await live.at(new Date(), (repo) => repo.resolveSession({ credential: originalCredential, requestId: "request-suspended", now: liveTime(live) }));
    await scenario("active-store invalidation denial", async () => assert.equal(suspended.kind, "membership_denied"));
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='active',updated_at=clock_timestamp() WHERE id='${storeA}'; RESET ROLE;`);

    const zeroNow = new Date();
    const zeroIssue = await live.at(zeroNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalNoStore, now: zeroNow }));
    assert.equal(zeroIssue.kind, "issued");
    const zeroResolve = await live.at(new Date(), (repo) => repo.resolveSession({ credential: zeroIssue.credential, requestId: "request-zero", now: liveTime(live) }));
    await scenario("zero-membership denial", async () => assert.equal(zeroResolve.kind, "membership_denied"));
    const candidateNow = new Date();
    const candidateIssue = await live.at(candidateNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, now: candidateNow }));
    assert.equal(candidateIssue.kind, "issued");
    const candidateResolve = await live.at(new Date(), (repo) => repo.resolveSession({ credential: candidateIssue.credential, requestId: "request-candidate", now: liveTime(live) }));
    await scenario("single-membership candidate", async () => {
      assert.equal(candidateResolve.kind, "resolved");
      assert.deepEqual(candidateResolve.selectionCandidate, { storeId: storeA });
      assert.equal(candidateResolve.tenantContext, undefined);
    });
    psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.memberships (id,principal_id,store_id,role,status,created_at,updated_at) VALUES ('30000000-0000-4000-8000-000000000003','${principalA}','${storeB}','admin','active',clock_timestamp(),clock_timestamp()); RESET ROLE;`);
    const ambiguous = await live.at(new Date(), (repo) => repo.resolveSession({ credential: candidateIssue.credential, requestId: "request-ambiguous", now: liveTime(live) }));
    await scenario("multiple-membership ambiguity", async () => assert.equal(ambiguous.kind, "membership_denied"));
    psql(backend, `SET ROLE celebix_saas_owner; DELETE FROM saas.memberships WHERE id='30000000-0000-4000-8000-000000000003'; RESET ROLE;`);

    const deniedRotationNow = new Date();
    const deniedRotation = await live.at(deniedRotationNow, (repo) => repo.rotateSession({ currentCredential: originalCredential, operationId: randomUUID(), requestedStoreId: storeB, now: deniedRotationNow }));
    await scenario("unauthorized rotation", async () => assert.equal(deniedRotation.kind, "membership_denied"));
    const rotationNow = new Date();
    const rotation = await live.at(rotationNow, (repo) => repo.rotateSession({ currentCredential: originalCredential, operationId: randomUUID(), requestedStoreId: storeA, now: rotationNow }));
    await scenario("valid rotation", async () => assert.equal(rotation.kind, "rotated"));
    assert.equal(rotation.kind, "rotated");
    const oldAfterRotation = await live.at(new Date(), (repo) => repo.resolveSession({ credential: originalCredential, requestId: "request-old", now: liveTime(live) }));
    await scenario("old credential rejected", async () => assert.equal(oldAfterRotation.kind, "unauthenticated"));
    const newAfterRotation = await live.at(new Date(), (repo) => repo.resolveSession({ credential: rotation.credential, requestId: "request-new", now: liveTime(live) }));
    await scenario("new credential accepted", async () => assert.equal(newAfterRotation.kind, "resolved"));
    await scenario("absolute expiry preserved", async () => assert.equal(rotation.session.expiresAt, issue.session.expiresAt));

    const exactRotationBaseNow = new Date();
    const exactRotationBase = await live.at(exactRotationBaseNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: exactRotationBaseNow }));
    assert.equal(exactRotationBase.kind, "issued");
    const exactRotationNow = new Date();
    const exactRotationOperation = randomUUID();
    const exactRotationA = repository(concurrencyPoolA, { seed: 111 });
    const exactRotationB = repository(concurrencyPoolB, { seed: 111 });
    const exactRotationResults = await Promise.all([
      exactRotationA.at(exactRotationNow, (repo) => repo.rotateSession({ currentCredential: exactRotationBase.credential, operationId: exactRotationOperation, requestedStoreId: storeA, now: exactRotationNow })),
      exactRotationB.at(exactRotationNow, (repo) => repo.rotateSession({ currentCredential: exactRotationBase.credential, operationId: exactRotationOperation, requestedStoreId: storeA, now: exactRotationNow })),
    ]);
    await scenario("concurrent exact rotation replay", async () => {
      assert.deepEqual(exactRotationResults.map((entry) => entry.kind).sort(), ["operation_replayed", "rotated"]);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE previous_session_id='${exactRotationBase.session.sessionId}';`), "1");
    });

    const mismatchedRotationBaseNow = new Date();
    const mismatchedRotationBase = await live.at(mismatchedRotationBaseNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: mismatchedRotationBaseNow }));
    assert.equal(mismatchedRotationBase.kind, "issued");
    const mismatchedRotationNow = new Date();
    const mismatchedRotationOperation = randomUUID();
    const mismatchedRotationA = repository(concurrencyPoolA, { seed: 112 });
    const mismatchedRotationB = repository(concurrencyPoolB, { seed: 113 });
    const mismatchedRotationResults = await Promise.all([
      mismatchedRotationA.at(mismatchedRotationNow, (repo) => repo.rotateSession({ currentCredential: mismatchedRotationBase.credential, operationId: mismatchedRotationOperation, requestedStoreId: storeA, now: mismatchedRotationNow })),
      mismatchedRotationB.at(mismatchedRotationNow, (repo) => repo.rotateSession({ currentCredential: mismatchedRotationBase.credential, operationId: mismatchedRotationOperation, requestedStoreId: storeA, now: mismatchedRotationNow })),
    ]);
    await scenario("concurrent mismatched rotation replay", async () => {
      assert.deepEqual(mismatchedRotationResults.map((entry) => entry.kind).sort(), ["operation_mismatch", "rotated"]);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE previous_session_id='${mismatchedRotationBase.session.sessionId}';`), "1");
    });

    const concurrentNow = new Date();
    const opOne = randomUUID();
    const opTwo = randomUUID();
    const concurrent = await live.at(concurrentNow, (repo) => Promise.all([
      repo.rotateSession({ currentCredential: rotation.credential, operationId: opOne, now: concurrentNow }),
      repo.rotateSession({ currentCredential: rotation.credential, operationId: opTwo, now: concurrentNow }),
    ]));
    await scenario("concurrent rotation one winner", async () => assert.deepEqual(concurrent.map((entry) => entry.kind).sort(), ["rotated", "unauthenticated"]));
    await scenario("replacement graph does not branch", async () => assert.equal(psql(backend, `SELECT count(*) || ':' || count(DISTINCT previous_session_id) FROM saas.panel_sessions WHERE previous_session_id='${rotation.session.sessionId}';`), "1:1"));

    const replayIssueNow = new Date();
    const replayIssueOperation = randomUUID();
    const issueSeedA = repository(workloadPool, { seed: 10 });
    const firstReplayIssue = await issueSeedA.at(replayIssueNow, (repo) => repo.issueSession({ operationId: replayIssueOperation, principalId: principalA, activeStoreId: storeA, now: replayIssueNow }));
    const issueSeedB = repository(workloadPool, { seed: 10 });
    const matchingIssue = await issueSeedB.at(replayIssueNow, (repo) => repo.issueSession({ operationId: replayIssueOperation, principalId: principalA, activeStoreId: storeA, now: replayIssueNow }));
    await scenario("matching issue replay", async () => assert.equal(matchingIssue.kind, "operation_replayed"));
    const mismatchIssueEnv = repository(workloadPool, { seed: 11 });
    const mismatchIssue = await mismatchIssueEnv.at(replayIssueNow, (repo) => repo.issueSession({ operationId: replayIssueOperation, principalId: principalA, activeStoreId: storeA, now: replayIssueNow }));
    await scenario("issue replay mismatch", async () => assert.equal(mismatchIssue.kind, "operation_mismatch"));
    assert.equal(firstReplayIssue.kind, "issued");

    const replayRotateNow = new Date();
    const replayRotateOperation = randomUUID();
    const rotateSeedA = repository(workloadPool, { seed: 20 });
    const firstReplayRotation = await rotateSeedA.at(replayRotateNow, (repo) => repo.rotateSession({ currentCredential: firstReplayIssue.credential, operationId: replayRotateOperation, now: replayRotateNow }));
    const rotateSeedB = repository(workloadPool, { seed: 20 });
    const matchingRotation = await rotateSeedB.at(replayRotateNow, (repo) => repo.rotateSession({ currentCredential: firstReplayIssue.credential, operationId: replayRotateOperation, now: replayRotateNow }));
    await scenario("matching rotation replay", async () => assert.equal(matchingRotation.kind, "operation_replayed"));
    const rotateMismatchEnv = repository(workloadPool, { seed: 21 });
    const rotationMismatch = await rotateMismatchEnv.at(replayRotateNow, (repo) => repo.rotateSession({ currentCredential: firstReplayIssue.credential, operationId: replayRotateOperation, now: replayRotateNow }));
    await scenario("rotation replay mismatch", async () => assert.equal(rotationMismatch.kind, "operation_mismatch"));
    assert.equal(firstReplayRotation.kind, "rotated");

    const revokeIssueNow = new Date();
    const revokeIssue = await live.at(revokeIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: revokeIssueNow }));
    assert.equal(revokeIssue.kind, "issued");
    const revokeNow = new Date();
    const revoked = await live.at(revokeNow, (repo) => repo.revokeSession({ credential: revokeIssue.credential, reason: "logout", now: revokeNow }));
    await scenario("single-session revocation", async () => assert.equal(revoked.kind, "revoked"));
    const revokedAgain = await live.at(new Date(), (repo) => repo.revokeSession({ credential: revokeIssue.credential, reason: "logout", now: liveTime(live) }));
    await scenario("single-session revocation idempotency", async () => assert.equal(revokedAgain.kind, "revoked"));
    const revokedResolve = await live.at(new Date(), (repo) => repo.resolveSession({ credential: revokeIssue.credential, requestId: "request-revoked", now: liveTime(live) }));
    await scenario("revoked session remains invalid", async () => assert.equal(revokedResolve.kind, "unauthenticated"));

    const familyIssueNow = new Date();
    const familyIssue = await live.at(familyIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: familyIssueNow }));
    assert.equal(familyIssue.kind, "issued");
    const familyRotateOneNow = new Date();
    const familyRotateOne = await live.at(familyRotateOneNow, (repo) => repo.rotateSession({ currentCredential: familyIssue.credential, operationId: randomUUID(), now: familyRotateOneNow }));
    assert.equal(familyRotateOne.kind, "rotated");
    const familyRotateTwoNow = new Date();
    const familyRotateTwo = await live.at(familyRotateTwoNow, (repo) => repo.rotateSession({ currentCredential: familyRotateOne.credential, operationId: randomUUID(), now: familyRotateTwoNow }));
    await scenario("family rotation history", async () => assert.equal(familyRotateTwo.kind, "rotated"));
    assert.equal(familyRotateTwo.kind, "rotated");
    const familyRevokeNow = new Date();
    const familyRevoked = await live.at(familyRevokeNow, (repo) => repo.revokeSessionFamily({ credential: familyRotateTwo.credential, reason: "security", now: familyRevokeNow }));
    await scenario("family revocation", async () => {
      assert.equal(familyRevoked.kind, "family_revoked");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE family_id='${familyIssue.session.familyId}' AND revoked_at IS NULL;`), "0");
    });
    const familyAgain = await live.at(new Date(), (repo) => repo.revokeSessionFamily({ credential: familyRotateTwo.credential, reason: "security", now: liveTime(live) }));
    await scenario("family revocation idempotency", async () => assert.equal(familyAgain.kind, "family_revoked"));

    const membershipRevokeIssueNow = new Date();
    const membershipRevokeIssue = await live.at(membershipRevokeIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: membershipRevokeIssueNow }));
    assert.equal(membershipRevokeIssue.kind, "issued");
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked',updated_at=clock_timestamp() WHERE id='${membershipA}'; RESET ROLE;`);
    const membershipRevokeNow = new Date();
    const revokedWithoutMembership = await live.at(membershipRevokeNow, (repo) => repo.revokeSession({ credential: membershipRevokeIssue.credential, reason: "security", now: membershipRevokeNow }));
    await scenario("revocation after membership becomes inactive", async () => assert.equal(revokedWithoutMembership.kind, "revoked"));
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='active',updated_at=clock_timestamp() WHERE id='${membershipA}'; RESET ROLE;`);
    const membershipRestoredResolve = await live.at(new Date(), (repo) => repo.resolveSession({ credential: membershipRevokeIssue.credential, requestId: "request-membership-restored", now: liveTime(live) }));
    await scenario("membership restoration cannot reactivate", async () => assert.equal(membershipRestoredResolve.kind, "unauthenticated"));

    const storeRevokeIssueNow = new Date();
    const storeRevokeIssue = await live.at(storeRevokeIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: storeRevokeIssueNow }));
    assert.equal(storeRevokeIssue.kind, "issued");
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended',updated_at=clock_timestamp() WHERE id='${storeA}'; RESET ROLE;`);
    const storeRevokeNow = new Date();
    const revokedWithoutStore = await live.at(storeRevokeNow, (repo) => repo.revokeSession({ credential: storeRevokeIssue.credential, reason: "administrative", now: storeRevokeNow }));
    await scenario("revocation after store becomes inactive", async () => assert.equal(revokedWithoutStore.kind, "revoked"));
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='active',updated_at=clock_timestamp() WHERE id='${storeA}'; RESET ROLE;`);
    const storeRestoredResolve = await live.at(new Date(), (repo) => repo.resolveSession({ credential: storeRevokeIssue.credential, requestId: "request-store-restored", now: liveTime(live) }));
    await scenario("store restoration cannot reactivate", async () => assert.equal(storeRestoredResolve.kind, "unauthenticated"));

    const predecessorIssueNow = new Date();
    const predecessorIssue = await live.at(predecessorIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: predecessorIssueNow }));
    assert.equal(predecessorIssue.kind, "issued");
    const predecessorRotateNow = new Date();
    const predecessorRotation = await live.at(predecessorRotateNow, (repo) => repo.rotateSession({ currentCredential: predecessorIssue.credential, operationId: randomUUID(), now: predecessorRotateNow }));
    assert.equal(predecessorRotation.kind, "rotated");
    const predecessorFamilyNow = new Date();
    const predecessorFamilyRevoked = await live.at(predecessorFamilyNow, (repo) => repo.revokeSessionFamily({ credential: predecessorIssue.credential, reason: "security", now: predecessorFamilyNow }));
    await scenario("rotation-revoked predecessor revokes active family", async () => {
      assert.equal(predecessorFamilyRevoked.kind, "family_revoked");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE family_id='${predecessorIssue.session.familyId}' AND revoked_at IS NULL;`), "0");
    });

    const familyWinsIssueNow = new Date();
    const familyWinsIssue = await live.at(familyWinsIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: familyWinsIssueNow }));
    assert.equal(familyWinsIssue.kind, "issued");
    const familyWinsClient = await concurrencyPoolA.connect();
    let familyWinsCommitted = false;
    try {
      const proof = credentialProof(familyWinsIssue.credential);
      const revokeNow = new Date();
      await familyWinsClient.query("BEGIN");
      await familyWinsClient.query("SET LOCAL ROLE celebix_saas_identity");
      await familyWinsClient.query(
        "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text,$2::bigint))",
        [familyWinsIssue.session.familyId, familyLockSeed],
      );
      const revokeResult = await familyWinsClient.query(
        "SELECT outcome FROM saas.revoke_panel_session_family($1,$2,$3,$4)",
        [proof.tokenKeyId, proof.tokenDigest, "security", revokeNow],
      );
      assert.equal(revokeResult.rows[0]?.outcome, "family_revoked");
      const familyWinsRotationEnv = repository(concurrencyPoolB, { seed: 121 });
      const familyWinsRotation = familyWinsRotationEnv.at(revokeNow, (repo) => repo.rotateSession({ currentCredential: familyWinsIssue.credential, operationId: randomUUID(), now: revokeNow }));
      await assertPending(familyWinsRotation);
      await familyWinsClient.query("COMMIT");
      familyWinsCommitted = true;
      const rotationResult = await familyWinsRotation;
      await scenario("family revocation wins rotation race", async () => assert.equal(rotationResult.kind, "unauthenticated"));
    } finally {
      if (!familyWinsCommitted) await familyWinsClient.query("ROLLBACK").catch(() => undefined);
      familyWinsClient.release();
    }
    await scenario("family-revocation winner leaves zero active family rows", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE family_id='${familyWinsIssue.session.familyId}' AND revoked_at IS NULL;`), "0");
    });

    const rotationWinsIssueNow = new Date();
    const rotationWinsIssue = await live.at(rotationWinsIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: rotationWinsIssueNow }));
    assert.equal(rotationWinsIssue.kind, "issued");
    const rotationWinsClient = await concurrencyPoolA.connect();
    let rotationWinsCommitted = false;
    const rotationWinsCredential = deterministicCredential(0x73);
    try {
      const previousProof = credentialProof(rotationWinsIssue.credential);
      const replacementProof = credentialProof(rotationWinsCredential);
      const rotationNow = new Date();
      await rotationWinsClient.query("BEGIN");
      await rotationWinsClient.query("SET LOCAL ROLE celebix_saas_identity");
      const directRotation = await rotationWinsClient.query(
        "SELECT outcome FROM saas.rotate_panel_session($1,$2,$3,$4,$5,$6,$7,$8)",
        [previousProof.tokenKeyId, previousProof.tokenDigest, randomUUID(), randomUUID(), replacementProof.tokenKeyId, replacementProof.tokenDigest, null, rotationNow],
      );
      assert.equal(directRotation.rows[0]?.outcome, "rotated");
      const rotationWinsFamilyEnv = repository(concurrencyPoolB, { seed: 122 });
      const familyRevocation = rotationWinsFamilyEnv.at(rotationNow, (repo) => repo.revokeSessionFamily({ credential: rotationWinsIssue.credential, reason: "security", now: rotationNow }));
      await assertPending(familyRevocation);
      await rotationWinsClient.query("COMMIT");
      rotationWinsCommitted = true;
      const familyResult = await familyRevocation;
      await scenario("rotation wins then family revocation discovers replacement", async () => assert.equal(familyResult.kind, "family_revoked"));
    } finally {
      if (!rotationWinsCommitted) await rotationWinsClient.query("ROLLBACK").catch(() => undefined);
      rotationWinsClient.release();
    }
    await scenario("rotation winner is removed by family revocation", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE family_id='${rotationWinsIssue.session.familyId}' AND revoked_at IS NULL;`), "0");
      const resolvedReplacement = await live.at(new Date(), (repo) => repo.resolveSession({ credential: rotationWinsCredential, requestId: "request-race-replacement", now: liveTime(live) }));
      assert.equal(resolvedReplacement.kind, "unauthenticated");
    });

    const cleanupNow = new Date();
    for (let index = 0; index < 3; index += 1) {
      const digest = createHash("sha256").update(`cleanup-${index}`).digest("hex");
      psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.panel_sessions (
        session_id,family_id,operation_id,operation_kind,token_key_id,token_digest,principal_id,active_store_id,
        previous_session_id,replaced_by_session_id,version,issued_at,rotated_at,expires_at,revoked_at,revocation_reason,created_at,updated_at
      ) VALUES (
        '${randomUUID()}','${randomUUID()}','${randomUUID()}','issue','cleanup.v1','${digest}','${principalA}','${storeA}',
        NULL,NULL,1,'${new Date(cleanupNow.getTime() - 7 * 60 * 60_000).toISOString()}',
        '${new Date(cleanupNow.getTime() - 7 * 60 * 60_000).toISOString()}',
        '${new Date(cleanupNow.getTime() - 60 * 60_000).toISOString()}',NULL,NULL,
        '${new Date(cleanupNow.getTime() - 7 * 60 * 60_000).toISOString()}',
        '${new Date(cleanupNow.getTime() - 7 * 60 * 60_000).toISOString()}'); RESET ROLE;`);
    }
    const cleanup = repository(workloadPool, { cleanupLimit: 2 });
    const cleanupFirst = await cleanup.at(cleanupNow, (repo) => repo.expireDueSessions({ now: cleanupNow }));
    await scenario("bounded cleanup exact limit", async () => assert.deepEqual(cleanupFirst, { kind: "expired", count: 2 }));
    const cleanupSecondNow = new Date();
    const cleanupSecond = await cleanup.at(cleanupSecondNow, (repo) => repo.expireDueSessions({ now: cleanupSecondNow }));
    await scenario("bounded cleanup remainder", async () => assert.deepEqual(cleanupSecond, { kind: "expired", count: 1 }));
    const cleanupThirdNow = new Date();
    const cleanupThird = await cleanup.at(cleanupThirdNow, (repo) => repo.expireDueSessions({ now: cleanupThirdNow }));
    await scenario("cleanup idempotency", async () => assert.deepEqual(cleanupThird, { kind: "expired", count: 0 }));

    const unknownIssueNow = new Date();
    const unknownIssueOperation = randomUUID();
    const unknownIssueEnv = repository(workloadPool, { seed: 70, commitUnknown: true });
    const unknownIssue = await unknownIssueEnv.at(unknownIssueNow, (repo) => repo.issueSession({ operationId: unknownIssueOperation, principalId: principalA, activeStoreId: storeA, now: unknownIssueNow }));
    await scenario("issue unknown COMMIT", async () => assert.equal(unknownIssue.kind, "commit_unknown"));
    assert.equal(unknownIssue.kind, "commit_unknown");
    const issueRecovery = await live.instance.recoverOperation({ operationId: unknownIssueOperation, operationKind: "issue", credential: unknownIssue.credential, principalId: principalA, activeStoreId: storeA });
    await scenario("issue read-only recovery", async () => assert.equal(issueRecovery.kind, "operation_replayed"));

    const unknownRotationBaseNow = new Date();
    const unknownRotationBaseEnv = repository(workloadPool, { seed: 80 });
    const unknownRotationBase = await unknownRotationBaseEnv.at(unknownRotationBaseNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: unknownRotationBaseNow }));
    assert.equal(unknownRotationBase.kind, "issued");
    const unknownRotationNow = new Date();
    const unknownRotationOperation = randomUUID();
    const unknownRotationEnv = repository(workloadPool, { seed: 81, commitUnknown: true });
    const unknownRotation = await unknownRotationEnv.at(unknownRotationNow, (repo) => repo.rotateSession({ currentCredential: unknownRotationBase.credential, operationId: unknownRotationOperation, requestedStoreId: storeA, now: unknownRotationNow }));
    await scenario("rotation unknown COMMIT", async () => assert.equal(unknownRotation.kind, "commit_unknown"));
    assert.equal(unknownRotation.kind, "commit_unknown");
    const rotationRecovery = await live.instance.recoverOperation({ operationId: unknownRotationOperation, operationKind: "rotate", credential: unknownRotation.credential, currentCredential: unknownRotationBase.credential, requestedStoreId: storeA });
    await scenario("rotation read-only recovery with requested store", async () => assert.equal(rotationRecovery.kind, "operation_replayed"));
    const wrongStoreRecovery = await live.instance.recoverOperation({ operationId: unknownRotationOperation, operationKind: "rotate", credential: unknownRotation.credential, currentCredential: unknownRotationBase.credential, requestedStoreId: storeB });
    await scenario("rotation recovery rejects wrong requested store", async () => assert.equal(wrongStoreRecovery.kind, "operation_mismatch"));

    const inheritedRotationBaseNow = new Date();
    const inheritedRotationBaseEnv = repository(workloadPool, { seed: 82 });
    const inheritedRotationBase = await inheritedRotationBaseEnv.at(inheritedRotationBaseNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: inheritedRotationBaseNow }));
    assert.equal(inheritedRotationBase.kind, "issued");
    const inheritedRotationNow = new Date();
    const inheritedRotationOperation = randomUUID();
    const inheritedRotationEnv = repository(workloadPool, { seed: 83, commitUnknown: true });
    const inheritedRotation = await inheritedRotationEnv.at(inheritedRotationNow, (repo) => repo.rotateSession({ currentCredential: inheritedRotationBase.credential, operationId: inheritedRotationOperation, now: inheritedRotationNow }));
    assert.equal(inheritedRotation.kind, "commit_unknown");
    const inheritedRecovery = await live.instance.recoverOperation({ operationId: inheritedRotationOperation, operationKind: "rotate", credential: inheritedRotation.credential, currentCredential: inheritedRotationBase.credential });
    await scenario("rotation recovery inherits previous active store", async () => assert.equal(inheritedRecovery.kind, "operation_replayed"));

    const restoreIssueNow = new Date();
    const restoreIssue = await live.at(restoreIssueNow, (repo) => repo.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: restoreIssueNow }));
    assert.equal(restoreIssue.kind, "issued");
    const secondInstance = repository(workloadPool);
    const instanceA = await live.at(new Date(), (repo) => repo.resolveSession({ credential: restoreIssue.credential, requestId: "request-instance-a", now: liveTime(live) }));
    const instanceB = await secondInstance.at(new Date(), (repo) => repo.resolveSession({ credential: restoreIssue.credential, requestId: "request-instance-b", now: liveTime(secondInstance) }));
    await scenario("multi-instance consistency", async () => assert.deepEqual([instanceA.kind, instanceB.kind], ["resolved", "resolved"]));

    const dump = dumpDatabase(backend, primaryDatabase);
    psql(backend, `CREATE DATABASE ${restoreDatabase}; CREATE DATABASE ${rollbackDatabase};`, "postgres");
    restoreDatabaseDump(backend, restoreDatabase, dump);
    restoreDatabaseDump(backend, rollbackDatabase, dump);
    restorePool = pool(backend, restoreDatabase);
    const restoredRepository = repository(restorePool);
    const restoredValid = await restoredRepository.at(new Date(), (repo) => repo.resolveSession({ credential: restoreIssue.credential, requestId: "request-restored-valid", now: liveTime(restoredRepository) }));
    const restoredRevoked = await restoredRepository.at(new Date(), (repo) => repo.resolveSession({ credential: revokeIssue.credential, requestId: "request-restored-revoked", now: liveTime(restoredRepository) }));
    await scenario("backup and restore authority", async () => assert.deepEqual([restoredValid.kind, restoredRevoked.kind], ["resolved", "unauthenticated"]));
    migration(backend, "202607140015_panel_sessions.down.sql", rollbackDatabase);
    await scenario("rollback 015 preserves 001 through 014", async () => {
      assert.equal(psql(backend, "SELECT to_regclass('saas.panel_sessions') IS NULL;", rollbackDatabase), "t");
      assert.equal(psql(backend, "SELECT to_regclass('saas.principals') IS NOT NULL AND to_regclass('saas.registration_verified_identities') IS NOT NULL;", rollbackDatabase), "t");
    });
    migration(backend, "202607140015_panel_sessions.up.sql", rollbackDatabase);
    await scenario("reapply 015 and catalog equality", async () => {
      const catalog = (database) => psql(backend, "SELECT string_agg(column_name || ':' || data_type, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='panel_sessions';", database);
      assert.equal(catalog(rollbackDatabase), catalog(primaryDatabase));
      assert.equal(psql(backend, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE '%panel_session%';", rollbackDatabase), psql(backend, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE '%panel_session%';", primaryDatabase));
    });
  } finally {
    await restorePool?.end().catch(() => undefined);
    await concurrencyPoolB?.end().catch(() => undefined);
    await concurrencyPoolA?.end().catch(() => undefined);
    await workloadPool?.end().catch(() => undefined);
    if (backend) {
      try {
        psql(backend, `REVOKE celebix_saas_identity FROM ${workloadRole}; DROP ROLE IF EXISTS ${workloadRole};`, "postgres", { allowFailure: true });
      } finally {
        stopPostgres(backend);
        scenarios += 1;
        evidence.push("roles databases sockets and temporary files removed");
      }
    }
  }
  assert.equal(scenarios, 73, evidence.join("\n"));
  return { status: "PASS", backend: backend.kind === "native" ? "native-postgresql" : backend.engine, postgresqlVersion: 16, scenarios, externalNetworkAttempts: 0, productionConnectionUsed: false, rollback: "PASS", reapply: "PASS", backupRestore: "PASS", concurrency: "PASS", cleanup: "PASS", rawCredentialScan: "PASS", roleGrants: "PASS" };
}

function liveTime(environment) {
  const value = new Date();
  environment.setNow?.(value);
  return value;
}

run().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
