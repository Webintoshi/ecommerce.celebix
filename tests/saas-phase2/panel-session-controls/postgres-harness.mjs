import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { accessSync, appendFileSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { createPanelSessionPersistenceApproval } from "../../../apps/customer-panel/lib/panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../../../apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts";
import { createApprovedStagingServerPanelAccessRuntime } from "../../../apps/customer-panel/lib/server-panel-access/runtime.ts";
import {
  createPanelActiveStoreHandler,
  createPanelSessionLogoutHandler,
} from "../../../apps/customer-panel/lib/server-panel-session-controls/handler.ts";
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
const database = "phase2b2c3b_controls";
const workloadRole = "celebix_phase2b2c3b_test";
const panelOrigin = "https://panel.saas-staging.celebix.site";
const keyId = "panel.controls.v1";
const key = new Uint8Array(32).fill(0x6b);
const principalA = "10000000-0000-4000-8000-000000000001";
const principalB = "10000000-0000-4000-8000-000000000002";
const storeA = "20000000-0000-4000-8000-000000000001";
const storeB = "20000000-0000-4000-8000-000000000002";
const storeForeign = "20000000-0000-4000-8000-000000000003";
const planId = "00000000-0000-4000-8000-000000000001";
const deletionCookie = "__Host-celebix_panel=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
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
  const backend = { ...selectBackend(), temporaryDirectory: mkdtempSync(path.join(tmpdir(), "celebix-phase2b2c3b-")), started: false };
  const token = randomBytes(6).toString("hex");
  if (backend.kind === "native") {
    backend.dataDirectory = path.join(backend.temporaryDirectory, "data");
    backend.socketDirectory = path.join("/tmp", `c2c3b-${token}`);
    backend.port = 20_000 + Math.floor(Math.random() * 20_000);
    mkdirSync(backend.socketDirectory, { mode: 0o700 });
    command(backend.executables.initdb, ["-D", backend.dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    appendFileSync(path.join(backend.dataDirectory, "postgresql.conf"), `\nlisten_addresses = ''\nunix_socket_directories = '${backend.socketDirectory}'\nport = ${backend.port}\nmax_connections = 40\n`);
    command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-l", path.join(backend.temporaryDirectory, "postgres.log"), "start"]);
    backend.started = true;
    backend.host = backend.socketDirectory;
  } else {
    backend.container = `celebix-phase2b2c3b-${token}`;
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

function psql(backend, source, target = database, options = {}) {
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target];
  const result = backend.kind === "native"
    ? command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), ...args], { input: source, ...options })
    : command(backend.executable, ["exec", "-i", backend.container, "psql", ...args], { input: source, ...options });
  return String(result.stdout ?? "").trim();
}

function migration(backend, file, asMigrator = true) {
  const source = readFileSync(path.join(sqlDirectory, file), "utf8");
  psql(backend, asMigrator ? `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${source}\nRESET SESSION AUTHORIZATION;` : source);
}

function applyMigrations(backend) {
  migration(backend, REQUIRED_APPLY_ORDER[0], false);
  for (const file of REQUIRED_APPLY_ORDER.slice(1)) migration(backend, file);
  migration(backend, phase2bFiles[0], false);
  for (const file of phase2bFiles.slice(1)) migration(backend, file);
  for (const file of phase2b1b1Files) migration(backend, file);
  migration(backend, "202607140015_panel_sessions.up.sql");
  migration(backend, "202607140016_panel_session_handoffs.up.sql");
  migration(backend, "202607140017_panel_browser_bindings.up.sql");
}

function postgresPool(backend) {
  return new Pool({ host: backend.host, port: backend.port, user: workloadRole, database, max: 12, connectionTimeoutMillis: 2_000 });
}

function oneShotUnknownCommitPool(databasePool) {
  let loseNextCommit = true;
  return {
    async connect() {
      const client = await databasePool.connect();
      return {
        async query(text, values) {
          if (text === "COMMIT" && loseNextCommit) {
            loseNextCommit = false;
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

function repository(pool, options = {}) {
  return createPostgresPanelSessionRepository(createPanelSessionPersistenceApproval("disposable_test"), {
    pool: options.commitUnknown ? oneShotUnknownCommitPool(pool) : pool,
    keys: new Map([[keyId, key]]),
    activeKeyId: keyId,
    clock: () => new Date(),
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    timeouts: { poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 },
    cleanupLimit: 25,
    audit: () => undefined,
  });
}

function request(pathname, credential, body, extraHeaders = {}) {
  const headers = new Headers({
    origin: panelOrigin,
    "content-type": "application/json",
    ...extraHeaders,
  });
  if (credential !== null) headers.set("cookie", `__Host-celebix_panel=${credential}`);
  return new Request(`http://customer-panel:3400${pathname}`, { method: "POST", headers, body });
}

function replacementCredential(response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header?.startsWith("__Host-celebix_panel="));
  assert.equal(header.includes("Domain="), false);
  const first = header.split(";", 1)[0];
  return first.slice("__Host-celebix_panel=".length);
}

async function run() {
  let backend;
  let pool;
  let scenarios = 0;
  const evidence = [];
  const scenario = async (name, proof) => {
    await proof();
    scenarios += 1;
    evidence.push(name);
  };
  try {
    backend = startPostgres();
    await scenario("isolated PostgreSQL 16", async () => {
      assert.equal(Math.floor(Number(psql(backend, "SHOW server_version_num;", "postgres")) / 10_000), 16);
    });
    psql(backend, `CREATE DATABASE ${database};`, "postgres");
    applyMigrations(backend);
    await scenario("migrations 001 through 017", async () => {
      assert.equal(psql(backend, "SELECT to_regclass('saas.panel_sessions') IS NOT NULL AND to_regclass('saas.panel_browser_bindings') IS NOT NULL;"), "t");
    });
    psql(backend, `CREATE ROLE ${workloadRole} LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT celebix_saas_identity TO ${workloadRole};`, "postgres");
    await scenario("workload has function-only authority", async () => {
      assert.equal(psql(backend, `SELECT has_table_privilege('${workloadRole}','saas.panel_sessions','INSERT,UPDATE,DELETE')::int || ':' || has_function_privilege('${workloadRole}','saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamp with time zone)','EXECUTE')::int || ':' || has_function_privilege('celebix_saas_identity','saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamp with time zone)','EXECUTE')::int;`), "0:0:1");
    });
    const seededAt = new Date().toISOString();
    psql(backend, `SET ROLE celebix_saas_owner;
      INSERT INTO saas.principals (id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
        ('${principalA}','https://identity.example.test/oidc','subject-a','a@example.test',true,'${seededAt}','${seededAt}'),
        ('${principalB}','https://identity.example.test/oidc','subject-b','b@example.test',true,'${seededAt}','${seededAt}');
      INSERT INTO saas.stores (id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${storeA}','Store A','store-a','active','tr','TRY','starter','${seededAt}','${seededAt}'),
        ('${storeB}','Store B','store-b','active','tr','TRY','starter','${seededAt}','${seededAt}'),
        ('${storeForeign}','Foreign Store','foreign-store','active','tr','TRY','starter','${seededAt}','${seededAt}');
      INSERT INTO saas.memberships (id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('30000000-0000-4000-8000-000000000001','${principalA}','${storeA}','store_owner','active','${seededAt}','${seededAt}'),
        ('30000000-0000-4000-8000-000000000002','${principalA}','${storeB}','store_owner','active','${seededAt}','${seededAt}'),
        ('30000000-0000-4000-8000-000000000003','${principalB}','${storeForeign}','store_owner','active','${seededAt}','${seededAt}');
      INSERT INTO saas.subscriptions (id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
        ('40000000-0000-4000-8000-000000000001','${storeA}','${planId}','free_starter',1,'active','${seededAt}',NULL,'${seededAt}','${seededAt}'),
        ('40000000-0000-4000-8000-000000000002','${storeB}','${planId}','free_starter',1,'active','${seededAt}',NULL,'${seededAt}','${seededAt}'),
        ('40000000-0000-4000-8000-000000000003','${storeForeign}','${planId}','free_starter',1,'active','${seededAt}',NULL,'${seededAt}','${seededAt}');
      RESET ROLE;`);
    await scenario("two same-principal stores and one foreign store", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM saas.memberships WHERE principal_id='${principalA}' AND status='active';`), "2");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.memberships WHERE principal_id='${principalB}' AND store_id='${storeForeign}';`), "1");
    });

    pool = postgresPool(backend);
    const durable = repository(pool);
    const runtime = createApprovedStagingServerPanelAccessRuntime(durable, panelOrigin);
    const initialNow = new Date();
    const issued = await durable.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: initialNow });
    assert.equal(issued.kind, "issued");
    const initialCredential = issued.credential;
    await scenario("initial durable TenantContext", async () => {
      const access = await runtime.resolveCredential({ credential: initialCredential, requestId: "controls-before", now: new Date() });
      assert.equal(access.kind, "authenticated");
      assert.equal(access.tenantContext.store.id, storeA);
    });
    const originalExpiry = issued.session.expiresAt;
    const activeStore = createPanelActiveStoreHandler({
      async resolveRuntime() { return runtime; },
      operationId: randomUUID,
      now: () => new Date(),
    });
    const rotatedResponse = await activeStore(request("/api/session/active-store", initialCredential, JSON.stringify({ storeId: storeB })));
    const rotatedCredential = replacementCredential(rotatedResponse);
    await scenario("active-store safe response and replacement cookie", async () => {
      assert.equal(rotatedResponse.status, 200);
      assert.deepEqual(await rotatedResponse.json(), { ok: true, activeStoreId: storeB });
      assert.notEqual(rotatedCredential, initialCredential);
    });
    await scenario("rotation preserves absolute expiry", async () => {
      assert.equal(psql(backend, `SELECT to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM saas.panel_sessions WHERE active_store_id='${storeB}' ORDER BY created_at DESC LIMIT 1;`), originalExpiry);
    });
    await scenario("old credential is unusable", async () => {
      assert.deepEqual(await runtime.resolveCredential({ credential: initialCredential, requestId: "controls-old", now: new Date() }), { kind: "unauthenticated" });
    });
    await scenario("rotated TenantContext selects the authorized store", async () => {
      const access = await runtime.resolveCredential({ credential: rotatedCredential, requestId: "controls-after", now: new Date() });
      assert.equal(access.kind, "authenticated");
      assert.equal(access.tenantContext.store.id, storeB);
      assert.equal(access.session.activeStoreId, storeB);
    });
    const beforeDenied = psql(backend, "SELECT count(*) FROM saas.panel_sessions;");
    const denied = await activeStore(request("/api/session/active-store", rotatedCredential, JSON.stringify({ storeId: storeForeign })));
    await scenario("foreign-store selection is denied without successor", async () => {
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("set-cookie"), null);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_sessions;"), beforeDenied);
    });
    const forged = await activeStore(request("/api/session/active-store", rotatedCredential, JSON.stringify({ storeId: storeA }), {
      origin: "https://wrong.example.test",
      forwarded: "host=panel.saas-staging.celebix.site;proto=https",
      "x-forwarded-host": "panel.saas-staging.celebix.site",
    }));
    await scenario("forged forwarded authority cannot rescue Origin", async () => {
      assert.equal(forged.status, 403);
      assert.equal(forged.headers.get("set-cookie"), null);
    });
    const ownerOnly = await activeStore(request("/api/session/active-store", null, JSON.stringify({ storeId: storeA }), {
      cookie: "sb-owner-auth-token=owner-only",
    }));
    await scenario("Owner cookie cannot rotate panel authority", async () => {
      assert.equal(ownerOnly.status, 401);
      assert.equal(ownerOnly.headers.get("set-cookie"), null);
    });

    const unknownBase = await durable.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: new Date() });
    assert.equal(unknownBase.kind, "issued");
    const unknownRuntime = createApprovedStagingServerPanelAccessRuntime(repository(pool, { commitUnknown: true }), panelOrigin);
    const unknownHandler = createPanelActiveStoreHandler({
      async resolveRuntime() { return unknownRuntime; },
      operationId: randomUUID,
      now: () => new Date(),
    });
    const recoveredResponse = await unknownHandler(request("/api/session/active-store", unknownBase.credential, JSON.stringify({ storeId: storeB })));
    const recoveredCredential = replacementCredential(recoveredResponse);
    await scenario("unknown COMMIT is proven by one read-only recovery", async () => {
      assert.equal(recoveredResponse.status, 200);
      const access = await runtime.resolveCredential({ credential: recoveredCredential, requestId: "controls-recovered", now: new Date() });
      assert.equal(access.kind, "authenticated");
      assert.equal(access.tenantContext.store.id, storeB);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE previous_session_id='${unknownBase.session.sessionId}';`), "1");
    });

    const concurrentBase = await durable.issueSession({ operationId: randomUUID(), principalId: principalA, activeStoreId: storeA, now: new Date() });
    assert.equal(concurrentBase.kind, "issued");
    const concurrentHandler = () => createPanelActiveStoreHandler({
      async resolveRuntime() { return runtime; }, operationId: randomUUID, now: () => new Date(),
    });
    const concurrent = await Promise.all([
      concurrentHandler()(request("/api/session/active-store", concurrentBase.credential, JSON.stringify({ storeId: storeB }))),
      concurrentHandler()(request("/api/session/active-store", concurrentBase.credential, JSON.stringify({ storeId: storeB }))),
    ]);
    await scenario("concurrent retry creates exactly one successor", async () => {
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 401]);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE previous_session_id='${concurrentBase.session.sessionId}';`), "1");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE family_id='${concurrentBase.session.familyId}' AND revoked_at IS NULL;`), "1");
    });

    const logout = createPanelSessionLogoutHandler({ async resolveRuntime() { return runtime; }, now: () => new Date() });
    const logoutResponse = await logout(request("/api/session/logout", rotatedCredential, "{}"));
    await scenario("current-session logout confirms revoke before deletion", async () => {
      assert.equal(logoutResponse.status, 204);
      assert.equal(logoutResponse.headers.get("set-cookie"), deletionCookie);
      assert.deepEqual(await runtime.resolveCredential({ credential: rotatedCredential, requestId: "controls-logged-out", now: new Date() }), { kind: "unauthenticated" });
    });
    const repeatedLogout = await logout(request("/api/session/logout", rotatedCredential, "{}"));
    await scenario("repeated logout is idempotent", async () => {
      assert.equal(repeatedLogout.status, 204);
      assert.equal(repeatedLogout.headers.get("set-cookie"), deletionCookie);
    });
    const rowCountBeforeMissing = psql(backend, "SELECT count(*) FROM saas.panel_sessions;");
    const missingLogout = await logout(request("/api/session/logout", null, "{}"));
    await scenario("missing-cookie logout performs no PostgreSQL mutation", async () => {
      assert.equal(missingLogout.status, 204);
      assert.equal(missingLogout.headers.get("set-cookie"), deletionCookie);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_sessions;"), rowCountBeforeMissing);
    });
    const ownerLogout = await logout(request("/api/session/logout", null, "{}", { cookie: "sb-owner-auth-token=owner-only" }));
    await scenario("Owner cookie cannot revoke panel authority", async () => {
      assert.equal(ownerLogout.status, 204);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_sessions;"), rowCountBeforeMissing);
    });
    await scenario("session families retain one-or-zero active-row invariant", async () => {
      assert.equal(psql(backend, "SELECT count(*) FROM (SELECT family_id FROM saas.panel_sessions GROUP BY family_id HAVING count(*) FILTER (WHERE revoked_at IS NULL) > 1) broken;"), "0");
    });
    await scenario("no external or production connection", async () => {
      assert.equal(backend.kind === "native" ? backend.host.startsWith("/tmp/") : backend.host, backend.kind === "native" ? true : "127.0.0.1");
    });
  } finally {
    await pool?.end().catch(() => undefined);
    if (backend) {
      try { psql(backend, `REVOKE celebix_saas_identity FROM ${workloadRole}; DROP ROLE IF EXISTS ${workloadRole};`, "postgres", { allowFailure: true }); }
      finally { stopPostgres(backend); scenarios += 1; evidence.push("roles sockets and temporary files removed"); }
    }
  }
  assert.equal(scenarios, 21, evidence.join("\n"));
  return Object.freeze({
    status: "PASS",
    backend: backend.kind === "native" ? "native-postgresql" : backend.engine,
    postgresqlVersion: 16,
    scenarios,
    rotation: "PASS",
    commitUnknownRecovery: "PASS",
    concurrency: "PASS",
    logout: "PASS",
    tenantContext: "PASS",
    externalNetworkAttempts: 0,
    productionConnectionUsed: false,
    cleanup: "PASS",
  });
}

run().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
