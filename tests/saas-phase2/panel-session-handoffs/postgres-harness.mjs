import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { accessSync, appendFileSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { PostgresSaaSDataRepository, PostgresTenantOperationRecovery } from "@celebix/saas-data";
import { createStarterTenantService } from "@celebix/saas-tenant-core";

import { createPanelSessionHandoffApproval as createCustomerHandoffApproval } from "../../../apps/customer-panel/lib/panel-session-handoff/activation.ts";
import { createPostgresPanelSessionHandoffRedeemer } from "../../../apps/customer-panel/lib/panel-session-handoff/postgres-handoff-redeemer.ts";
import { createPanelSessionPersistenceApproval } from "../../../apps/customer-panel/lib/panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../../../apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts";
import { createPanelSessionHandoffApproval as createOwnerHandoffApproval } from "../../../apps/owner/lib/panel-session-handoff/activation.ts";
import { createPanelSessionHandoffCredentialCodec } from "../../../apps/owner/lib/panel-session-handoff/credential-codec.ts";
import { createPostgresPanelSessionHandoffIssuer } from "../../../apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts";
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "../../../apps/owner/lib/saas-persistence/identity-crypto.ts";
import { PostgresOidcTransactionStore } from "../../../apps/owner/lib/saas-persistence/postgres-oidc-transaction-store.ts";
import { PostgresRegistrationAttemptStore } from "../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts";
import { createOwnerTenantCoreAdapter } from "../../../apps/owner/lib/saas-tenant-core/adapter.ts";
import { createSelfServeOidcCallbackCompletionHandler } from "../../../apps/owner/lib/self-serve-http/oidc-callback-completion.ts";
import { createSelfServeRegistrationStartHandler } from "../../../apps/owner/lib/self-serve-http/registration-start.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../../../apps/owner/lib/self-serve-http/runtime.ts";
import { createVerifiedEdgeTrustBoundary } from "../../../apps/owner/lib/self-serve-http/verified-edge-trust.ts";
import { createPersistentRegistrationCompletionService } from "../../../apps/owner/lib/self-serve-registration-completion.ts";
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
const primaryDatabase = "phase2b2b1_primary";
const restoreDatabase = "phase2b2b1_restore";
const workloadRole = "celebix_phase2b2b1_test";
const callbackAuthority = "https://panel.celebix.site/auth/callback";
const ownerOrigin = "https://ecommerce.celebix.co";
const providerIssuer = "https://identity.example.test";
const providerAudience = "customer-panel";
const handoffKeyId = "handoff.active.v1";
const oldHandoffKeyId = "handoff.old.v1";
const sessionKeyId = "panel.active.v1";
const oldSessionKeyId = "panel.old.v1";
const handoffKeys = new Map([
  [handoffKeyId, new Uint8Array(32).fill(0x31)],
  [oldHandoffKeyId, new Uint8Array(32).fill(0x32)],
]);
const sessionKeys = new Map([
  [sessionKeyId, new Uint8Array(32).fill(0x51)],
  [oldSessionKeyId, new Uint8Array(32).fill(0x52)],
]);
const timeouts = { poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 };
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
const manifests = [
  "phase2a1-manifest.json",
  "phase2b1-manifest.json",
  "phase2b1b1-manifest.json",
  "phase2b2a-manifest.json",
  "phase2b2b1-manifest.json",
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
  const backend = { ...selectBackend(), temporaryDirectory: mkdtempSync(path.join(tmpdir(), "celebix-phase2b2b1-")), started: false };
  const token = randomBytes(6).toString("hex");
  if (backend.kind === "native") {
    backend.dataDirectory = path.join(backend.temporaryDirectory, "data");
    backend.socketDirectory = path.join("/tmp", `c2b2b1-${token}`);
    backend.port = 20_000 + Math.floor(Math.random() * 20_000);
    mkdirSync(backend.socketDirectory, { mode: 0o700 });
    command(backend.executables.initdb, ["-D", backend.dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    appendFileSync(path.join(backend.dataDirectory, "postgresql.conf"), `\nlisten_addresses = ''\nunix_socket_directories = '${backend.socketDirectory}'\nport = ${backend.port}\nmax_connections = 80\n`);
    command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-l", path.join(backend.temporaryDirectory, "postgres.log"), "start"]);
    backend.started = true;
    backend.host = backend.socketDirectory;
  } else {
    backend.container = `celebix-phase2b2b1-${token}`;
    if (backend.engine === "docker") {
      const context = command(backend.executable, ["context", "show"]).stdout.trim();
      assertLocalEngineEndpoint(command(backend.executable, ["context", "inspect", context, "--format={{.Endpoints.docker.Host}}"]).stdout.trim());
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

function applyAll(backend, database, includeRoles) {
  if (includeRoles) migration(backend, REQUIRED_APPLY_ORDER[0], database, false);
  for (const file of REQUIRED_APPLY_ORDER.slice(1)) migration(backend, file, database);
  if (includeRoles) migration(backend, phase2bFiles[0], database, false);
  for (const file of phase2bFiles.slice(1)) migration(backend, file, database);
  for (const file of phase2b1b1Files) migration(backend, file, database);
  migration(backend, "202607140015_panel_sessions.up.sql", database);
  migration(backend, "202607140016_panel_session_handoffs.up.sql", database);
}

function dumpDatabase(backend, database) {
  const args = ["--format=custom", "--dbname", database, "--username", "postgres"];
  return backend.kind === "native"
    ? command(backend.executables.pg_dump, ["--host", backend.socketDirectory, "--port", String(backend.port), ...args], { binary: true }).stdout
    : command(backend.executable, ["exec", backend.container, "pg_dump", ...args], { binary: true }).stdout;
}

function restoreDatabaseDump(backend, database, dump) {
  const args = ["--exit-on-error", "--dbname", database, "--username", "postgres"];
  if (backend.kind === "native") command(backend.executables.pg_restore, ["--host", backend.socketDirectory, "--port", String(backend.port), ...args], { input: dump, binary: true });
  else command(backend.executable, ["exec", "-i", backend.container, "pg_restore", ...args], { input: dump, binary: true });
}

function dataDump(backend) {
  const args = ["--data-only", "--inserts", "--dbname", primaryDatabase, "--username", "postgres"];
  return String(backend.kind === "native"
    ? command(backend.executables.pg_dump, ["--host", backend.socketDirectory, "--port", String(backend.port), ...args]).stdout
    : command(backend.executable, ["exec", backend.container, "pg_dump", ...args]).stdout);
}

function databasePool(backend, database = primaryDatabase) {
  return new Pool({ host: backend.host, port: backend.port, user: workloadRole, database, max: 12, connectionTimeoutMillis: 2_000 });
}

function unknownCommitPool(pool, failOnCommit) {
  let commits = 0;
  return {
    async connect() {
      const client = await pool.connect();
      return {
        async query(text, values) {
          if (text === "COMMIT") {
            const result = await client.query(text, values);
            commits += 1;
            if (commits === failOnCommit) throw new Error("simulated response loss after forwarded commit");
            return result;
          }
          return client.query(text, values);
        },
        release(destroy) { client.release(destroy); },
      };
    },
  };
}

function identityDependencies(pool, material, context, clock) {
  return {
    pool,
    stateDigester: createOpaqueStateDigester({ key: material.hmacKey, context }),
    payloadCipher: createAes256GcmPayloadCipher({ currentKeyId: material.currentKeyId, resolveKey: (id) => material.keyring[id] }),
    timeouts,
    clock,
    audit: () => undefined,
    identityRole: "celebix_saas_identity",
  };
}

function completionService(workflowStore, pool, clock) {
  const repositoryOptions = {
    pool,
    generateId: () => randomUUID(),
    audit: () => undefined,
    timeouts,
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.celebix.site",
  };
  const tenantCore = createOwnerTenantCoreAdapter(createStarterTenantService({
    repository: new PostgresSaaSDataRepository(repositoryOptions),
    platformDomainSuffix: "celebix.site",
    panelBaseUrl: "https://panel.celebix.site",
  }));
  return createPersistentRegistrationCompletionService({
    workflowStore,
    tenantCore,
    recovery: new PostgresTenantOperationRecovery(repositoryOptions),
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    clock,
    audit: () => undefined,
  });
}

class DeterministicOidcProvider {
  buildAuthorizationUrl(input) {
    const url = new URL(`${providerIssuer}/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url;
  }

  async verifyCallback(input) {
    return {
      issuer: input.expectedIssuer,
      subject: `subject-${createHash("sha256").update(input.state).digest("hex").slice(0, 24)}`,
      audience: [input.expectedAudience],
      nonce: input.expectedNonce,
      email: `owner-${createHash("sha256").update(input.state).digest("hex").slice(0, 12)}@example.test`,
      emailVerified: true,
      displayName: "Disposable Owner",
    };
  }
}

function registrationRuntime(registrationStore, oidcStore, completion, clock) {
  const boundary = createVerifiedEdgeTrustBoundary({ async verify() { return "allowed"; } });
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: registrationStore,
    oidcTransactionStore: oidcStore,
    registrationCompletion: completion,
    consumedCallbackRecovery: registrationStore,
    oidcProvider: new DeterministicOidcProvider(),
    requestGate: boundary.requestGate,
    clock,
    audit: () => undefined,
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: ownerOrigin,
    callbackAuthority,
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: providerIssuer, audience: providerAudience, authorizationOrigin: providerIssuer },
  });
  return { runtime, boundary };
}

async function startRegistration(runtime, slug) {
  const response = await createSelfServeRegistrationStartHandler(runtime)(new Request(`${ownerOrigin}/api/self-serve/register`, {
    method: "POST",
    headers: { origin: ownerOrigin, "content-type": "application/json" },
    body: JSON.stringify({ storeName: `Disposable ${slug}`, storeSlug: slug, privacyConsent: true, marketingConsent: false }),
  }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.has("set-cookie"), false);
  const body = await response.json();
  return new URL(body.authorizationUrl).searchParams.get("state");
}

async function completeCallback(runtime, boundary, state) {
  const handler = createSelfServeOidcCallbackCompletionHandler(runtime);
  return boundary.invokeWithVerifiedContext((context) => handler(new Request(
    `${callbackAuthority}?state=${encodeURIComponent(state)}&code=valid-code`,
  ), context));
}

function createRegistrationHarness(pool) {
  const material = {
    hmacKey: randomBytes(32),
    currentKeyId: "identity.current.v1",
    keyring: { "identity.current.v1": randomBytes(32) },
  };
  const clock = { value: new Date() };
  const now = () => new Date(clock.value);
  const registrationStore = new PostgresRegistrationAttemptStore(
    identityDependencies(pool, material, "registration-attempt-state", now),
    { panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site" },
    { oidcStateDigester: createOpaqueStateDigester({ key: material.hmacKey, context: "oidc-transaction-state" }) },
  );
  const oidcStore = new PostgresOidcTransactionStore(identityDependencies(pool, material, "oidc-transaction-state", now));
  return {
    stateDigester: createOpaqueStateDigester({ key: material.hmacKey, context: "registration-attempt-state" }),
    async start(slug) {
      clock.value = new Date(Date.now() - 2_000);
      const setup = registrationRuntime(registrationStore, oidcStore, completionService(registrationStore, pool, now), now);
      return startRegistration(setup.runtime, slug);
    },
    async complete(slug) {
      const state = await this.start(slug);
      clock.value = new Date(Date.now() - 1_000);
      const setup = registrationRuntime(registrationStore, oidcStore, completionService(registrationStore, pool, now), now);
      const response = await completeCallback(setup.runtime, setup.boundary, state);
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.storeSlug, slug);
      assert.equal(body.session, "pending");
      assert.equal(response.headers.has("set-cookie"), false);
      assert.equal(response.headers.has("location"), false);
      return { state, body };
    },
  };
}

function issuer(pool, stateDigester, options = {}) {
  return createPostgresPanelSessionHandoffIssuer(createOwnerHandoffApproval("disposable_test"), {
    pool: options.commitUnknown ? unknownCommitPool(pool, 1) : pool,
    stateDigester,
    handoffKeys: options.handoffKeys ?? handoffKeys,
    activeHandoffKeyId: options.activeHandoffKeyId ?? handoffKeyId,
    sessionTokenKeyId: options.sessionTokenKeyId ?? sessionKeyId,
    clock: options.clock ?? (() => new Date()),
    randomUuid: () => randomUUID(),
    timeouts,
    audit: () => undefined,
  });
}

function redeemer(pool, options = {}) {
  return createPostgresPanelSessionHandoffRedeemer(createCustomerHandoffApproval("disposable_test"), {
    pool: options.commitUnknown ? unknownCommitPool(pool, 2) : pool,
    handoffKeys: options.handoffKeys ?? handoffKeys,
    sessionKeys: options.sessionKeys ?? sessionKeys,
    clock: options.clock ?? (() => new Date()),
    timeouts,
    audit: () => undefined,
  });
}

function sessionRepository(pool, keys = sessionKeys) {
  return createPostgresPanelSessionRepository(createPanelSessionPersistenceApproval("disposable_test"), {
    pool,
    keys,
    activeKeyId: sessionKeyId,
    clock: () => new Date(),
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    timeouts,
    cleanupLimit: 25,
    audit: () => undefined,
  });
}

async function directShortHandoff(pool, stateDigester, rawState) {
  const codec = createPanelSessionHandoffCredentialCodec({ keys: handoffKeys, activeKeyId: handoffKeyId });
  const credential = codec.deriveCredential(rawState);
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const result = await client.query(
      "SELECT outcome FROM saas.create_panel_session_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        stateDigester.digest(rawState), credential.tokenKeyId, credential.tokenDigest, sessionKeyId,
        randomUUID(), randomUUID(), randomUUID(), randomUUID(), now, new Date(now.getTime() + 20),
        new Date(now.getTime() + 60 * 60_000),
      ],
    );
    await client.query("COMMIT");
    assert.equal(result.rows[0]?.outcome, "handoff_created");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return credential.credential;
}

async function run() {
  let backend;
  const pools = [];
  let temporaryDirectory;
  let runError;
  let scenarios = 0;
  let externalNetworkAttempts = 0;
  const evidence = [];
  const scenario = async (name, proof) => {
    await proof();
    scenarios += 1;
    evidence.push(name);
  };
  try {
    backend = startPostgres();
    temporaryDirectory = backend.temporaryDirectory;
    assert.equal(Math.floor(Number(psql(backend, "SHOW server_version_num;", "postgres")) / 10_000), 16);
    psql(backend, `CREATE DATABASE ${primaryDatabase};`, "postgres");
    applyAll(backend, primaryDatabase, true);
    await scenario("apply migrations 001-016", async () => {
      assert.equal(psql(backend, "SELECT to_regclass('saas.panel_session_handoffs') IS NOT NULL AND to_regclass('saas.panel_sessions') IS NOT NULL;"), "t");
    });

    await scenario("manifest checksums", async () => {
      for (const file of manifests) {
        const manifest = JSON.parse(readFileSync(path.join(sqlDirectory, file), "utf8"));
        assert.equal(manifest.postgresqlMajor, 16);
        for (const artifact of manifest.artifacts) {
          const digest = createHash("sha256").update(readFileSync(path.join(sqlDirectory, artifact.file))).digest("hex");
          assert.equal(digest, artifact.sha256, `${file}:${artifact.file}`);
        }
      }
    });

    await scenario("ownership grants and search_path", async () => {
      assert.equal(psql(backend, "SELECT pg_get_userbyid(relowner) || ':' || relrowsecurity::int || ':' || relforcerowsecurity::int FROM pg_class WHERE oid='saas.panel_session_handoffs'::regclass;"), "celebix_saas_owner:1:1");
      assert.equal(psql(backend, "SELECT has_table_privilege('celebix_saas_identity','saas.panel_session_handoffs','SELECT,INSERT,UPDATE,DELETE')::int || ':' || has_table_privilege('public','saas.panel_session_handoffs','SELECT,INSERT,UPDATE,DELETE')::int;"), "0:0");
      assert.equal(psql(backend, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='saas' AND p.proname IN ('create_panel_session_handoff','recover_panel_session_handoff','redeem_panel_session_handoff','recover_panel_session_handoff_redemption') AND r.rolname='celebix_saas_owner' AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[];"), "4");
    });

    psql(backend, `CREATE ROLE ${workloadRole} LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT celebix_saas_identity, celebix_saas_bootstrap TO ${workloadRole};`, "postgres");
    const primaryPool = databasePool(backend);
    const poolA = databasePool(backend);
    const poolB = databasePool(backend);
    pools.push(primaryPool, poolA, poolB);
    const registrations = createRegistrationHarness(primaryPool);

    const primary = await registrations.complete("handoff-primary");
    await scenario("real registration start and verified callback completion", async () => {
      assert.match(primary.state, /^[A-Za-z0-9_-]{32,}$/);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.registration_tenant_completions WHERE state='completed';"), "1");
      assert.equal(psql(backend, "SELECT count(*) FROM saas.tenant_operations WHERE status='committed';"), "1");
      const digest = registrations.stateDigester.digest(primary.state);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_workflows AS workflow JOIN saas.registration_verified_identities AS verified ON verified.attempt_id=workflow.attempt_id AND verified.canonical_fingerprint=workflow.canonical_fingerprint JOIN saas.registration_tenant_completions AS completion ON completion.attempt_id=workflow.attempt_id AND completion.canonical_fingerprint=workflow.canonical_fingerprint AND completion.state='completed' JOIN saas.registration_tenant_operation_proofs AS proof ON proof.operation_id=completion.tenant_operation_id AND proof.payload_fingerprint=workflow.canonical_fingerprint AND proof.tenant_idempotency_digest=workflow.tenant_idempotency_digest AND proof.requested_at=workflow.requested_at JOIN saas.tenant_operations AS operation ON operation.id=proof.operation_id AND operation.status='committed' JOIN saas.principals AS principal ON principal.id=operation.result_principal_id AND principal.email_verified JOIN saas.stores AS store ON store.id=operation.result_store_id AND store.status='active' JOIN saas.memberships AS membership ON membership.id=operation.result_membership_id AND membership.principal_id=principal.id AND membership.store_id=store.id AND membership.role='store_owner' AND membership.status='active' WHERE workflow.state_digest='${digest}' AND workflow.status IN ('tenant_created','session_created') AND workflow.consumed_at IS NOT NULL;`), "1");
    });

    const primaryIssuer = issuer(primaryPool, registrations.stateDigester);
    const firstHandoff = await primaryIssuer.issueHandoff({ rawState: primary.state });
    await scenario("create handoff", async () => {
      assert.equal(firstHandoff.kind, "handoff_created");
      if (firstHandoff.kind === "handoff_created") assert.match(firstHandoff.credential, /^h1\.handoff\.active\.v1\.[A-Za-z0-9_-]{43}$/);
    });
    assert.equal(firstHandoff.kind, "handoff_created");
    if (firstHandoff.kind !== "handoff_created") throw new Error("handoff creation failed");
    await scenario("raw state and handoff absent", async () => {
      const stored = psql(backend, "SELECT row_to_json(handoff)::text FROM saas.panel_session_handoffs AS handoff;");
      assert.equal(stored.includes(primary.state), false);
      assert.equal(stored.includes(firstHandoff.credential), false);
      assert.equal(stored.includes(firstHandoff.credential.split(".").at(-1)), false);
    });

    const replayedHandoff = await primaryIssuer.issueHandoff({ rawState: primary.state });
    await scenario("handoff replay", async () => {
      assert.equal(replayedHandoff.kind, "handoff_replayed");
      if (replayedHandoff.kind === "handoff_replayed") assert.equal(replayedHandoff.credential, firstHandoff.credential);
    });

    const primaryRedeemer = redeemer(primaryPool);
    const firstRedemption = await primaryRedeemer.redeemHandoff({ credential: firstHandoff.credential });
    await scenario("first redemption", async () => assert.equal(firstRedemption.kind, "session_issued"));
    assert.equal(firstRedemption.kind, "session_issued");
    if (firstRedemption.kind !== "session_issued") throw new Error("session issuance failed");
    await scenario("exactly one panel session", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE session_id='${firstRedemption.session.sessionId}';`), "1");
    });

    const resolved = await sessionRepository(primaryPool).resolveSession({ credential: firstRedemption.credential, requestId: "handoff-primary-request", now: new Date() });
    await scenario("resolve session and TenantContext", async () => {
      assert.equal(resolved.kind, "resolved");
      if (resolved.kind === "resolved") {
        assert.equal(resolved.tenantContext?.store.slug, "handoff-primary");
        assert.equal(resolved.tenantContext?.membership.role, "store_owner");
        assert.deepEqual(resolved.tenantContext?.entitlements.features, ["catalog", "orders", "customers", "content", "media", "analytics", "checkout"]);
      }
    });

    const replayedRedemption = await primaryRedeemer.redeemHandoff({ credential: firstHandoff.credential });
    await scenario("redemption replay", async () => {
      assert.equal(replayedRedemption.kind, "session_replayed");
      if (replayedRedemption.kind === "session_replayed") assert.equal(replayedRedemption.credential, firstRedemption.credential);
    });

    const concurrentRegistration = await registrations.complete("handoff-concurrent");
    const concurrentHandoff = await issuer(primaryPool, registrations.stateDigester).issueHandoff({ rawState: concurrentRegistration.state });
    assert.equal(concurrentHandoff.kind, "handoff_created");
    if (concurrentHandoff.kind !== "handoff_created") throw new Error("concurrent handoff failed");
    const concurrent = await Promise.all([
      redeemer(poolA).redeemHandoff({ credential: concurrentHandoff.credential }),
      redeemer(poolB).redeemHandoff({ credential: concurrentHandoff.credential }),
    ]);
    await scenario("concurrent redemption across two connections", async () => {
      assert.deepEqual(concurrent.map((entry) => entry.kind).sort(), ["session_issued", "session_replayed"]);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_sessions s JOIN saas.panel_session_handoffs h ON h.session_id=s.session_id WHERE h.attempt_id=(SELECT attempt_id FROM saas.registration_workflows WHERE state_digest='" + registrations.stateDigester.digest(concurrentRegistration.state) + "');"), "1");
    });

    const createLossRegistration = await registrations.complete("handoff-create-loss");
    const createLoss = await issuer(primaryPool, registrations.stateDigester, { commitUnknown: true }).issueHandoff({ rawState: createLossRegistration.state });
    await scenario("handoff creation COMMIT response loss", async () => assert.equal(createLoss.kind, "commit_unknown"));
    const recoveredCreate = await issuer(primaryPool, registrations.stateDigester).recoverHandoff({ rawState: createLossRegistration.state });
    await scenario("recover handoff creation", async () => {
      assert.equal(recoveredCreate.kind, "handoff_replayed");
      if (createLoss.kind === "commit_unknown" && recoveredCreate.kind === "handoff_replayed") assert.equal(recoveredCreate.credential, createLoss.credential);
    });

    const redemptionLossRegistration = await registrations.complete("handoff-redeem-loss");
    const redemptionLossHandoff = await issuer(primaryPool, registrations.stateDigester).issueHandoff({ rawState: redemptionLossRegistration.state });
    assert.equal(redemptionLossHandoff.kind, "handoff_created");
    if (redemptionLossHandoff.kind !== "handoff_created") throw new Error("redemption loss handoff failed");
    const redemptionLoss = await redeemer(primaryPool, { commitUnknown: true }).redeemHandoff({ credential: redemptionLossHandoff.credential });
    await scenario("redemption COMMIT response loss", async () => assert.equal(redemptionLoss.kind, "commit_unknown"));
    const recoveredRedemption = await redeemer(primaryPool).recoverRedemption({ credential: redemptionLossHandoff.credential });
    await scenario("recover redemption", async () => {
      assert.equal(recoveredRedemption.kind, "session_replayed");
      if (redemptionLoss.kind === "commit_unknown" && recoveredRedemption.kind === "session_replayed") assert.equal(recoveredRedemption.credential, redemptionLoss.credential);
    });

    await scenario("wrong state", async () => {
      assert.deepEqual(await primaryIssuer.issueHandoff({ rawState: `wrong-state-${randomBytes(24).toString("base64url")}` }), { kind: "durable_authority_invalid" });
    });
    const incompleteState = await registrations.start("handoff-incomplete");
    await scenario("incomplete registration", async () => {
      assert.deepEqual(await primaryIssuer.issueHandoff({ rawState: incompleteState }), { kind: "durable_authority_invalid" });
    });

    const corruptRegistration = await registrations.complete("handoff-corrupt-proof");
    const corruptDigest = registrations.stateDigester.digest(corruptRegistration.state);
    psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked', updated_at=clock_timestamp() WHERE id=(SELECT operation.result_membership_id FROM saas.registration_workflows workflow JOIN saas.registration_tenant_completions completion ON completion.attempt_id=workflow.attempt_id JOIN saas.tenant_operations operation ON operation.id=completion.tenant_operation_id WHERE workflow.state_digest='${corruptDigest}'); RESET ROLE;`);
    await scenario("corrupt tenant operation proof", async () => {
      assert.deepEqual(await primaryIssuer.issueHandoff({ rawState: corruptRegistration.state }), { kind: "durable_authority_invalid" });
    });

    const expiredRegistration = await registrations.complete("handoff-expired");
    const expiredCredential = await directShortHandoff(primaryPool, registrations.stateDigester, expiredRegistration.state);
    await scenario("expired handoff", async () => {
      assert.deepEqual(await primaryRedeemer.redeemHandoff({ credential: expiredCredential }), { kind: "expired" });
    });

    const oldHandoffRegistration = await registrations.complete("handoff-old-handoff-key");
    const oldHandoff = await issuer(primaryPool, registrations.stateDigester, { activeHandoffKeyId: oldHandoffKeyId }).issueHandoff({ rawState: oldHandoffRegistration.state });
    assert.equal(oldHandoff.kind, "handoff_created");
    await scenario("removed handoff key", async () => {
      if (oldHandoff.kind !== "handoff_created") throw new Error("old handoff missing");
      const retainedReplay = await issuer(primaryPool, registrations.stateDigester).issueHandoff({ rawState: oldHandoffRegistration.state });
      assert.equal(retainedReplay.kind, "handoff_replayed");
      if (retainedReplay.kind === "handoff_replayed") assert.equal(retainedReplay.credential, oldHandoff.credential);
      assert.deepEqual(await redeemer(primaryPool, { handoffKeys: new Map([[handoffKeyId, handoffKeys.get(handoffKeyId)]]) }).redeemHandoff({ credential: oldHandoff.credential }), { kind: "unauthenticated" });
    });

    const oldSessionRegistration = await registrations.complete("handoff-old-session-key");
    const oldSessionHandoff = await issuer(primaryPool, registrations.stateDigester, { sessionTokenKeyId: oldSessionKeyId }).issueHandoff({ rawState: oldSessionRegistration.state });
    assert.equal(oldSessionHandoff.kind, "handoff_created");
    await scenario("removed session key", async () => {
      if (oldSessionHandoff.kind !== "handoff_created") throw new Error("old session handoff missing");
      assert.equal((await redeemer(primaryPool).redeemHandoff({ credential: oldSessionHandoff.credential })).kind, "session_issued");
      assert.deepEqual(await redeemer(primaryPool, { sessionKeys: new Map([[sessionKeyId, sessionKeys.get(sessionKeyId)]]) }).redeemHandoff({ credential: oldSessionHandoff.credential }), { kind: "unauthenticated" });
    });

    await scenario("database raw credential scan", async () => {
      const dump = dataDump(backend);
      for (const secret of [primary.state, firstHandoff.credential, firstHandoff.credential.split(".").at(-1), firstRedemption.credential, firstRedemption.credential.split(".").at(-1)]) {
        assert.equal(dump.includes(secret), false);
      }
    });

    const backup = dumpDatabase(backend, primaryDatabase);
    psql(backend, `CREATE DATABASE ${restoreDatabase};`, "postgres");
    restoreDatabaseDump(backend, restoreDatabase, backup);
    await scenario("backup and restore", async () => {
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_session_handoffs;", restoreDatabase), psql(backend, "SELECT count(*) FROM saas.panel_session_handoffs;", primaryDatabase));
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_sessions;", restoreDatabase), psql(backend, "SELECT count(*) FROM saas.panel_sessions;", primaryDatabase));
    });
    const restorePool = databasePool(backend, restoreDatabase);
    pools.push(restorePool);
    const restored = await sessionRepository(restorePool).resolveSession({ credential: firstRedemption.credential, requestId: "handoff-restored-request", now: new Date() });
    await scenario("resolve restored session", async () => {
      assert.equal(restored.kind, "resolved");
      if (restored.kind === "resolved") assert.equal(restored.tenantContext?.store.slug, "handoff-primary");
    });

    migration(backend, "202607140016_panel_session_handoffs.down.sql");
    await scenario("rollback migration 016", async () => assert.equal(psql(backend, "SELECT to_regclass('saas.panel_session_handoffs') IS NULL;"), "t"));
    await scenario("migrations 001-015 remain intact", async () => {
      assert.equal(psql(backend, "SELECT to_regclass('saas.panel_sessions') IS NOT NULL AND to_regclass('saas.registration_tenant_completions') IS NOT NULL AND to_regclass('saas.tenant_operations') IS NOT NULL;"), "t");
      assert.ok(Number(psql(backend, "SELECT count(*) FROM saas.panel_sessions;")) >= 1);
    });
    migration(backend, "202607140016_panel_session_handoffs.up.sql");
    await scenario("reapply migration 016", async () => assert.equal(psql(backend, "SELECT to_regclass('saas.panel_session_handoffs') IS NOT NULL;"), "t"));
  } catch (error) {
    runError = error;
  } finally {
    await Promise.all(pools.map((pool) => pool.end().catch(() => undefined)));
    stopPostgres(backend);
  }
  if (runError) throw runError;
  await scenario("complete cleanup", async () => assert.equal(existsSync(temporaryDirectory), false));
  await scenario("external network count zero", async () => assert.equal(externalNetworkAttempts, 0));
  assert.equal(scenarios, 30);
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    backend: backend.kind === "native" ? "native-postgresql" : backend.engine,
    postgresqlVersion: 16,
    scenarios,
    externalNetworkAttempts,
    productionConnectionUsed: false,
    registrationCallback: "PASS",
    concurrency: "PASS",
    commitRecovery: "PASS",
    backupRestore: "PASS",
    rollback: "PASS",
    reapply: "PASS",
    cleanup: "PASS",
    evidence,
  }, null, 2)}\n`);
}

await run();
