import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
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
import { createPanelSessionCompletionApproval } from "../../../apps/customer-panel/lib/panel-session-completion/activation.ts";
import { createPanelSessionCompletionHandler } from "../../../apps/customer-panel/lib/panel-session-completion/completion.ts";
import { createAuthenticatedPanelSessionCompletionTransport } from "../../../apps/customer-panel/lib/panel-session-completion/transport.ts";
import { createPanelBrowserBindingCredentialGenerator } from "../../../apps/customer-panel/lib/panel-browser-binding/credential-codec.ts";
import { createPanelBrowserBindingBootstrapApproval } from "../../../apps/customer-panel/lib/panel-browser-binding-bootstrap/activation.ts";
import { createPanelBrowserBindingBootstrapHandler } from "../../../apps/customer-panel/lib/panel-browser-binding-bootstrap/handler.ts";
import { createAuthenticatedPanelBrowserBindingTransport } from "../../../apps/customer-panel/lib/panel-browser-binding-bootstrap/transport.ts";
import { createPanelSessionPersistenceApproval } from "../../../apps/customer-panel/lib/panel-session-persistence/activation.ts";
import { createPanelSessionCredentialCodec } from "../../../apps/customer-panel/lib/panel-session-persistence/credential-codec.ts";
import { createPostgresPanelSessionRepository } from "../../../apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts";
import { createPanelSessionHandoffApproval as createOwnerHandoffApproval } from "../../../apps/owner/lib/panel-session-handoff/activation.ts";
import { createOwnerPanelSessionInitialCallbackHandler } from "../../../apps/owner/lib/panel-session-handoff/internal-callback-handler.ts";
import { createOwnerPanelSessionHandoffGatewayApproval, createOwnerPanelSessionHandoffInternalGateway } from "../../../apps/owner/lib/panel-session-handoff/internal-gateway.ts";
import { createPanelSessionHandoffCredentialCodec } from "../../../apps/owner/lib/panel-session-handoff/credential-codec.ts";
import { createInitialCallbackPanelSessionHandoffExecutor } from "../../../apps/owner/lib/panel-session-handoff/initial-callback-executor.ts";
import { createInitialVerifiedCallbackGrantBoundary, isActiveInitialVerifiedCallbackGrantForState } from "../../../apps/owner/lib/panel-session-handoff/initial-callback-grant.ts";
import { createPostgresPanelSessionHandoffIssuer } from "../../../apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts";
import { createPanelBrowserBindingAuthorityCodec } from "../../../apps/owner/lib/panel-browser-binding/credential-codec.ts";
import { createOwnerPanelBrowserBindingInternalGateway, createPanelBrowserBindingInternalGatewayApproval } from "../../../apps/owner/lib/panel-browser-binding/internal-gateway.ts";
import { createPostgresPanelBrowserBindingRepository } from "../../../apps/owner/lib/panel-browser-binding/postgres-repository.ts";
import { createPanelBrowserBindingRegistrationStartExecutor } from "../../../apps/owner/lib/panel-browser-binding/start-executor.ts";
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "../../../apps/owner/lib/saas-persistence/identity-crypto.ts";
import { PostgresOidcTransactionStore } from "../../../apps/owner/lib/saas-persistence/postgres-oidc-transaction-store.ts";
import { PostgresRegistrationAttemptStore } from "../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts";
import { createOwnerTenantCoreAdapter } from "../../../apps/owner/lib/saas-tenant-core/adapter.ts";
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
const ownerInternalEndpoint = `${ownerOrigin}/api/internal/self-serve/oidc-callback`;
const providerIssuer = "https://identity.example.test";
const providerAudience = "customer-panel";
const handoffKeyId = "handoff.active.v1";
const oldHandoffKeyId = "handoff.old.v1";
const sessionKeyId = "panel.active.v1";
const oldSessionKeyId = "panel.old.v1";
const internalCallbackKeyId = "callback.active.v1";
const internalCallbackSecret = new Uint8Array(32).fill(0x63);
const browserBootstrapKeyId = "browser.bootstrap.v1";
const browserBindingKeyId = "browser.binding.v1";
const browserInternalKeyId = "browser.internal.v1";
const browserInternalSecret = new Uint8Array(32).fill(0x64);
const browserInternalEndpoint = `${ownerOrigin}/api/internal/self-serve/browser-binding`;
const preAuthDeletionCookie = "__Host-celebix_panel_pre_auth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
const connectionEvidence = { externalNetworkAttempts: 0, productionConnectionAttempts: 0 };
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
  "phase2b2b2a1-manifest.json",
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
  migration(backend, "202607140017_panel_browser_bindings.up.sql", database);
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
  const local = backend.kind === "native"
    ? backend.host === backend.socketDirectory && path.isAbsolute(backend.socketDirectory)
    : backend.host === "127.0.0.1";
  if (!local) {
    connectionEvidence.externalNetworkAttempts += 1;
    connectionEvidence.productionConnectionAttempts += 1;
    throw new Error("disposable PostgreSQL must remain local");
  }
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

class PausedOidcProvider extends DeterministicOidcProvider {
  constructor() {
    super();
    this.captured = undefined;
    this.started = new Promise((resolve) => { this.announceStarted = resolve; });
    this.waitForRelease = new Promise((resolve) => { this.releaseProvider = resolve; });
  }

  async verifyCallback(input) {
    this.captured = Object.freeze({ state: input.state, code: input.code });
    this.announceStarted();
    await this.waitForRelease;
    return super.verifyCallback(input);
  }

  release() {
    this.releaseProvider();
  }
}

function registrationRuntime(registrationStore, oidcStore, completion, clock, provider = new DeterministicOidcProvider()) {
  const boundary = createVerifiedEdgeTrustBoundary({ async verify() { return "allowed"; } });
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: registrationStore,
    oidcTransactionStore: oidcStore,
    registrationCompletion: completion,
    consumedCallbackRecovery: registrationStore,
    oidcProvider: provider,
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

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function bootstrapDiagnosticPool(pool, diagnostic) {
  return Object.freeze({
    async connect() {
      const client = await pool.connect();
      return Object.freeze({
        async query(text, values) {
          if (!text.includes("saas.create_panel_browser_bootstrap")) return client.query(text, values);
          try {
            const result = await client.query(text, values);
            diagnostic.sql = typeof result.rows[0]?.outcome === "string" ? result.rows[0].outcome : "projection_mismatch";
            diagnostic.sqlObserved?.resolve();
            return result;
          } catch (error) {
            const code = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "UNKNOWN";
            diagnostic.sql = `SQLSTATE_${code}`;
            diagnostic.sqlObserved?.resolve();
            throw error;
          }
        },
        release(destroy) { client.release(destroy); },
      });
    },
  });
}

function safeBootstrapFailure(scenarioName, repositoryKind, sqlOutcome) {
  return new Error(`bootstrap scenario failed: ${scenarioName} repository=${repositoryKind} sql=${sqlOutcome}`);
}

function createRegistrationHarness(pool) {
  const material = {
    hmacKey: randomBytes(32),
    currentKeyId: "identity.current.v1",
    keyring: { "identity.current.v1": randomBytes(32) },
  };
  const clock = { value: new Date() };
  const now = () => new Date(clock.value);
  const registrationStateDigester = createOpaqueStateDigester({ key: material.hmacKey, context: "registration-attempt-state" });
  const oidcStateDigester = createOpaqueStateDigester({ key: material.hmacKey, context: "oidc-transaction-state" });
  const registrationStore = new PostgresRegistrationAttemptStore(
    identityDependencies(pool, material, "registration-attempt-state", now),
    { panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site" },
    { oidcStateDigester },
  );
  const oidcStore = new PostgresOidcTransactionStore(identityDependencies(pool, material, "oidc-transaction-state", now));
  const browserCredentialCodec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([[browserBootstrapKeyId, randomBytes(32)]]),
    activeBootstrapKeyId: browserBootstrapKeyId,
    browserBindingKeys: new Map([[browserBindingKeyId, randomBytes(32)]]),
    activeBrowserBindingKeyId: browserBindingKeyId,
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
  });
  const bootstrapDiagnostic = { repository: "not_executed", sql: "SQL_NOT_EXECUTED", sqlObserved: undefined };
  const browserBindingRepository = createPostgresPanelBrowserBindingRepository({
    pool: bootstrapDiagnosticPool(pool, bootstrapDiagnostic),
    stateDigester: registrationStateDigester,
    oidcStateDigester,
    credentialCodec: browserCredentialCodec,
    clock: now,
    timeouts,
    audit: () => undefined,
  });
  const executeStart = (runtime, repository) => createPanelBrowserBindingRegistrationStartExecutor({
    runtime,
    stateDigester: registrationStateDigester,
    credentialCodec: browserCredentialCodec,
    repository,
    panelBootstrapAuthority: "https://panel.celebix.site/auth/bootstrap",
    clock: now,
    randomUuid: () => randomUUID(),
    audit: () => undefined,
  });
  const finish = async (started, slug, options = {}) => {
    const state = new URL(started.providerAuthorizationUrl).searchParams.get("state");
    assert.ok(state);
    clock.value = new Date(Date.now() - 1_000);
    const ownerBrowserGateway = createOwnerPanelBrowserBindingInternalGateway({
      activationApproval: createPanelBrowserBindingInternalGatewayApproval("disposable_test"),
      ownerInternalOrigin: ownerOrigin,
      keys: new Map([[browserInternalKeyId, browserInternalSecret]]),
      clock: now,
      maximumBodyBytes: 16_384,
      repository: browserBindingRepository,
      audit: () => undefined,
    });
    const browserTransport = createAuthenticatedPanelBrowserBindingTransport({
      activationApproval: createPanelBrowserBindingBootstrapApproval("disposable_test"),
      ownerInternalOrigin: ownerOrigin,
      activeKeyId: browserInternalKeyId,
      activeSecret: browserInternalSecret,
      fetch: async (request) => withResponseUrl(await ownerBrowserGateway(request), browserInternalEndpoint),
      clock: now,
      deadlineMs: 2_000,
      maximumResponseBytes: 16_384,
      audit: () => undefined,
    });
    const browserBootstrap = createPanelBrowserBindingBootstrapHandler({
      activationApproval: createPanelBrowserBindingBootstrapApproval("disposable_test"),
      sourceOrigin: ownerOrigin,
      publicBootstrapAuthority: "https://panel.celebix.site/auth/bootstrap",
      maximumBodyBytes: 16_384,
      credentialGenerator: createPanelBrowserBindingCredentialGenerator(
        (size) => new Uint8Array(randomBytes(size)),
      ),
      transport: browserTransport,
      clock: now,
      audit: () => undefined,
    });
    const bootstrapResponse = await browserBootstrap(new Request("https://panel.celebix.site/auth/bootstrap", {
      method: "POST",
      headers: { origin: ownerOrigin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        bootstrapCredential: started.bootstrapCredential,
        providerAuthorizationUrl: started.providerAuthorizationUrl,
      }),
    }));
    assert.equal(bootstrapResponse.status, 303);
    assert.equal(bootstrapResponse.headers.get("location"), started.providerAuthorizationUrl);
    const preAuthCookie = bootstrapResponse.headers.getSetCookie()[0];
    const bindingMatch = preAuthCookie?.match(/^__Host-celebix_panel_pre_auth=(pb1\.[A-Za-z0-9_-]{43});/);
    assert.ok(bindingMatch);
    const browserBindingCredential = bindingMatch[1];
    const setup = registrationRuntime(registrationStore, oidcStore, completionService(registrationStore, pool, now), now, options.provider);
    const grantBoundary = createInitialVerifiedCallbackGrantBoundary(setup.runtime);
    return {
      state, slug, runtime: setup.runtime, edgeBoundary: setup.boundary, grantBoundary,
      bootstrapCredential: started.bootstrapCredential,
      providerAuthorizationUrl: started.providerAuthorizationUrl,
      browserBindingCredential,
      bootstrapResponse,
    };
  };
  return {
    stateDigester: registrationStateDigester,
    oidcStateDigester,
    browserCredentialCodec,
    browserBindingRepository,
    bootstrapDiagnostic,
    async start(slug, clockOffsetMs = -2_000) {
      clock.value = new Date(Date.now() + clockOffsetMs);
      const setup = registrationRuntime(registrationStore, oidcStore, completionService(registrationStore, pool, now), now);
      return startRegistration(setup.runtime, slug);
    },
    async stage(slug) {
      clock.value = new Date(Date.now() - 2_000);
      const setup = registrationRuntime(registrationStore, oidcStore, completionService(registrationStore, pool, now), now);
      const ready = deferred();
      const release = deferred();
      const repositoryObserved = deferred();
      const sqlObserved = deferred();
      let capturedInput;
      bootstrapDiagnostic.repository = "pending";
      bootstrapDiagnostic.sql = "SQL_NOT_EXECUTED";
      bootstrapDiagnostic.sqlObserved = sqlObserved;
      const startPromise = executeStart(setup.runtime, {
        async createBootstrap(input) {
          capturedInput = input;
          ready.resolve();
          await release.promise;
          try {
            const result = await browserBindingRepository.createBootstrap(input);
            bootstrapDiagnostic.repository = result.kind;
            if (bootstrapDiagnostic.sql === "SQL_NOT_EXECUTED") sqlObserved.resolve();
            repositoryObserved.resolve(result);
            return result;
          } catch {
            const result = Object.freeze({ kind: "unavailable" });
            bootstrapDiagnostic.repository = result.kind;
            if (bootstrapDiagnostic.sql === "SQL_NOT_EXECUTED") sqlObserved.resolve();
            repositoryObserved.resolve(result);
            throw new Error("bootstrap_unavailable");
          }
        },
      }).execute({
        storeName: `Disposable ${slug}`,
        storeSlug: slug,
        privacyConsent: true,
        marketingConsent: false,
      });
      const settledStart = startPromise.then(
        (value) => ({ ok: true, value }),
        () => ({ ok: false }),
      );
      await ready.promise;
      return Object.freeze({
        get input() { return capturedInput; },
        releaseBootstrap() { release.resolve(); },
        waitForSql: () => sqlObserved.promise,
        waitForRepository: () => repositoryObserved.promise,
        waitForStart: () => settledStart,
      });
    },
    finish,
    async complete(slug, options = {}) {
      clock.value = new Date(Date.now() - 2_000);
      const startSetup = registrationRuntime(registrationStore, oidcStore, completionService(registrationStore, pool, now), now);
      const started = await executeStart(startSetup.runtime, browserBindingRepository).execute({
        storeName: `Disposable ${slug}`,
        storeSlug: slug,
        privacyConsent: true,
        marketingConsent: false,
      });
      return finish(started, slug, options);
    },
  };
}

function issuer(pool, stateDigester, initialCallbackGrantBoundary, options = {}) {
  return createPostgresPanelSessionHandoffIssuer(createOwnerHandoffApproval("disposable_test"), {
    pool: options.commitUnknown ? unknownCommitPool(pool, 1) : pool,
    stateDigester,
    handoffKeys: options.handoffKeys ?? handoffKeys,
    activeHandoffKeyId: options.activeHandoffKeyId ?? handoffKeyId,
    sessionTokenKeyId: options.sessionTokenKeyId ?? sessionKeyId,
    clock: options.clock ?? (() => new Date()),
    randomBytes: options.randomBytes ?? ((size) => new Uint8Array(randomBytes(size))),
    randomUuid: options.randomUuid ?? (() => randomUUID()),
    timeouts,
    audit: options.audit ?? (() => undefined),
    initialCallbackGrantBoundary,
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

function withResponseUrl(response, url = ownerInternalEndpoint) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

function sessionCompletionPipeline(pool, registrations, registration, options = {}) {
  const audit = [];
  let issuerCalls = 0;
  let fetchCalls = 0;
  let redemptionCalls = 0;
  let recoveryCalls = 0;
  let lastInternalResult;
  const ownerIssuer = issuer(pool, registrations.stateDigester, registration.grantBoundary, {
    audit(event) { issuerCalls += 1; audit.push(Object.freeze({ component: "issuer", ...event })); },
  });
  const ownerHandler = createOwnerPanelSessionInitialCallbackHandler({
    runtime: registration.runtime,
    edgeTrustBoundary: registration.edgeBoundary,
    initialCallbackGrantBoundary: registration.grantBoundary,
    issuer: ownerIssuer,
    browserBindingRepository: registrations.browserBindingRepository,
    clock: () => new Date(),
    audit(event) { audit.push(Object.freeze({ component: "owner_handler", ...event })); },
  });
  const ownerGateway = createOwnerPanelSessionHandoffInternalGateway({
    activationApproval: createOwnerPanelSessionHandoffGatewayApproval("disposable_test"),
    ownerInternalOrigin: ownerOrigin,
    keys: new Map([[internalCallbackKeyId, internalCallbackSecret]]),
    clock: () => new Date(),
    maximumBodyBytes: 4_096,
    edgeTrustBoundary: registration.edgeBoundary,
    callbackHandler: ownerHandler,
    audit(event) { audit.push(Object.freeze({ component: "owner_gateway", ...event })); },
  });
  const injectedFetch = async (request) => {
    fetchCalls += 1;
    const response = await ownerGateway(request);
    if (response.headers.has("x-celebix-session-response-signature")) {
      try { lastInternalResult = Object.freeze(await response.clone().json()); } catch { /* tamper cases are intentionally invalid */ }
    }
    if (options.loseOwnerResponse) throw new Error("simulated Owner response loss");
    if (options.tamper === "body") {
      const body = await response.text();
      return withResponseUrl(new Response(body.replace("handoff.active", "handoff.tampered"), { status: response.status, headers: response.headers }));
    }
    if (options.tamper === "status") {
      return withResponseUrl(new Response(await response.text(), { status: 409, headers: response.headers }));
    }
    if (options.tamper === "headers") {
      const headers = new Headers(response.headers);
      headers.set("x-celebix-session-response-timestamp", String(Date.now() + 1));
      return withResponseUrl(new Response(await response.text(), { status: response.status, headers }));
    }
    return withResponseUrl(response);
  };
  const transport = createAuthenticatedPanelSessionCompletionTransport({
    activationApproval: createPanelSessionCompletionApproval("disposable_test"),
    ownerInternalOrigin: ownerOrigin,
    activeKeyId: internalCallbackKeyId,
    activeSecret: internalCallbackSecret,
    fetch: injectedFetch,
    clock: () => new Date(),
    deadlineMs: 2_000,
    maximumResponseBytes: 4_096,
    audit(event) { audit.push(Object.freeze({ component: "customer_transport", ...event })); },
  });
  const durableRedeemer = redeemer(pool, { commitUnknown: options.redemptionCommitUnknown === true });
  const trackedRedeemer = Object.freeze({
    async redeemHandoff(input) { redemptionCalls += 1; return durableRedeemer.redeemHandoff(input); },
    async recoverRedemption(input) { recoveryCalls += 1; return durableRedeemer.recoverRedemption(input); },
  });
  const handler = createPanelSessionCompletionHandler({
    activationApproval: createPanelSessionCompletionApproval("disposable_test"),
    publicCallbackAuthority: callbackAuthority,
    maximumQueryBytes: 2_048,
    transport,
    redeemer: trackedRedeemer,
    clock: () => new Date(),
    audit(event) { audit.push(Object.freeze({ component: "customer_completion", ...event })); },
  });
  return {
    handler,
    trackedRedeemer,
    audit,
    get issuerCalls() { return issuerCalls; },
    get fetchCalls() { return fetchCalls; },
    get redemptionCalls() { return redemptionCalls; },
    get recoveryCalls() { return recoveryCalls; },
    get lastInternalResult() { return lastInternalResult; },
  };
}

function browserCallback(registration, query = `state=${encodeURIComponent(registration.state)}&code=valid-code`, credential = registration.browserBindingCredential) {
  return new Request(`${callbackAuthority}?${query}`, {
    headers: credential ? { cookie: `__Host-celebix_panel_pre_auth=${credential}` } : undefined,
  });
}

function cookieCredential(response) {
  const persistent = response.headers.getSetCookie().find((cookie) => cookie.startsWith("__Host-celebix_panel="));
  const match = persistent?.match(/^__Host-celebix_panel=([^;]+);/);
  assert.ok(match);
  return match[1];
}

function persistentCookieCount(response) {
  return response.headers.getSetCookie().filter((cookie) => cookie.startsWith("__Host-celebix_panel=")).length;
}

async function directHandoff(pool, stateDigester, rawState, options = {}) {
  const codec = createPanelSessionHandoffCredentialCodec({
    keys: handoffKeys,
    activeKeyId: handoffKeyId,
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
  });
  const credential = codec.generateCredential();
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const result = await client.query(
      "SELECT outcome FROM saas.create_panel_session_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        stateDigester.digest(rawState), credential.tokenKeyId, credential.tokenDigest, sessionKeyId,
        randomUUID(), randomUUID(), randomUUID(), randomUUID(), now,
        new Date(now.getTime() + (options.handoffMs ?? 10 * 60_000)),
        new Date(now.getTime() + (options.sessionMs ?? 8 * 60 * 60_000)),
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
  return credential.credential;
}

async function executeVerifiedCallback(registration, work) {
  return registration.grantBoundary.executeInitialCallback(
    { state: registration.state, code: "valid-code" },
    (grant, completion) => work(grant, completion),
  );
}

function sessionProof(credential) {
  return createPanelSessionCredentialCodec({
    keys: sessionKeys,
    activeKeyId: sessionKeyId,
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
  }).digestCredential(credential);
}

async function identityQuery(pool, text, values = []) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const result = await client.query(text, values);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function directBootstrapOutcome(pool, stateDigest, oidcStateDigest, issuedAt = new Date(), expiresAt = new Date(Date.now() + 60_000)) {
  const result = await identityQuery(
    pool,
    "SELECT outcome, authority FROM saas.create_panel_browser_bootstrap($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      stateDigest,
      oidcStateDigest,
      "disposable.bootstrap.v1",
      randomBytes(32).toString("hex"),
      randomBytes(32).toString("hex"),
      randomUUID(),
      issuedAt,
      expiresAt,
    ],
  );
  return result.rows[0]?.outcome;
}

async function run() {
  let backend;
  const pools = [];
  let temporaryDirectory;
  let runError;
  let scenarios = 0;
  connectionEvidence.externalNetworkAttempts = 0;
  connectionEvidence.productionConnectionAttempts = 0;
  const evidence = [];
  const scenario = async (name, proof) => {
    await proof();
    scenarios += 1;
    evidence.push(name);
  };
  try {
    let primaryPool;
    let poolA;
    let poolB;
    let registrations;
    let stagedBootstrap;
    let stagedRepositoryResult;
    let startedBootstrap;
    let completionRegistration;
    await scenario("bootstrap 1 PostgreSQL 16 and migrations 001-017 are applied", async () => {
      backend = startPostgres();
      temporaryDirectory = backend.temporaryDirectory;
      assert.equal(Math.floor(Number(psql(backend, "SHOW server_version_num;", "postgres")) / 10_000), 16);
      psql(backend, `CREATE DATABASE ${primaryDatabase};`, "postgres");
      applyAll(backend, primaryDatabase, true);
      assert.equal(psql(backend, "SELECT to_regclass('saas.panel_browser_bindings') IS NOT NULL;"), "t");
      psql(backend, `CREATE ROLE ${workloadRole} LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT celebix_saas_identity, celebix_saas_bootstrap TO ${workloadRole};`, "postgres");
      primaryPool = databasePool(backend);
      poolA = databasePool(backend);
      poolB = databasePool(backend);
      pools.push(primaryPool, poolA, poolB);
      registrations = createRegistrationHarness(primaryPool);
    });
    await scenario("bootstrap 2 manifest checksums are verified", async () => {
      const manifest = JSON.parse(readFileSync(path.join(sqlDirectory, "phase2b2b2a1-manifest.json"), "utf8"));
      assert.equal(manifest.postgresqlMajor, 16);
      assert.equal(manifest.artifacts.length, 2);
      for (const artifact of manifest.artifacts) {
        const actual = createHash("sha256").update(readFileSync(path.join(sqlDirectory, artifact.file))).digest("hex");
        assert.equal(actual, artifact.sha256);
      }
    });
    await scenario("bootstrap 3 registration and OIDC authorities are created", async () => {
      stagedBootstrap = await registrations.stage("session-completion-primary");
      const stateDigest = registrations.stateDigester.digest(stagedBootstrap.input.rawState);
      const oidcDigest = registrations.oidcStateDigester.digest(stagedBootstrap.input.rawState);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_workflows WHERE state_digest='${stateDigest}' AND status='awaiting_identity' AND consumed_at IS NULL AND terminal_at IS NULL;`), "1");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.oidc_transactions WHERE state_digest='${oidcDigest}' AND status='active' AND consumed_at IS NULL AND discarded_at IS NULL;`), "1");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.registration_workflows workflow JOIN saas.oidc_transactions oidc ON oidc.state_digest='${oidcDigest}' WHERE workflow.state_digest='${stateDigest}' AND '${stagedBootstrap.input.issuedAt.toISOString()}'::timestamptz < workflow.expires_at AND '${stagedBootstrap.input.issuedAt.toISOString()}'::timestamptz < oidc.expires_at AND '${stagedBootstrap.input.expiresAt.toISOString()}'::timestamptz <= workflow.expires_at AND '${stagedBootstrap.input.expiresAt.toISOString()}'::timestamptz <= oidc.expires_at;`), "1");
      assert.equal(psql(backend, "SELECT has_schema_privilege('celebix_saas_identity','saas','USAGE') AND has_function_privilege('celebix_saas_identity','saas.create_panel_browser_bootstrap(text,text,text,text,text,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE');"), "t");
      const missingDigest = randomBytes(32).toString("hex");
      assert.equal(await directBootstrapOutcome(primaryPool, missingDigest, oidcDigest), "durable_authority_invalid");
      assert.equal(await directBootstrapOutcome(primaryPool, stateDigest, missingDigest), "durable_authority_invalid");
      const authority = async (slug, offset = -2_000) => {
        const state = await registrations.start(slug, offset);
        return {
          stateDigest: registrations.stateDigester.digest(state),
          oidcDigest: registrations.oidcStateDigester.digest(state),
        };
      };
      const discarded = await authority("bootstrap-proof-oidc-discarded");
      psql(backend, `UPDATE saas.oidc_transactions SET status='discarded', discarded_at=clock_timestamp(), updated_at=clock_timestamp() WHERE state_digest='${discarded.oidcDigest}';`);
      assert.equal(await directBootstrapOutcome(primaryPool, discarded.stateDigest, discarded.oidcDigest), "durable_authority_invalid");
      const consumedOidc = await authority("bootstrap-proof-oidc-consumed");
      psql(backend, `UPDATE saas.oidc_transactions SET status='consumed', consumed_at=clock_timestamp(), updated_at=clock_timestamp() WHERE state_digest='${consumedOidc.oidcDigest}';`);
      assert.equal(await directBootstrapOutcome(primaryPool, consumedOidc.stateDigest, consumedOidc.oidcDigest), "durable_authority_invalid");
      const consumedWorkflow = await authority("bootstrap-proof-workflow-consumed");
      psql(backend, `UPDATE saas.registration_workflows SET consumed_at=clock_timestamp(), updated_at=clock_timestamp() WHERE state_digest='${consumedWorkflow.stateDigest}';`);
      assert.equal(await directBootstrapOutcome(primaryPool, consumedWorkflow.stateDigest, consumedWorkflow.oidcDigest), "durable_authority_invalid");
      const expiredWorkflow = await authority("bootstrap-proof-workflow-expired");
      psql(backend, `UPDATE saas.registration_workflows SET status='expired', version=version+1, terminal_at=clock_timestamp(), updated_at=clock_timestamp() WHERE state_digest='${expiredWorkflow.stateDigest}';`);
      assert.equal(await directBootstrapOutcome(primaryPool, expiredWorkflow.stateDigest, expiredWorkflow.oidcDigest), "durable_authority_invalid");
      const expiredOidc = await authority("bootstrap-proof-oidc-expired");
      psql(backend, `UPDATE saas.oidc_transactions SET status='expired', consumed_at=clock_timestamp(), updated_at=clock_timestamp() WHERE state_digest='${expiredOidc.oidcDigest}';`);
      assert.equal(await directBootstrapOutcome(primaryPool, expiredOidc.stateDigest, expiredOidc.oidcDigest), "durable_authority_invalid");
      const expiringAuthority = await authority("bootstrap-proof-expiry-bound", -6 * 60_000);
      const issuedAt = new Date();
      assert.equal(
        await directBootstrapOutcome(primaryPool, expiringAuthority.stateDigest, expiringAuthority.oidcDigest, issuedAt, new Date(issuedAt.getTime() + 5 * 60_000)),
        "durable_authority_invalid",
      );
    });
    await scenario("bootstrap 4 SQL function returns browser_bootstrap_created", async () => {
      stagedBootstrap.releaseBootstrap();
      await stagedBootstrap.waitForSql();
      stagedRepositoryResult = await stagedBootstrap.waitForRepository();
      if (registrations.bootstrapDiagnostic.sql !== "browser_bootstrap_created") {
        throw safeBootstrapFailure("bootstrap_sql", stagedRepositoryResult.kind, registrations.bootstrapDiagnostic.sql);
      }
      assert.equal(registrations.bootstrapDiagnostic.sql, "browser_bootstrap_created");
    });
    await scenario("bootstrap 5 repository projection accepts the exact authority", async () => {
      const settled = await stagedBootstrap.waitForStart();
      if (stagedRepositoryResult.kind !== "browser_bootstrap_created" || !settled.ok) {
        throw safeBootstrapFailure("repository_projection", stagedRepositoryResult.kind, registrations.bootstrapDiagnostic.sql);
      }
      startedBootstrap = settled.value;
      assert.equal(stagedRepositoryResult.expiresAt, stagedBootstrap.input.expiresAt.toISOString());
      assert.equal(startedBootstrap.bootstrapExpiresAt, stagedRepositoryResult.expiresAt);
    });
    await scenario("bootstrap 6 panel browser binding completes", async () => {
      completionRegistration = await registrations.finish(startedBootstrap, "session-completion-primary");
      const digest = registrations.stateDigester.digest(completionRegistration.state);
      const oidcDigest = registrations.oidcStateDigester.digest(completionRegistration.state);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_browser_bindings WHERE state_digest='${digest}' AND oidc_state_digest='${oidcDigest}' AND version=2;`), "1");
      const dump = dataDump(backend);
      assert.equal(dump.includes(completionRegistration.bootstrapCredential), false);
      assert.equal(dump.includes(completionRegistration.browserBindingCredential), false);
      assert.equal(dump.includes(completionRegistration.providerAuthorizationUrl), false);
      const expected = createHash("sha256").update(completionRegistration.providerAuthorizationUrl, "utf8").digest("hex");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_browser_bindings WHERE authorization_url_digest='${expected}';`), "1");
      assert.equal(completionRegistration.bootstrapResponse.status, 303);
    });
    const completion = sessionCompletionPipeline(primaryPool, registrations, completionRegistration);
    let completionResponse;
    let completionSessionCredential;
    let completionHandoffCredential;
    let completionResolution;
    await scenario("completion 1 full callback pipeline returns HTTP 303", async () => {
      completionResponse = await completion.handler(browserCallback(completionRegistration));
      assert.equal(completionResponse.status, 303);
      assert.equal(await completionResponse.text(), "");
      assert.equal(completion.lastInternalResult.kind, "session_handoff_ready");
      completionHandoffCredential = completion.lastInternalResult.handoffCredential;
    });
    await scenario("browser binding 5 the successful callback advances exactly one row to claimed version 3", async () => {
      const digest = registrations.stateDigester.digest(completionRegistration.state);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_browser_bindings WHERE state_digest='${digest}' AND version=3 AND callback_claimed_at IS NOT NULL;`), "1");
      const rawStates = await Promise.all([
        registrations.start("cleanup-claimed-short"),
        registrations.start("cleanup-unclaimed-one"),
        registrations.start("cleanup-unclaimed-two"),
      ]);
      const issuedAt = new Date();
      const shortExpiry = new Date(issuedAt.getTime() + 5_000);
      const created = [];
      for (const [index, rawState] of rawStates.entries()) {
        const bootstrap = registrations.browserCredentialCodec.generateBootstrapCredential();
        const providerAuthorizationUrl = `https://identity.example.test/cleanup-authority-${index}`;
        const result = await registrations.browserBindingRepository.createBootstrap({
          rawState,
          bootstrapCredential: bootstrap.credential,
          providerAuthorizationUrl,
          bindingId: randomUUID(),
          issuedAt,
          expiresAt: shortExpiry,
        });
        assert.equal(result.kind, "browser_bootstrap_created");
        created.push({ rawState, bootstrapCredential: bootstrap.credential, providerAuthorizationUrl });
      }
      const browserBindingCredential = `pb1.${randomBytes(32).toString("base64url")}`;
      assert.equal((await registrations.browserBindingRepository.bindBrowserCredential({
        ...created[0],
        browserBindingCredential,
        now: issuedAt,
        expiresAt: shortExpiry,
      })).kind, "browser_binding_created");
      assert.deepEqual(
        await registrations.browserBindingRepository.claimCallback({ rawState: created[0].rawState, browserBindingCredential, now: issuedAt }),
        { kind: "browser_callback_claimed" },
      );
      assert.deepEqual(await registrations.browserBindingRepository.cleanupExpired({ now: new Date(), limit: 10 }), { kind: "cleaned", count: 0 });
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_browser_bindings WHERE state_digest='${registrations.stateDigester.digest(created[0].rawState)}' AND version=3;`), "1");
      assert.deepEqual(
        await registrations.browserBindingRepository.claimCallback({ rawState: created[0].rawState, browserBindingCredential, now: new Date() }),
        { kind: "callback_replayed" },
      );
      const waitMs = Math.max(0, shortExpiry.getTime() + 100 - Date.now());
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      assert.deepEqual(await registrations.browserBindingRepository.cleanupExpired({ now: new Date(), limit: 1 }), { kind: "cleaned", count: 1 });
      assert.deepEqual(await registrations.browserBindingRepository.cleanupExpired({ now: new Date(), limit: 10 }), { kind: "cleaned", count: 2 });
      const cleanupDigests = created.map((item) => `'${registrations.stateDigester.digest(item.rawState)}'`).join(",");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_browser_bindings WHERE state_digest IN (${cleanupDigests});`), "0");
    });
    await scenario("completion 2 browser success uses the exact fixed Location", async () => {
      assert.equal(completionResponse.headers.get("location"), "https://panel.celebix.site/");
      assert.equal(completionResponse.headers.get("referrer-policy"), "no-referrer");
      assert.equal(completionResponse.headers.get("x-content-type-options"), "nosniff");
    });
    await scenario("completion 3 browser success emits one secure host-only persistent cookie", async () => {
      const cookie = completionResponse.headers.getSetCookie().find((value) => value.startsWith("__Host-celebix_panel="));
      assert.match(cookie, /^__Host-celebix_panel=v1\.[A-Za-z0-9._-]+\.[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=\d+$/);
      assert.equal(/Domain|SameSite=None/.test(cookie), false);
      assert.equal(completionResponse.headers.getSetCookie().includes(preAuthDeletionCookie), true);
      completionSessionCredential = cookieCredential(completionResponse);
    });
    await scenario("completion 4 issued credential resolves the exact TenantContext", async () => {
      completionResolution = await sessionRepository(primaryPool).resolveSession({
        credential: completionSessionCredential,
        requestId: "phase2b2b2a-primary",
        now: new Date(),
      });
      assert.equal(completionResolution.kind, "resolved");
      assert.equal(completionResolution.tenantContext.store.slug, "session-completion-primary");
      assert.equal(completionResolution.tenantContext.membership.role, "store_owner");
    });
    await scenario("completion 5 initial callback persists exactly one handoff row", async () => {
      const digest = registrations.stateDigester.digest(completionRegistration.state);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_session_handoffs WHERE state_digest='${digest}';`), "1");
    });
    await scenario("completion 6 initial callback persists exactly one session row", async () => {
      const proof = sessionProof(completionSessionCredential);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE token_key_id='${proof.tokenKeyId}' AND token_digest='${proof.tokenDigest}';`), "1");
    });
    await scenario("completion 7 consumed callback replay reaches neither issuer nor redeemer and emits no cookie", async () => {
      const replay = await completion.handler(browserCallback(completionRegistration));
      assert.equal(replay.status, 409);
      assert.equal(persistentCookieCount(replay), 0);
      assert.deepEqual(replay.headers.getSetCookie(), [preAuthDeletionCookie]);
      assert.equal(replay.headers.has("location"), false);
      assert.equal(completion.issuerCalls, 1);
      assert.equal(completion.redemptionCalls, 1);
      assert.equal(completion.recoveryCalls, 0);
    });
    await scenario("completion 8 concurrent duplicate delivery yields exactly one session-bearing response", async () => {
      const registration = await registrations.complete("session-completion-concurrent");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration);
      const responses = await Promise.all([
        pipeline.handler(browserCallback(registration)),
        pipeline.handler(browserCallback(registration)),
      ]);
      assert.equal(responses.filter((response) => persistentCookieCount(response) === 1).length, 1);
      assert.equal(pipeline.issuerCalls, 1);
      assert.equal(pipeline.redemptionCalls, 1);
    });
    let theftResponse;
    await scenario("browser binding 6 stolen callback URL without pre-auth cookie reaches no Owner authority", async () => {
      const registration = await registrations.complete("session-completion-stolen-url");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration);
      theftResponse = await pipeline.handler(browserCallback(registration, undefined, ""));
      assert.equal(theftResponse.status, 400);
      assert.equal(pipeline.fetchCalls, 0);
      assert.equal(pipeline.issuerCalls, 0);
      assert.equal(pipeline.redemptionCalls, 0);
      assert.equal(persistentCookieCount(theftResponse), 0);
      assert.equal(theftResponse.headers.has("location"), false);
    });
    await scenario("browser binding 7 wrong pb1 cookie reaches no provider issuer or redeemer", async () => {
      const registration = await registrations.complete("session-completion-wrong-cookie");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration);
      const wrong = `pb1.${randomBytes(32).toString("base64url")}`;
      const response = await pipeline.handler(browserCallback(registration, undefined, wrong));
      assert.equal(response.status, 409);
      assert.equal(pipeline.fetchCalls, 1);
      assert.equal(pipeline.issuerCalls, 0);
      assert.equal(pipeline.redemptionCalls, 0);
      assert.equal(persistentCookieCount(response), 0);
      assert.equal(response.headers.has("location"), false);
    });
    await scenario("browser binding 8 state A with binding B is atomically rejected before callback execution", async () => {
      const registrationA = await registrations.complete("session-completion-cross-a");
      const registrationB = await registrations.complete("session-completion-cross-b");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registrationA);
      const response = await pipeline.handler(browserCallback(
        registrationA,
        undefined,
        registrationB.browserBindingCredential,
      ));
      assert.equal(response.status, 409);
      assert.equal(pipeline.issuerCalls, 0);
      assert.equal(pipeline.redemptionCalls, 0);
      assert.equal(persistentCookieCount(response), 0);
    });
    await scenario("browser binding 9 every terminal failure clears only pre-auth authority", async () => {
      assert.deepEqual(theftResponse.headers.getSetCookie(), [preAuthDeletionCookie]);
      assert.equal(theftResponse.headers.has("location"), false);
    });
    await scenario("completion 9 Owner response body tamper fails signature before redemption", async () => {
      const registration = await registrations.complete("session-completion-body-tamper");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration, { tamper: "body" });
      const response = await pipeline.handler(browserCallback(registration));
      assert.equal(response.status, 503);
      assert.equal(persistentCookieCount(response), 0);
      assert.equal(pipeline.redemptionCalls, 0);
    });
    await scenario("completion 10 Owner status and signature-header tamper fail before redemption", async () => {
      for (const tamper of ["status", "headers"]) {
        const registration = await registrations.complete(`session-completion-${tamper}-tamper`);
        const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration, { tamper });
        const response = await pipeline.handler(browserCallback(registration));
        assert.equal(response.status, 503);
        assert.equal(persistentCookieCount(response), 0);
        assert.equal(pipeline.redemptionCalls, 0);
      }
    });
    await scenario("completion 11 Owner response loss performs no automatic callback retry", async () => {
      const registration = await registrations.complete("session-completion-response-loss");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration, { loseOwnerResponse: true });
      const lost = await pipeline.handler(browserCallback(registration));
      assert.equal(lost.status, 503);
      assert.deepEqual(await lost.json(), {
        code: "panel_session_transport_unavailable",
        retryable: false,
        freshLoginRequired: true,
      });
      assert.equal(persistentCookieCount(lost), 0);
      assert.equal(pipeline.fetchCalls, 1);
      assert.equal(pipeline.issuerCalls, 1);
      assert.equal(pipeline.redemptionCalls, 0);
    });
    await scenario("completion 12 redemption COMMIT response loss performs exactly one read-only recovery", async () => {
      const registration = await registrations.complete("session-completion-redemption-loss");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration, { redemptionCommitUnknown: true });
      const response = await pipeline.handler(browserCallback(registration));
      assert.equal(response.status, 303);
      assert.equal(pipeline.redemptionCalls, 1);
      assert.equal(pipeline.recoveryCalls, 1);
      const proof = sessionProof(cookieCredential(response));
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE token_key_id='${proof.tokenKeyId}' AND token_digest='${proof.tokenDigest}';`), "1");
    });
    await scenario("completion 13 a revoked persistent session is never written to a cookie again", async () => {
      const registration = await registrations.complete("session-completion-revoked");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration);
      const issued = await pipeline.handler(browserCallback(registration));
      assert.equal(issued.status, 303);
      const issuedCredential = cookieCredential(issued);
      const proof = sessionProof(issuedCredential);
      const revoked = await identityQuery(primaryPool, "SELECT outcome FROM saas.revoke_panel_session($1,$2,$3,$4)", [proof.tokenKeyId, proof.tokenDigest, "security", new Date()]);
      assert.equal(revoked.rows[0]?.outcome, "revoked");
      const replayOnly = createPanelSessionCompletionHandler({
        activationApproval: createPanelSessionCompletionApproval("disposable_test"),
        publicCallbackAuthority: callbackAuthority,
        maximumQueryBytes: 2_048,
        transport: { async complete() { return pipeline.lastInternalResult; } },
        redeemer: pipeline.trackedRedeemer,
        clock: () => new Date(),
        audit: () => undefined,
      });
      const response = await replayOnly(browserCallback({
        state: "state_revoked_replay_0123456789",
        browserBindingCredential: registration.browserBindingCredential,
      }));
      assert.equal(response.status, 409);
      assert.equal(persistentCookieCount(response), 0);
    });
    await scenario("completion 14 provider-error callback creates no handoff session cookie or redirect", async () => {
      const registration = await registrations.complete("session-completion-provider-error");
      const pipeline = sessionCompletionPipeline(primaryPool, registrations, registration);
      const response = await pipeline.handler(browserCallback(
        registration,
        `state=${encodeURIComponent(registration.state)}&error=access_denied&error_description=private`,
      ));
      assert.equal(response.status, 400);
      assert.equal(persistentCookieCount(response), 0);
      assert.equal(response.headers.has("location"), false);
      assert.equal(pipeline.issuerCalls, 0);
      assert.equal(pipeline.redemptionCalls, 0);
    });
    await scenario("completion 15 raw callback state is absent from PostgreSQL data", async () => {
      assert.equal(dataDump(backend).includes(completionRegistration.state), false);
    });
    await scenario("completion 16 raw handoff and session credentials are absent from PostgreSQL data", async () => {
      assert.equal(dataDump(backend).includes(completionHandoffCredential), false);
      assert.equal(dataDump(backend).includes(completionSessionCredential), false);
      assert.equal(dataDump(backend).includes(completionSessionCredential.split(".").at(-1)), false);
    });
    await scenario("completion 18 audit projections contain no callback handoff or session secrets", async () => {
      const captured = JSON.stringify(completion.audit);
      for (const secret of [completionRegistration.state, completionHandoffCredential, completionSessionCredential]) {
        assert.equal(captured.includes(secret), false);
      }
    });
    const registrationB = await registrations.complete("handoff-state-binding-b");
    const completedB = await executeVerifiedCallback(registrationB, () => Object.freeze({ kind: "registration_b_completed" }));
    assert.equal(completedB.kind, "initial_callback_granted");
    const registrationBDigest = registrations.stateDigester.digest(registrationB.state);
    const registrationA = await registrations.complete("handoff-state-binding-a");
    const registrationADigest = registrations.stateDigester.digest(registrationA.state);
    let stateBinding;
    let stateBindingRandomCalls = 0;
    let randomCallsAfterSubstitution = -1;
    const stateBoundIssuer = issuer(primaryPool, registrations.stateDigester, registrationA.grantBoundary, {
      randomBytes(size) { stateBindingRandomCalls += 1; return new Uint8Array(randomBytes(size)); },
    });
    await scenario("registration A grant rejects completed registration B state", async () => {
      const execution = await executeVerifiedCallback(registrationA, async (grant) => {
        assert.equal(isActiveInitialVerifiedCallbackGrantForState(registrationA.grantBoundary, grant, registrationA.state), true);
        assert.equal(isActiveInitialVerifiedCallbackGrantForState(registrationA.grantBoundary, grant, registrationB.state), false);
        const substituted = await stateBoundIssuer.issueHandoff({ rawState: registrationB.state, initialCallbackGrant: grant });
        randomCallsAfterSubstitution = stateBindingRandomCalls;
        const exact = await stateBoundIssuer.issueHandoff({ rawState: registrationA.state, initialCallbackGrant: grant });
        return { substituted, exact };
      });
      assert.equal(execution.kind, "initial_callback_granted");
      stateBinding = execution.value;
      assert.deepEqual(stateBinding.substituted, { kind: "durable_authority_invalid" });
    });
    await scenario("registration B receives zero handoff rows and random candidates", async () => {
      assert.equal(randomCallsAfterSubstitution, 0);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_session_handoffs WHERE state_digest='${registrationBDigest}';`), "0");
    });
    await scenario("exact registration A state creates one handoff with its bound grant", async () => {
      assert.equal(stateBinding.exact.kind, "handoff_created");
      assert.equal(stateBindingRandomCalls, 1);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_session_handoffs WHERE state_digest='${registrationADigest}';`), "1");
    });

    await scenario("caller callback mutation cannot create a substituted-state handoff", async () => {
      const provider = new PausedOidcProvider();
      const registration = await registrations.complete("handoff-callback-mutation", { provider });
      const ownerIssuer = issuer(primaryPool, registrations.stateDigester, registration.grantBoundary);
      const executor = createInitialCallbackPanelSessionHandoffExecutor({ runtime: registration.runtime, boundary: registration.grantBoundary, issuer: ownerIssuer });
      const callback = { state: registration.state, code: "valid-code" };
      const pending = executor.execute(callback);
      await provider.started;
      callback.state = registrationB.state;
      callback.code = "substituted-code";
      provider.release();
      const execution = await pending;
      assert.equal(execution.kind, "initial_callback_granted");
      assert.equal(execution.value.handoff.kind, "handoff_created");
      assert.deepEqual(provider.captured, { state: registration.state, code: "valid-code" });
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_session_handoffs WHERE state_digest='${registrationBDigest}';`), "0");
      const mutationDigest = registrations.stateDigester.digest(registration.state);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_session_handoffs WHERE state_digest='${mutationDigest}';`), "1");
    });

    let primary;
    await scenario("1 initial provider-verified callback creates one active grant", async () => {
      const registration = await registrations.complete("handoff-primary");
      let issuerCalls = 0;
      const ownerIssuer = issuer(primaryPool, registrations.stateDigester, registration.grantBoundary, {
        audit() { issuerCalls += 1; },
      });
      const executor = createInitialCallbackPanelSessionHandoffExecutor({ runtime: registration.runtime, boundary: registration.grantBoundary, issuer: ownerIssuer });
      const execution = await executor.execute({ state: registration.state, code: "valid-code" });
      assert.equal(execution.kind, "initial_callback_granted");
      if (execution.kind !== "initial_callback_granted") throw new Error("verified callback grant missing");
      assert.equal(execution.completion.kind, "tenant_created_session_pending");
      primary = { registration, ownerIssuer, executor, issuerCalls: () => issuerCalls, handoff: execution.value.handoff };
    });

    await scenario("2 active grant creates one random handoff", async () => {
      assert.equal(primary.handoff.kind, "handoff_created");
      assert.match(primary.handoff.credential, /^h1\.handoff\.active\.v1\.[A-Za-z0-9_-]{43}$/);
      const primaryDigest = registrations.stateDigester.digest(primary.registration.state);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_session_handoffs WHERE state_digest='${primaryDigest}';`), "1");
    });
    const firstHandoff = primary.handoff;
    if (firstHandoff.kind !== "handoff_created") throw new Error("primary handoff missing");

    await scenario("3 raw callback state cannot reconstruct the random handoff", async () => {
      const deterministic = createHmac("sha256", handoffKeys.get(handoffKeyId))
        .update(`celebix-panel-handoff-v1\n${primary.registration.state}`, "utf8").digest("base64url");
      assert.notEqual(firstHandoff.credential, `h1.${handoffKeyId}.${deterministic}`);
      assert.equal(firstHandoff.credential.includes(primary.registration.state), false);
    });

    let replay;
    const rowsBeforeReplay = psql(backend, "SELECT count(*) FROM saas.panel_session_handoffs;");
    await scenario("4 repeated consumed callback creates no grant", async () => {
      replay = await primary.executor.execute({ state: primary.registration.state, code: "valid-code" });
      assert.deepEqual(replay, { kind: "initial_callback_replayed" });
    });
    await scenario("5 repeated callback makes zero issuer and handoff database calls", async () => {
      assert.equal(primary.issuerCalls(), 1);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_session_handoffs;"), rowsBeforeReplay);
    });

    let exactReplay;
    let mismatchedReplay;
    await scenario("6 exact retained candidate replay succeeds while unredeemed", async () => {
      const registration = await registrations.complete("handoff-exact-candidate");
      const ownerIssuer = issuer(primaryPool, registrations.stateDigester, registration.grantBoundary);
      const execution = await executeVerifiedCallback(registration, async (grant) => {
        assert.equal(isActiveInitialVerifiedCallbackGrantForState(registration.grantBoundary, grant, registration.state), true);
        const created = await ownerIssuer.issueHandoff({ rawState: registration.state, initialCallbackGrant: grant });
        if (created.kind !== "handoff_created") throw new Error("candidate missing");
        const recovered = await ownerIssuer.recoverHandoff({ rawState: registration.state, candidateCredential: created.credential, initialCallbackGrant: grant });
        const other = createPanelSessionHandoffCredentialCodec({ keys: handoffKeys, activeKeyId: handoffKeyId, randomBytes: (size) => new Uint8Array(randomBytes(size)) }).generateCredential();
        const mismatch = await ownerIssuer.recoverHandoff({ rawState: registration.state, candidateCredential: other.credential, initialCallbackGrant: grant });
        return { created, recovered, mismatch };
      });
      assert.equal(execution.kind, "initial_callback_granted");
      exactReplay = execution.value.recovered;
      mismatchedReplay = execution.value.mismatch;
      assert.equal(exactReplay.kind, "handoff_replayed");
      assert.equal(exactReplay.credential, execution.value.created.credential);
    });
    await scenario("7 different random candidate returns operation_mismatch", async () => {
      assert.deepEqual(mismatchedReplay, { kind: "operation_mismatch" });
    });

    const primaryRedeemer = redeemer(primaryPool);
    let firstRedemption;
    await scenario("8 handoff redemption creates one panel session", async () => {
      firstRedemption = await primaryRedeemer.redeemHandoff({ credential: firstHandoff.credential });
      assert.equal(firstRedemption.kind, "session_issued");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.panel_sessions WHERE session_id='${firstRedemption.session.sessionId}';`), "1");
    });
    if (firstRedemption.kind !== "session_issued") throw new Error("primary session missing");

    await scenario("9 Owner replay after redemption cannot disclose the handoff", async () => {
      assert.deepEqual(await primary.ownerIssuer.recoverHandoff({ rawState: primary.registration.state, candidateCredential: firstHandoff.credential, initialCallbackGrant: {} }), { kind: "durable_authority_invalid" });
      const proof = createPanelSessionHandoffCredentialCodec({ keys: handoffKeys, activeKeyId: handoffKeyId, randomBytes: (size) => new Uint8Array(randomBytes(size)) }).digestCredential(firstHandoff.credential);
      const recovered = await identityQuery(primaryPool,
        "SELECT outcome FROM saas.recover_panel_session_handoff($1,$2,$3,$4,$5)",
        [registrations.stateDigester.digest(primary.registration.state), proof.tokenKeyId, proof.tokenDigest, sessionKeyId, new Date()]);
      assert.equal(recovered.rows[0]?.outcome, "operation_mismatch");
    });

    await scenario("10 concurrent redemption is one issued plus one replayed", async () => {
      const registration = await registrations.complete("handoff-concurrent");
      const ownerIssuer = issuer(primaryPool, registrations.stateDigester, registration.grantBoundary);
      const execution = await executeVerifiedCallback(registration, (grant) => ownerIssuer.issueHandoff({ rawState: registration.state, initialCallbackGrant: grant }));
      const handoff = execution.value;
      assert.equal(handoff.kind, "handoff_created");
      const results = await Promise.all([redeemer(poolA).redeemHandoff({ credential: handoff.credential }), redeemer(poolB).redeemHandoff({ credential: handoff.credential })]);
      assert.deepEqual(results.map((entry) => entry.kind).sort(), ["session_issued", "session_replayed"]);
    });

    let commitRecovery;
    let missingCandidate;
    let processReplay;
    await scenario("11 creation COMMIT unknown recovers only retained candidate with active grant", async () => {
      const registration = await registrations.complete("handoff-create-loss");
      const ownerIssuer = issuer(primaryPool, registrations.stateDigester, registration.grantBoundary, { commitUnknown: true });
      const execution = await executeVerifiedCallback(registration, async (grant) => {
        const unknown = await ownerIssuer.issueHandoff({ rawState: registration.state, initialCallbackGrant: grant });
        assert.equal(unknown.kind, "commit_unknown");
        const missing = await ownerIssuer.recoverHandoff({ rawState: registration.state, candidateCredential: undefined, initialCallbackGrant: grant });
        const substituted = await ownerIssuer.recoverHandoff({ rawState: registrationB.state, candidateCredential: unknown.credential, initialCallbackGrant: grant });
        const recovered = await ownerIssuer.recoverHandoff({ rawState: registration.state, candidateCredential: unknown.credential, initialCallbackGrant: grant });
        return { unknown, missing, substituted, recovered };
      });
      commitRecovery = execution.value;
      missingCandidate = commitRecovery.missing;
      assert.equal(commitRecovery.recovered.kind, "handoff_replayed");
      assert.equal(commitRecovery.recovered.credential, commitRecovery.unknown.credential);
      assert.deepEqual(commitRecovery.substituted, { kind: "durable_authority_invalid" });
      processReplay = await ownerIssuer.recoverHandoff({ rawState: registration.state, candidateCredential: commitRecovery.unknown.credential, initialCallbackGrant: {} });
    });
    await scenario("12 missing candidate cannot recover handoff", async () => assert.deepEqual(missingCandidate, { kind: "durable_authority_invalid" }));
    await scenario("13 process-style replay without active grant cannot recover", async () => assert.deepEqual(processReplay, { kind: "durable_authority_invalid" }));

    await scenario("14 redemption COMMIT unknown recovers from retained handoff credential", async () => {
      const registration = await registrations.complete("handoff-redeem-loss");
      const ownerIssuer = issuer(primaryPool, registrations.stateDigester, registration.grantBoundary);
      const execution = await executeVerifiedCallback(registration, (grant) => ownerIssuer.issueHandoff({ rawState: registration.state, initialCallbackGrant: grant }));
      const loss = await redeemer(primaryPool, { commitUnknown: true }).redeemHandoff({ credential: execution.value.credential });
      assert.equal(loss.kind, "commit_unknown");
      const recovered = await redeemer(primaryPool).recoverRedemption({ credential: execution.value.credential });
      assert.equal(recovered.kind, "session_replayed");
      assert.equal(recovered.credential, loss.credential);
    });

    async function createAndRedeem(slug, options = {}) {
      const registration = await registrations.complete(slug);
      const ownerIssuer = issuer(primaryPool, registrations.stateDigester, registration.grantBoundary);
      let handoff;
      if (options.sessionMs) {
        const execution = await registration.grantBoundary.executeInitialCallback({ state: registration.state, code: "valid-code" }, async () => directHandoff(primaryPool, registrations.stateDigester, registration.state, options));
        handoff = { kind: "handoff_created", credential: execution.value };
      } else {
        const execution = await executeVerifiedCallback(registration, (grant) => ownerIssuer.issueHandoff({ rawState: registration.state, initialCallbackGrant: grant }));
        handoff = execution.value;
      }
      const redemption = await redeemer(primaryPool).redeemHandoff({ credential: handoff.credential });
      assert.equal(redemption.kind, "session_issued");
      return { registration, handoff, redemption };
    }

    await scenario("15 revoked and expired session replay is unauthenticated", async () => {
      const authority = await createAndRedeem("handoff-revoked");
      const proof = sessionProof(authority.redemption.credential);
      const revoked = await identityQuery(primaryPool, "SELECT outcome FROM saas.revoke_panel_session($1,$2,$3,$4)", [proof.tokenKeyId, proof.tokenDigest, "security", new Date()]);
      assert.equal(revoked.rows[0]?.outcome, "revoked");
      assert.deepEqual(await redeemer(primaryPool).redeemHandoff({ credential: authority.handoff.credential }), { kind: "unauthenticated" });
      const expiring = await createAndRedeem("handoff-expired-session", { sessionMs: 3_000 });
      await new Promise((resolve) => setTimeout(resolve, 3_100));
      assert.deepEqual(await redeemer(primaryPool).redeemHandoff({ credential: expiring.handoff.credential }), { kind: "unauthenticated" });
    });

    await scenario("16 rotated session replay is unauthenticated", async () => {
      const authority = await createAndRedeem("handoff-rotated");
      const current = sessionProof(authority.redemption.credential);
      const replacement = createPanelSessionCredentialCodec({ keys: sessionKeys, activeKeyId: sessionKeyId, randomBytes: (size) => new Uint8Array(randomBytes(size)) }).issueCredential();
      const rotated = await identityQuery(primaryPool, "SELECT outcome FROM saas.rotate_panel_session($1,$2,$3,$4,$5,$6,$7,$8)", [current.tokenKeyId, current.tokenDigest, randomUUID(), randomUUID(), replacement.tokenKeyId, replacement.tokenDigest, authority.redemption.session.activeStoreId, new Date()]);
      assert.equal(rotated.rows[0]?.outcome, "rotated");
      assert.deepEqual(await redeemer(primaryPool).redeemHandoff({ credential: authority.handoff.credential }), { kind: "unauthenticated" });
    });

    await scenario("17 disabled owner membership replay is membership_denied", async () => {
      const authority = await createAndRedeem("handoff-membership-disabled");
      psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked', updated_at=clock_timestamp() WHERE principal_id='${authority.redemption.session.principalId}' AND store_id='${authority.redemption.session.activeStoreId}'; RESET ROLE;`);
      assert.deepEqual(await redeemer(primaryPool).redeemHandoff({ credential: authority.handoff.credential }), { kind: "membership_denied" });
    });

    await scenario("18 suspended store replay is membership_denied", async () => {
      const authority = await createAndRedeem("handoff-store-suspended");
      psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended', updated_at=clock_timestamp() WHERE id='${authority.redemption.session.activeStoreId}'; RESET ROLE;`);
      assert.deepEqual(await redeemer(primaryPool).redeemHandoff({ credential: authority.handoff.credential }), { kind: "membership_denied" });
    });

    await scenario("19 mutable service configuration cannot change captured authority", async () => {
      const registration = await registrations.complete("handoff-config-snapshot");
      const mutableHandoffKey = new Uint8Array(handoffKeys.get(handoffKeyId));
      const mutableHandoffKeys = new Map([[handoffKeyId, mutableHandoffKey]]);
      const dependencies = {
        pool: primaryPool, stateDigester: registrations.stateDigester, handoffKeys: mutableHandoffKeys,
        activeHandoffKeyId: handoffKeyId, sessionTokenKeyId: sessionKeyId, clock: () => new Date(),
        randomBytes: (size) => new Uint8Array(randomBytes(size)), randomUuid: () => randomUUID(),
        timeouts: { ...timeouts }, audit: () => undefined, initialCallbackGrantBoundary: registration.grantBoundary,
      };
      const capturedIssuer = createPostgresPanelSessionHandoffIssuer(createOwnerHandoffApproval("disposable_test"), dependencies);
      dependencies.pool = { async connect() { throw new Error("mutated pool"); } };
      dependencies.clock = () => new Date("2030-01-01T00:00:00.000Z");
      dependencies.sessionTokenKeyId = "mutated.session";
      dependencies.timeouts.poolCheckoutMs = 0;
      mutableHandoffKeys.clear();
      mutableHandoffKey.fill(0xff);
      const execution = await executeVerifiedCallback(registration, (grant) => capturedIssuer.issueHandoff({ rawState: registration.state, initialCallbackGrant: grant }));
      assert.equal(execution.value.kind, "handoff_created");
      const mutableSessionKey = new Uint8Array(sessionKeys.get(sessionKeyId));
      const redeemerDependencies = { pool: primaryPool, handoffKeys: new Map(handoffKeys), sessionKeys: new Map([[sessionKeyId, mutableSessionKey]]), clock: () => new Date(), timeouts: { ...timeouts }, audit: () => undefined };
      const capturedRedeemer = createPostgresPanelSessionHandoffRedeemer(createCustomerHandoffApproval("disposable_test"), redeemerDependencies);
      redeemerDependencies.pool = { async connect() { throw new Error("mutated pool"); } };
      redeemerDependencies.sessionKeys.clear();
      mutableSessionKey.fill(0xff);
      redeemerDependencies.clock = () => new Date("2030-01-01T00:00:00.000Z");
      assert.equal((await capturedRedeemer.redeemHandoff({ credential: execution.value.credential })).kind, "session_issued");
    });

    await scenario("20 raw callback state, handoff, and session credentials are absent from database", async () => {
      const dump = dataDump(backend);
      for (const secret of [primary.registration.state, firstHandoff.credential, firstHandoff.credential.split(".").at(-1), firstRedemption.credential, firstRedemption.credential.split(".").at(-1)]) {
        assert.equal(dump.includes(secret), false);
      }
    });

    await scenario("21 backup and restore preserve opaque durable authority", async () => {
      const backup = dumpDatabase(backend, primaryDatabase);
      psql(backend, `CREATE DATABASE ${restoreDatabase};`, "postgres");
      restoreDatabaseDump(backend, restoreDatabase, backup);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_session_handoffs;", restoreDatabase), psql(backend, "SELECT count(*) FROM saas.panel_session_handoffs;", primaryDatabase));
      assert.equal(psql(backend, "SELECT count(*) FROM saas.panel_browser_bindings;", restoreDatabase), psql(backend, "SELECT count(*) FROM saas.panel_browser_bindings;", primaryDatabase));
      const restorePool = databasePool(backend, restoreDatabase);
      pools.push(restorePool);
      const restored = await sessionRepository(restorePool).resolveSession({ credential: firstRedemption.credential, requestId: "restored", now: new Date() });
      assert.equal(restored.kind, "resolved");
    });

    migration(backend, "202607140017_panel_browser_bindings.down.sql");
    await scenario("22 migration 017 rolls back cleanly", async () => assert.equal(psql(backend, "SELECT to_regclass('saas.panel_browser_bindings') IS NULL;"), "t"));
    await scenario("23 migrations 001-016 remain intact", async () => {
      assert.equal(psql(backend, "SELECT to_regclass('saas.panel_session_handoffs') IS NOT NULL AND to_regclass('saas.panel_sessions') IS NOT NULL AND to_regclass('saas.registration_tenant_completions') IS NOT NULL AND to_regclass('saas.tenant_operations') IS NOT NULL;"), "t");
      assert.ok(Number(psql(backend, "SELECT count(*) FROM saas.panel_sessions;")) >= 1);
    });
    migration(backend, "202607140017_panel_browser_bindings.up.sql");
    await scenario("24 migration 017 reapplies with exact checksums, grants, owner, and search_path", async () => {
      for (const file of manifests) {
        const manifest = JSON.parse(readFileSync(path.join(sqlDirectory, file), "utf8"));
        for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(sqlDirectory, artifact.file))).digest("hex"), artifact.sha256);
      }
      assert.equal(psql(backend, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='saas' AND p.proname IN ('create_panel_browser_bootstrap','bind_panel_browser_credential','claim_panel_browser_callback','cleanup_panel_browser_bindings') AND r.rolname='celebix_saas_owner' AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[];"), "4");
      assert.equal(psql(backend, "SELECT has_table_privilege('celebix_saas_identity','saas.panel_browser_bindings','SELECT,INSERT,UPDATE,DELETE')::int || ':' || has_table_privilege('public','saas.panel_browser_bindings','SELECT,INSERT,UPDATE,DELETE')::int;"), "0:0");
    });
  } catch (error) {
    runError = error;
  } finally {
    await Promise.all(pools.map((pool) => pool.end().catch(() => undefined)));
    stopPostgres(backend);
  }
  if (runError) throw runError;
  await scenario("complete cleanup", async () => assert.equal(existsSync(temporaryDirectory), false));
  await scenario("external network count zero and production connection count zero", async () => {
    assert.equal(connectionEvidence.externalNetworkAttempts, 0);
    assert.equal(connectionEvidence.productionConnectionAttempts, 0);
  });
  assert.equal(scenarios, 58);
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    backend: backend.kind === "native" ? "native-postgresql" : backend.engine,
    postgresqlVersion: 16,
    scenarios,
    externalNetworkAttempts: connectionEvidence.externalNetworkAttempts,
    productionConnectionAttempts: connectionEvidence.productionConnectionAttempts,
    productionConnectionUsed: connectionEvidence.productionConnectionAttempts !== 0,
    sessionCompletionPipeline: "PASS",
    signedOwnerResponse: "PASS",
    secureHostCookie: "PASS",
    durableBrowserBinding: "PASS",
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
