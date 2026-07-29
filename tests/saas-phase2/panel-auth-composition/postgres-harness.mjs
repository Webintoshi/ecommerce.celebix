import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  accessSync,
  appendFileSync,
  constants,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { PostgresSaaSDataRepository, PostgresTenantOperationRecovery } from "@celebix/saas-data";
import { createStarterTenantService } from "@celebix/saas-tenant-core";

import { createCustomerPanelAuthCompositionApproval } from "../../../apps/customer-panel/lib/panel-auth-composition/activation.ts";
import {
  assertDisabledCustomerPanelAuthComposition,
  createDisabledCustomerPanelAuthComposition,
} from "../../../apps/customer-panel/lib/panel-auth-composition/composition.ts";
import { createPanelSessionHandoffApproval as createCustomerHandoffApproval } from "../../../apps/customer-panel/lib/panel-session-handoff/activation.ts";
import { createPostgresPanelSessionHandoffRedeemer } from "../../../apps/customer-panel/lib/panel-session-handoff/postgres-handoff-redeemer.ts";
import { createPanelSessionPersistenceApproval } from "../../../apps/customer-panel/lib/panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../../../apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts";
import { createOwnerSelfServeAuthCompositionApproval } from "../../../apps/owner/lib/self-serve-auth-composition/activation.ts";
import {
  assertDisabledOwnerSelfServeAuthComposition,
  createDisabledOwnerSelfServeAuthComposition,
} from "../../../apps/owner/lib/self-serve-auth-composition/composition.ts";
import { createPanelBrowserBindingAuthorityCodec } from "../../../apps/owner/lib/panel-browser-binding/credential-codec.ts";
import { createPostgresPanelBrowserBindingRepository } from "../../../apps/owner/lib/panel-browser-binding/postgres-repository.ts";
import { createPanelSessionCredentialCodec } from "../../../apps/customer-panel/lib/panel-session-persistence/credential-codec.ts";
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "../../../apps/owner/lib/saas-persistence/identity-crypto.ts";
import { PostgresOidcTransactionStore } from "../../../apps/owner/lib/saas-persistence/postgres-oidc-transaction-store.ts";
import { PostgresRegistrationAttemptStore } from "../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts";
import { createOwnerTenantCoreAdapter } from "../../../apps/owner/lib/saas-tenant-core/adapter.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../../../apps/owner/lib/self-serve-http/runtime.ts";
import { createPersistentRegistrationCompletionService } from "../../../apps/owner/lib/self-serve-registration-completion.ts";
import {
  REQUIRED_APPLY_ORDER,
  REQUIRED_NATIVE_TOOLS,
  assertSafeEnvironment,
} from "../postgres/disposable-harness.mjs";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL_DIRECTORY = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const OWNER_ORIGIN = "https://ecommerce.celebix.co";
const PANEL_ORIGIN = "https://panel.celebix.site";
const BOOTSTRAP_AUTHORITY = PANEL_ORIGIN + "/auth/bootstrap";
const CALLBACK_AUTHORITY = PANEL_ORIGIN + "/auth/callback";
const BROWSER_INTERNAL_PATH = "/api/internal/self-serve/browser-binding";
const CALLBACK_INTERNAL_PATH = "/api/internal/self-serve/oidc-callback";
const PROVIDER_ISSUER = "https://identity.example.test";
const PROVIDER_AUDIENCE = "customer-panel";
const PRE_AUTH_DELETION_COOKIE = "__Host-celebix_panel_pre_auth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
const TIMEOUTS = {
  poolCheckoutMs: 2_000,
  statementMs: 5_000,
  lockMs: 5_000,
  idleTransactionMs: 5_000,
};
const PHASE2B_FILES = [
  "202607110007_identity_roles.up.sql",
  "202607110008_identity_persistence.up.sql",
  "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql",
];
const PHASE2B1B1_FILES = [
  "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql",
  "202607120014_verified_identity_catalog_assertions.sql",
];
const MANIFESTS = [
  "phase2a1-manifest.json",
  "phase2b1-manifest.json",
  "phase2b1b1-manifest.json",
  "phase2b2a-manifest.json",
  "phase2b2b1-manifest.json",
  "phase2b2b2a1-manifest.json",
];
const SCENARIOS = Object.freeze([
  "1. PostgreSQL 16 and migrations 001–017.",
  "2. Existing manifests/checksums.",
  "3. Default routes remain disabled.",
  "4. Genuine Owner/customer compositions constructed.",
  "5. Valid registration request accepted.",
  "6. Request gate executed exactly once.",
  "7. Registration/OIDC start executed exactly once.",
  "8. Owner bridge returns HTTP 200 HTML.",
  "9. Owner bridge emits complete security headers.",
  "10. Owner bridge emits no cookie or Location.",
  "11. CSP nonce and fixed script are valid.",
  "12. Exact form action/method/encoding.",
  "13. Exact two hidden fields.",
  "14. Browser form decoding reproduces exact bs1 and provider URL.",
  "15. No provider URL or credential enters JSON/header/audit.",
  "16. Panel bootstrap returns HTTP 303.",
  "17. Exact pb1 pre-auth cookie is written.",
  "18. Exact provider URL is used only after Owner verification.",
  "19. Workflow/OIDC/browser-binding row counts are exact.",
  "20. Callback with exact pre-auth cookie succeeds.",
  "21. Persistent session cookie is written.",
  "22. Exact pre-auth deletion cookie is written.",
  "23. TenantContext resolves exact store-owner membership.",
  "24. Tenant/store/membership/session/handoff counts are exact.",
  "25. Reposting the same Owner bridge form fails closed.",
  "26. Missing-cookie callback reaches zero provider/issuer/redeemer.",
  "27. Wrong-cookie callback reaches zero provider/issuer/redeemer.",
  "28. Stolen callback URL without browser binding creates no session.",
  "29. Cross-state/browser-binding request is rejected.",
  "30. Concurrent duplicate callback yields one session response.",
  "31. Provider-error callback creates no handoff/session.",
  "32. Owner response loss performs no callback retry.",
  "33. Redemption commit-unknown performs one read-only recovery.",
  "34. Raw state/bs1/pb1/provider URL/handoff/session scans pass.",
  "35. Audit redaction passes.",
  "36. Claimed replay evidence survives cleanup before expiry.",
  "37. Backup succeeds.",
  "38. Restore and restored TenantContext succeed.",
  "39. External and production/staging connection counts remain zero.",
  "40. All validation-owned processes/files/sockets are removed.",
]);

const runToken = randomBytes(6).toString("hex");
const primaryDatabase = "phase2b2b2b_" + runToken;
const restoreDatabase = primaryDatabase + "_restore";
const workloadRole = "celebix_b2b2b_" + runToken;
const connectionEvidence = {
  externalNetworkAttempts: 0,
  productionConnectionAttempts: 0,
  providerNetworkAttempts: 0,
};
let diagnosticStage = "not_started";
let diagnosticCode = "not_available";

function executable(name) {
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error("disposable command failed: " + path.basename(program));
  }
  return result;
}

function startNativePostgres() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(
    REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]),
  );
  if (Object.values(executables).some((value) => !value)) {
    throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  }
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-phase2b2b2b-"));
  const socketDirectory = path.join("/tmp", "c2b2b2b-" + runToken);
  const dataDirectory = path.join(temporaryDirectory, "data");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  mkdirSync(socketDirectory, { mode: 0o700 });
  command(executables.initdb, [
    "-D", dataDirectory,
    "--auth=trust",
    "--username=postgres",
    "--no-locale",
  ]);
  appendFileSync(
    path.join(dataDirectory, "postgresql.conf"),
    "\nlisten_addresses = ''\nunix_socket_directories = '" +
      socketDirectory.replaceAll("'", "''") +
      "'\nport = " + port + "\nmax_connections = 80\n",
  );
  command(executables.pg_ctl, [
    "-D", dataDirectory,
    "-l", path.join(temporaryDirectory, "postgres.log"),
    "start",
  ]);
  const backend = {
    kind: "native",
    executables,
    temporaryDirectory,
    socketDirectory,
    dataDirectory,
    host: socketDirectory,
    port,
    started: true,
  };
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = command(executables.pg_isready, [
      "-h", socketDirectory,
      "-p", String(port),
      "-U", "postgres",
    ], { allowFailure: true });
    if (ready.status === 0) return backend;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  throw new Error("disposable PostgreSQL readiness timeout");
}

function stopNativePostgres(backend) {
  if (!backend) return;
  if (backend.started) {
    command(backend.executables.pg_ctl, [
      "-D", backend.dataDirectory,
      "-m", "fast",
      "stop",
    ], { allowFailure: true });
    backend.started = false;
  }
  rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psql(backend, source, database = primaryDatabase) {
  const result = command(backend.executables.psql, [
    "-h", backend.socketDirectory,
    "-p", String(backend.port),
    "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", database,
  ], { input: source });
  return String(result.stdout || "").trim();
}

function migration(backend, file, database = primaryDatabase, asMigrator = true) {
  const source = readFileSync(path.join(SQL_DIRECTORY, file), "utf8");
  const wrapped = asMigrator
    ? "SET SESSION AUTHORIZATION celebix_saas_migrator;\n" + source +
      "\nRESET SESSION AUTHORIZATION;"
    : source;
  psql(backend, wrapped, database);
}

function applyAll(backend, database) {
  migration(backend, REQUIRED_APPLY_ORDER[0], database, false);
  for (const file of REQUIRED_APPLY_ORDER.slice(1)) migration(backend, file, database);
  migration(backend, PHASE2B_FILES[0], database, false);
  for (const file of PHASE2B_FILES.slice(1)) migration(backend, file, database);
  for (const file of PHASE2B1B1_FILES) migration(backend, file, database);
  migration(backend, "202607140015_panel_sessions.up.sql", database);
  migration(backend, "202607140016_panel_session_handoffs.up.sql", database);
  migration(backend, "202607140017_panel_browser_bindings.up.sql", database);
}

function databasePool(backend, database = primaryDatabase) {
  if (
    backend.kind !== "native" ||
    backend.host !== backend.socketDirectory ||
    !path.isAbsolute(backend.socketDirectory)
  ) {
    connectionEvidence.externalNetworkAttempts += 1;
    connectionEvidence.productionConnectionAttempts += 1;
    throw new Error("disposable PostgreSQL must remain local");
  }
  const pool = new Pool({
    host: backend.socketDirectory,
    port: backend.port,
    user: workloadRole,
    database,
    max: 16,
    connectionTimeoutMillis: 2_000,
  });
  pool.on("error", () => undefined);
  return pool;
}

function dumpDatabase(backend, database) {
  return command(backend.executables.pg_dump, [
    "--host", backend.socketDirectory,
    "--port", String(backend.port),
    "--format=custom",
    "--dbname", database,
    "--username", "postgres",
  ], { binary: true }).stdout;
}

function restoreDatabaseDump(backend, database, dump) {
  command(backend.executables.pg_restore, [
    "--host", backend.socketDirectory,
    "--port", String(backend.port),
    "--exit-on-error",
    "--dbname", database,
    "--username", "postgres",
  ], { input: dump, binary: true });
}

function dataDump(backend) {
  return String(command(backend.executables.pg_dump, [
    "--host", backend.socketDirectory,
    "--port", String(backend.port),
    "--data-only",
    "--inserts",
    "--dbname", primaryDatabase,
    "--username", "postgres",
  ]).stdout || "");
}

function identityDependencies(pool, material, context, clock) {
  return {
    pool,
    stateDigester: createOpaqueStateDigester({ key: material.hmacKey, context }),
    payloadCipher: createAes256GcmPayloadCipher({
      currentKeyId: material.currentKeyId,
      resolveKey: (keyId) => material.keyring[keyId],
    }),
    timeouts: TIMEOUTS,
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
    timeouts: TIMEOUTS,
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: PANEL_ORIGIN,
  };
  const tenantRepository = new PostgresSaaSDataRepository(repositoryOptions);
  const tenantCore = createOwnerTenantCoreAdapter(createStarterTenantService({
    repository: tenantRepository,
    platformDomainSuffix: "celebix.site",
    panelBaseUrl: PANEL_ORIGIN,
  }));
  return {
    tenantRepository,
    service: createPersistentRegistrationCompletionService({
      workflowStore,
      tenantCore,
      recovery: new PostgresTenantOperationRecovery(repositoryOptions),
      panelOrigin: PANEL_ORIGIN,
      platformDomainSuffix: "celebix.site",
      clock,
      audit: () => undefined,
    }),
  };
}

class DeterministicOidcProvider {
  constructor(counters) {
    this.counters = counters;
  }

  buildAuthorizationUrl(input) {
    const url = new URL(PROVIDER_ISSUER + "/authorize");
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
    this.counters.providerExecutions += 1;
    const suffix = createHash("sha256").update(input.state).digest("hex");
    return {
      issuer: input.expectedIssuer,
      subject: "subject-" + suffix.slice(0, 24),
      audience: [input.expectedAudience],
      nonce: input.expectedNonce,
      email: "owner-" + suffix.slice(0, 12) + "@example.test",
      emailVerified: true,
      displayName: "Disposable Owner",
    };
  }
}

function withResponseUrl(response, url) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

function trackedIssuerPool(pool, counters) {
  return Object.freeze({
    async connect() {
      const client = await pool.connect();
      return Object.freeze({
        async query(text, values) {
          if (
            typeof text === "string" &&
            text.includes("saas.create_panel_session_handoff(")
          ) counters.issuerExecutions += 1;
          return client.query(text, values);
        },
        release(destroy) {
          client.release(destroy);
        },
      });
    },
  });
}

function unknownCommitPool(pool, failOnCommit) {
  let commits = 0;
  return Object.freeze({
    async connect() {
      const client = await pool.connect();
      return Object.freeze({
        async query(text, values) {
          if (text === "COMMIT") {
            const result = await client.query(text, values);
            commits += 1;
            if (commits === failOnCommit) {
              throw new Error("simulated response loss after forwarded commit");
            }
            return result;
          }
          return client.query(text, values);
        },
        release(destroy) {
          client.release(destroy);
        },
      });
    },
  });
}

function secretEncodings(bytes) {
  const buffer = Buffer.from(bytes);
  const hex = buffer.toString("hex");
  return ["\\x" + hex, hex, buffer.toString("base64"), buffer.toString("base64url")];
}

function createAuthorities(pool) {
  diagnosticStage = "identity_material";
  const clock = () => new Date();
  const counters = {
    registrationGate: 0,
    callbackGate: 0,
    providerExecutions: 0,
    issuerExecutions: 0,
    redeemerExecutions: 0,
    recoveryExecutions: 0,
    bindingFetches: 0,
    callbackFetches: 0,
    nonceCalls: 0,
    nonceBytes: 0,
  };
  const audits = [];
  const secretValues = new Set();
  const material = {
    hmacKey: new Uint8Array(randomBytes(32)),
    currentKeyId: "identity.current.v1",
    keyring: { "identity.current.v1": new Uint8Array(randomBytes(32)) },
  };
  const browserBootstrapKey = new Uint8Array(randomBytes(32));
  const browserBindingKey = new Uint8Array(randomBytes(32));
  const browserInternalSecret = new Uint8Array(randomBytes(32));
  const callbackInternalSecret = new Uint8Array(randomBytes(32));
  const handoffKey = new Uint8Array(randomBytes(32));
  const sessionKey = new Uint8Array(randomBytes(32));
  const handoffKeyId = "handoff.active.v1";
  const sessionKeyId = "panel.active.v1";
  const browserBootstrapKeyId = "browser.bootstrap.v1";
  const browserBindingKeyId = "browser.binding.v1";
  const browserInternalKeyId = "browser.internal.v1";
  const callbackInternalKeyId = "callback.internal.v1";
  const keyBytes = [
    material.hmacKey,
    material.keyring[material.currentKeyId],
    browserBootstrapKey,
    browserBindingKey,
    browserInternalSecret,
    callbackInternalSecret,
    handoffKey,
    sessionKey,
  ];

  const stateDigester = createOpaqueStateDigester({
    key: material.hmacKey,
    context: "registration-attempt-state",
  });
  const oidcStateDigester = createOpaqueStateDigester({
    key: material.hmacKey,
    context: "oidc-transaction-state",
  });
  diagnosticStage = "registration_store";
  const registrationStore = new PostgresRegistrationAttemptStore(
    identityDependencies(pool, material, "registration-attempt-state", clock),
    { panelOrigin: PANEL_ORIGIN, platformDomainSuffix: "celebix.site" },
    { oidcStateDigester },
  );
  diagnosticStage = "oidc_store";
  const oidcStore = new PostgresOidcTransactionStore(
    identityDependencies(pool, material, "oidc-transaction-state", clock),
  );
  diagnosticStage = "tenant_completion";
  const completion = completionService(registrationStore, pool, clock);
  const provider = new DeterministicOidcProvider(counters);
  diagnosticStage = "persistent_runtime";
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: registrationStore,
    oidcTransactionStore: oidcStore,
    registrationCompletion: completion.service,
    consumedCallbackRecovery: registrationStore,
    oidcProvider: provider,
    requestGate: Object.freeze({
      async verify(input) {
        if (input.kind === "registration_start") counters.registrationGate += 1;
        else counters.callbackGate += 1;
        return "allowed";
      },
    }),
    clock,
    audit(event) {
      audits.push(Object.freeze({ component: "runtime", ...event }));
    },
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 8_192 },
    registrationOrigin: OWNER_ORIGIN,
    callbackAuthority: CALLBACK_AUTHORITY,
    panelOrigin: PANEL_ORIGIN,
    platformDomainSuffix: "celebix.site",
    providerAuthority: {
      issuer: PROVIDER_ISSUER,
      audience: PROVIDER_AUDIENCE,
      authorizationOrigin: PROVIDER_ISSUER,
    },
  });
  diagnosticStage = "browser_codec";
  const browserCodec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([[browserBootstrapKeyId, browserBootstrapKey]]),
    activeBootstrapKeyId: browserBootstrapKeyId,
    browserBindingKeys: new Map([[browserBindingKeyId, browserBindingKey]]),
    activeBrowserBindingKeyId: browserBindingKeyId,
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
  });
  diagnosticStage = "browser_repository";
  const browserRepository = createPostgresPanelBrowserBindingRepository({
    pool,
    stateDigester,
    oidcStateDigester,
    credentialCodec: browserCodec,
    clock,
    timeouts: TIMEOUTS,
    audit(event) {
      audits.push(Object.freeze({ component: "browser_repository", ...event }));
    },
  });
  const handoffKeys = new Map([[handoffKeyId, handoffKey]]);
  const sessionKeys = new Map([[sessionKeyId, sessionKey]]);
  diagnosticStage = "owner_composition";
  const owner = createDisabledOwnerSelfServeAuthComposition({
    activationApproval: createOwnerSelfServeAuthCompositionApproval("disposable_test"),
    runtime,
    stateDigester,
    browserBindingCredentialCodec: browserCodec,
    browserBindingRepository: browserRepository,
    ownerInternalOrigin: OWNER_ORIGIN,
    browserBindingInternalKeys: new Map([[browserInternalKeyId, browserInternalSecret]]),
    sessionCompletionInternalKeys: new Map([[callbackInternalKeyId, callbackInternalSecret]]),
    browserBindingMaximumBodyBytes: 16_384,
    sessionCompletionMaximumBodyBytes: 16_384,
    clock,
    randomUuid: () => randomUUID(),
    randomNonceBytes(size) {
      counters.nonceCalls += 1;
      counters.nonceBytes = size;
      return new Uint8Array(randomBytes(size));
    },
    handoffIssuer: {
      pool: trackedIssuerPool(pool, counters),
      handoffKeys,
      activeHandoffKeyId: handoffKeyId,
      sessionTokenKeyId: sessionKeyId,
      randomBytes: (size) => new Uint8Array(randomBytes(size)),
      timeouts: TIMEOUTS,
      audit(event) {
        audits.push(Object.freeze({ component: "handoff_issuer", ...event }));
      },
    },
    bridgeAudit(event) {
      audits.push(Object.freeze({ component: "registration_bridge", ...event }));
    },
    browserBindingStartAudit(event) {
      audits.push(Object.freeze({ component: "browser_start", ...event }));
    },
    browserBindingGatewayAudit(event) {
      audits.push(Object.freeze({ component: "browser_gateway", ...event }));
    },
    initialCallbackAudit(event) {
      audits.push(Object.freeze({ component: "callback_handler", ...event }));
    },
    sessionHandoffGatewayAudit(event) {
      audits.push(Object.freeze({ component: "callback_gateway", ...event }));
    },
  });

  const transportMode = { loseCallbackResponseOnce: false };
  const injectedFetch = async (request) => {
    const url = new URL(request.url);
    if (url.origin !== OWNER_ORIGIN) {
      connectionEvidence.externalNetworkAttempts += 1;
      throw new Error("external network forbidden");
    }
    if (url.pathname === BROWSER_INTERNAL_PATH) {
      counters.bindingFetches += 1;
      return withResponseUrl(await owner.browserBindingInternalGateway(request), request.url);
    }
    if (url.pathname === CALLBACK_INTERNAL_PATH) {
      counters.callbackFetches += 1;
      const response = await owner.sessionHandoffInternalGateway(request);
      if (transportMode.loseCallbackResponseOnce) {
        transportMode.loseCallbackResponseOnce = false;
        throw new Error("simulated Owner response loss");
      }
      return withResponseUrl(response, request.url);
    }
    connectionEvidence.externalNetworkAttempts += 1;
    throw new Error("unexpected internal route");
  };

  const makeTrackedRedeemer = (redeemer, localCounters = counters) => Object.freeze({
    async redeemHandoff(input) {
      localCounters.redeemerExecutions += 1;
      secretValues.add(input.credential);
      return redeemer.redeemHandoff(input);
    },
    async recoverRedemption(input) {
      localCounters.recoveryExecutions += 1;
      secretValues.add(input.credential);
      return redeemer.recoverRedemption(input);
    },
  });
  const createRealRedeemer = (redeemerPool = pool) => createPostgresPanelSessionHandoffRedeemer(
    createCustomerHandoffApproval("disposable_test"),
    {
      pool: redeemerPool,
      handoffKeys,
      sessionKeys,
      clock,
      timeouts: TIMEOUTS,
      audit(event) {
        audits.push(Object.freeze({ component: "handoff_redeemer", ...event }));
      },
    },
  );
  const makeCustomerComposition = (handoffRedeemer) => createDisabledCustomerPanelAuthComposition({
    activationApproval: createCustomerPanelAuthCompositionApproval("disposable_test"),
    ownerInternalOrigin: OWNER_ORIGIN,
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    clock,
    fetch: injectedFetch,
    browserBinding: {
      activeKeyId: browserInternalKeyId,
      activeSecret: browserInternalSecret,
      maximumBodyBytes: 16_384,
      deadlineMs: 2_000,
      maximumResponseBytes: 16_384,
      transportAudit(event) {
        audits.push(Object.freeze({ component: "browser_transport", ...event }));
      },
      handlerAudit(event) {
        audits.push(Object.freeze({ component: "browser_handler", ...event }));
      },
    },
    sessionCompletion: {
      activeKeyId: callbackInternalKeyId,
      activeSecret: callbackInternalSecret,
      maximumQueryBytes: 8_192,
      deadlineMs: 2_000,
      maximumResponseBytes: 4_096,
      transportAudit(event) {
        audits.push(Object.freeze({ component: "session_transport", ...event }));
      },
      handlerAudit(event) {
        audits.push(Object.freeze({ component: "session_handler", ...event }));
      },
    },
    handoffRedeemer,
  });
  diagnosticStage = "customer_redeemer";
  const realRedeemer = createRealRedeemer();
  diagnosticStage = "customer_composition";
  let customer;
  try {
    customer = makeCustomerComposition(makeTrackedRedeemer(realRedeemer));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    diagnosticCode = /^[a-z0-9_:-]{1,96}$/.test(message) ? message : "redacted";
    throw error;
  }
  const makeSessionRepository = (repositoryPool) => createPostgresPanelSessionRepository(
    createPanelSessionPersistenceApproval("disposable_test"),
    {
      pool: repositoryPool,
      keys: sessionKeys,
      activeKeyId: sessionKeyId,
      clock,
      randomBytes: (size) => new Uint8Array(randomBytes(size)),
      timeouts: TIMEOUTS,
      cleanupLimit: 100,
      audit(event) {
        audits.push(Object.freeze({ component: "session_repository", ...event }));
      },
    },
  );

  diagnosticStage = "composition_complete";
  return {
    runtime,
    registrationStore,
    oidcStore,
    tenantRepository: completion.tenantRepository,
    stateDigester,
    oidcStateDigester,
    browserRepository,
    owner,
    customer,
    counters,
    audits,
    secretValues,
    keyBytes,
    sessionKeys,
    sessionKeyId,
    transportMode,
    makeSessionRepository,
    createRealRedeemer,
    makeTrackedRedeemer,
    makeCustomerComposition,
  };
}

function decodeAttribute(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function exactBridgeForm(html) {
  assert.equal((html.match(/<form\b/g) || []).length, 1);
  const form = html.match(/<form method="post" action="([^"]+)" enctype="([^"]+)" accept-charset="([^"]+)" autocomplete="([^"]+)">/);
  assert.ok(form);
  const fields = [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)];
  return Object.freeze({
    method: "post",
    action: form[1],
    enctype: form[2],
    acceptCharset: form[3],
    autocomplete: form[4],
    fields: Object.freeze(fields.map((field) => Object.freeze({
      name: field[1],
      value: decodeAttribute(field[2]),
    }))),
  });
}

function cookieValue(response, name) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(name + "="));
  assert.ok(cookie);
  const end = cookie.indexOf(";");
  return cookie.slice(name.length + 1, end);
}

function persistentCookieCount(response) {
  return response.headers.getSetCookie()
    .filter((value) => value.startsWith("__Host-celebix_panel=")).length;
}

function countRows(backend, table) {
  assert.match(table, /^[a-z_]+$/);
  return Number(psql(backend, "SELECT count(*) FROM saas." + table + ";"));
}

async function startRegistration(authorities, slug) {
  const response = await authorities.owner.browserBoundRegistrationHandler(new Request(
    OWNER_ORIGIN + "/api/self-serve/register",
    {
      method: "POST",
      headers: {
        origin: OWNER_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        storeName: "Disposable " + slug,
        storeSlug: slug,
        marketingConsent: false,
        privacyConsent: true,
      }),
    },
  ));
  const html = await response.clone().text();
  const form = exactBridgeForm(html);
  const bootstrapCredential = form.fields.find((field) => field.name === "bootstrapCredential")?.value;
  const providerAuthorizationUrl = form.fields.find((field) => field.name === "providerAuthorizationUrl")?.value;
  assert.ok(bootstrapCredential);
  assert.ok(providerAuthorizationUrl);
  const state = new URL(providerAuthorizationUrl).searchParams.get("state");
  assert.ok(state);
  for (const secret of [bootstrapCredential, providerAuthorizationUrl, state]) {
    authorities.secretValues.add(secret);
  }
  return {
    slug,
    response,
    html,
    form,
    bootstrapCredential,
    providerAuthorizationUrl,
    state,
  };
}

async function submitBootstrap(authorities, flow, customer = authorities.customer) {
  const body = new URLSearchParams({
    bootstrapCredential: flow.bootstrapCredential,
    providerAuthorizationUrl: flow.providerAuthorizationUrl,
  }).toString();
  const response = await customer.browserBootstrapHandler(new Request(BOOTSTRAP_AUTHORITY, {
    method: "POST",
    headers: { origin: OWNER_ORIGIN, "content-type": "application/x-www-form-urlencoded" },
    body,
  }));
  const browserBindingCredential = response.status === 303
    ? cookieValue(response, "__Host-celebix_panel_pre_auth")
    : undefined;
  if (browserBindingCredential) authorities.secretValues.add(browserBindingCredential);
  return { ...flow, bootstrapResponse: response, browserBindingCredential };
}

async function createBoundFlow(authorities, slug) {
  return submitBootstrap(authorities, await startRegistration(authorities, slug));
}

function callbackRequest(flow, credential = flow.browserBindingCredential) {
  const headers = credential
    ? { cookie: "__Host-celebix_panel_pre_auth=" + credential }
    : undefined;
  return new Request(
    CALLBACK_AUTHORITY + "?state=" + encodeURIComponent(flow.state) + "&code=valid-code",
    { headers },
  );
}

async function completeFlow(authorities, flow, customer = authorities.customer) {
  const response = await customer.panelSessionCompletionHandler(callbackRequest(flow));
  let sessionCredential;
  if (persistentCookieCount(response) === 1) {
    sessionCredential = cookieValue(response, "__Host-celebix_panel");
    authorities.secretValues.add(sessionCredential);
  }
  return { response, sessionCredential };
}

async function main() {
  assert.equal(SCENARIOS.length, 40);
  let executed = 0;
  const evidence = [];
  let activeScenario = null;
  let firstFailure = null;
  const scenario = async (name, proof) => {
    activeScenario = name;
    try {
      await proof();
      executed += 1;
      evidence.push(name);
      activeScenario = null;
    } catch (error) {
      firstFailure = name;
      throw error;
    }
  };

  let backend;
  let temporaryDirectory;
  const pools = [];
  let runError;
  let authorities;
  let primaryPool;
  let primaryFlow;
  let primaryStateDigest;
  let primaryOidcDigest;
  let primaryCompletion;
  let primaryResolution;
  let primaryCounts;
  let missingCookieCounts;
  let wrongCookieCounts;
  let concurrentResult;
  let providerErrorResult;
  let recoveryCount = 0;
  let backup;
  let restoredResolution;

  try {
    await scenario(SCENARIOS[0], async () => {
      backend = startNativePostgres();
      temporaryDirectory = backend.temporaryDirectory;
      assert.equal(psql(backend, "SHOW server_version;", "postgres"), "16.14");
      psql(backend, "CREATE DATABASE " + primaryDatabase + ";", "postgres");
      applyAll(backend, primaryDatabase);
      assert.equal(
        psql(backend, "SELECT to_regclass('saas.panel_browser_bindings') IS NOT NULL;"),
        "t",
      );
      psql(
        backend,
        "CREATE ROLE " + workloadRole +
          " LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;" +
          " GRANT celebix_saas_identity, celebix_saas_bootstrap TO " + workloadRole + ";",
        "postgres",
      );
      primaryPool = databasePool(backend);
      pools.push(primaryPool);
    });

    await scenario(SCENARIOS[1], async () => {
      for (const file of MANIFESTS) {
        const manifest = JSON.parse(readFileSync(path.join(SQL_DIRECTORY, file), "utf8"));
        assert.equal(manifest.postgresqlMajor, 16);
        for (const artifact of manifest.artifacts) {
          const actual = createHash("sha256")
            .update(readFileSync(path.join(SQL_DIRECTORY, artifact.file)))
            .digest("hex");
          assert.equal(actual, artifact.sha256);
        }
      }
    });

    await scenario(SCENARIOS[2], async () => {
      const mountedRoutes = [
        [
          "apps/owner/app/api/self-serve/register/route.ts",
          "getDefaultOwnerSelfServeAuthRouteSet",
        ],
        [
          "apps/owner/app/api/internal/self-serve/browser-binding/route.ts",
          "getDefaultOwnerSelfServeAuthRouteSet",
        ],
        [
          "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
          "getDefaultOwnerSelfServeAuthRouteSet",
        ],
        [
          "apps/customer-panel/app/auth/bootstrap/route.ts",
          "getDefaultCustomerPanelAuthRouteSet",
        ],
        [
          "apps/customer-panel/app/auth/callback/route.ts",
          "getDefaultCustomerPanelAuthRouteSet",
        ],
      ];
      for (const [relativePath, defaultResolver] of mountedRoutes) {
        const absolutePath = path.join(ROOT, relativePath);
        assert.equal(existsSync(absolutePath), true);
        const source = readFileSync(absolutePath, "utf8");
        const imports = source.match(/^import[^;]+;$/gm) ?? [];
        assert.equal(imports.length, 1);
        assert.match(imports[0], new RegExp(
          `^import \\{ ${defaultResolver} \\} from ".+auth-route-mount/route-set\\.ts";$`,
        ));
        assert.doesNotMatch(
          source,
          /auth-composition|process\.env|postgres|pg\b|secret|keyring|clientSecret|HMAC|encryption|approved_staging/i,
        );
      }
      const { getDefaultOwnerSelfServeAuthRouteSet } = await import(
        "../../../apps/owner/lib/self-serve-auth-route-mount/route-set.ts"
      );
      const { getDefaultCustomerPanelAuthRouteSet } = await import(
        "../../../apps/customer-panel/lib/panel-auth-route-mount/route-set.ts"
      );
      const defaultOwnerRouteSet = getDefaultOwnerSelfServeAuthRouteSet();
      const defaultCustomerRouteSet = getDefaultCustomerPanelAuthRouteSet();
      assert.equal(defaultOwnerRouteSet.readiness.mode, "disabled");
      assert.equal(defaultCustomerRouteSet.readiness.mode, "disabled");
      assert.equal(defaultOwnerRouteSet.readiness.productionActivation, "forbidden");
      assert.equal(defaultCustomerRouteSet.readiness.productionActivation, "forbidden");
      const registrationOrchestrator = readFileSync(
        path.join(ROOT, "apps/owner/lib/self-serve-registration-orchestrator.ts"),
        "utf8",
      );
      assert.doesNotMatch(registrationOrchestrator, /SELF_SERVE_SAAS_REGISTRATION_ENABLED/);
      assert.match(registrationOrchestrator, /resolveOwnerStagingAuthMode/);
      assert.match(registrationOrchestrator, /parseOwnerStagingAuthConfig/);
      assert.match(registrationOrchestrator, /export function resolveSelfServeRegistrationUiEnabled/);
      const { resolveSelfServeRegistrationUiEnabled } = await import(
        "../../../apps/owner/lib/self-serve-registration-orchestrator.ts"
      );
      assert.equal(resolveSelfServeRegistrationUiEnabled({}), false);
      assert.equal(resolveSelfServeRegistrationUiEnabled({
        CELEBIX_SAAS_AUTH_MODE: "approved_staging",
      }), false);
      assert.equal(resolveSelfServeRegistrationUiEnabled({
        CELEBIX_SAAS_AUTH_MODE: "approved_staging",
        CELEBIX_DEPLOYMENT_TIER: "production",
      }), false);
      assert.match(
        readFileSync(path.join(ROOT, "apps/customer-panel/lib/config.ts"), "utf8"),
        /CUSTOMER_PANEL_AUTH_ENABLED = false/,
      );
    });

    await scenario(SCENARIOS[3], async () => {
      authorities = createAuthorities(primaryPool);
      assertDisabledOwnerSelfServeAuthComposition(authorities.owner);
      assertDisabledCustomerPanelAuthComposition(authorities.customer);
      assert.deepEqual(Object.keys(authorities.owner), [
        "browserBoundRegistrationHandler",
        "browserBindingInternalGateway",
        "sessionHandoffInternalGateway",
        "readiness",
      ]);
      assert.deepEqual(Object.keys(authorities.customer), [
        "browserBootstrapHandler",
        "panelSessionCompletionHandler",
        "readiness",
      ]);
      assert.equal(authorities.owner.readiness.productionActivation, "forbidden");
      assert.equal(authorities.customer.readiness.productionActivation, "forbidden");
    });

    await scenario(SCENARIOS[4], async () => {
      primaryFlow = await startRegistration(authorities, "auth-composition-primary");
      assert.equal(primaryFlow.response.status, 200);
      assert.match(primaryFlow.bootstrapCredential, /^bs1\.[A-Za-z0-9._-]+\.[A-Za-z0-9_-]{43}$/);
      assert.equal(new URL(primaryFlow.providerAuthorizationUrl).searchParams.get("state"), primaryFlow.state);
    });

    await scenario(SCENARIOS[5], async () => {
      assert.equal(authorities.counters.registrationGate, 1);
      assert.equal(authorities.counters.callbackGate, 0);
    });

    await scenario(SCENARIOS[6], async () => {
      primaryStateDigest = authorities.stateDigester.digest(primaryFlow.state);
      primaryOidcDigest = authorities.oidcStateDigester.digest(primaryFlow.state);
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.registration_workflows WHERE state_digest='" +
            primaryStateDigest + "' AND status='awaiting_identity';",
        ),
        "1",
      );
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.oidc_transactions WHERE state_digest='" +
            primaryOidcDigest + "' AND status='active';",
        ),
        "1",
      );
      assert.equal(countRows(backend, "registration_workflows"), 1);
      assert.equal(countRows(backend, "oidc_transactions"), 1);
    });

    await scenario(SCENARIOS[7], async () => {
      assert.equal(primaryFlow.response.status, 200);
      assert.equal(primaryFlow.response.headers.get("content-type"), "text/html; charset=utf-8");
      assert.match(primaryFlow.html, /^<!doctype html>/);
    });

    await scenario(SCENARIOS[8], async () => {
      assert.equal(primaryFlow.response.headers.get("cache-control"), "no-store, max-age=0");
      assert.equal(primaryFlow.response.headers.get("pragma"), "no-cache");
      assert.equal(primaryFlow.response.headers.get("expires"), "0");
      assert.equal(primaryFlow.response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(primaryFlow.response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(primaryFlow.response.headers.get("x-frame-options"), "DENY");
      assert.equal(primaryFlow.response.headers.get("cross-origin-opener-policy"), "same-origin");
      assert.equal(primaryFlow.response.headers.get("cross-origin-resource-policy"), "same-origin");
    });

    await scenario(SCENARIOS[9], async () => {
      assert.equal(primaryFlow.response.headers.has("set-cookie"), false);
      assert.equal(primaryFlow.response.headers.has("location"), false);
      assert.equal(primaryFlow.response.headers.has("refresh"), false);
    });

    await scenario(SCENARIOS[10], async () => {
      const csp = primaryFlow.response.headers.get("content-security-policy");
      const match = csp?.match(/script-src 'nonce-([A-Za-z0-9_-]{32})'/);
      assert.ok(match);
      assert.equal(authorities.counters.nonceCalls, 1);
      assert.equal(authorities.counters.nonceBytes, 24);
      assert.equal(
        primaryFlow.html.includes(
          "<script nonce=\"" + match[1] + "\">document.forms[0].submit();</script>",
        ),
        true,
      );
      assert.equal(csp.includes("unsafe-inline"), false);
      assert.equal(csp.includes("unsafe-eval"), false);
      assert.equal(csp.includes("*"), false);
    });

    await scenario(SCENARIOS[11], async () => {
      assert.equal(primaryFlow.form.method, "post");
      assert.equal(primaryFlow.form.action, BOOTSTRAP_AUTHORITY);
      assert.equal(primaryFlow.form.enctype, "application/x-www-form-urlencoded");
      assert.equal(primaryFlow.form.acceptCharset, "UTF-8");
      assert.equal(primaryFlow.form.autocomplete, "off");
    });

    await scenario(SCENARIOS[12], async () => {
      assert.deepEqual(
        primaryFlow.form.fields.map((field) => field.name),
        ["bootstrapCredential", "providerAuthorizationUrl"],
      );
      assert.equal(primaryFlow.form.fields.length, 2);
    });

    await scenario(SCENARIOS[13], async () => {
      const encoded = new URLSearchParams({
        bootstrapCredential: primaryFlow.bootstrapCredential,
        providerAuthorizationUrl: primaryFlow.providerAuthorizationUrl,
      }).toString();
      const decoded = new URLSearchParams(encoded);
      assert.equal(decoded.get("bootstrapCredential"), primaryFlow.bootstrapCredential);
      assert.equal(decoded.get("providerAuthorizationUrl"), primaryFlow.providerAuthorizationUrl);
      assert.equal(new URL(primaryFlow.providerAuthorizationUrl).toString(), primaryFlow.providerAuthorizationUrl);
    });

    await scenario(SCENARIOS[14], async () => {
      const headers = JSON.stringify([...primaryFlow.response.headers]);
      const audits = JSON.stringify(authorities.audits);
      for (const secret of [
        primaryFlow.state,
        primaryFlow.bootstrapCredential,
        primaryFlow.providerAuthorizationUrl,
      ]) {
        assert.equal(headers.includes(secret), false);
        assert.equal(audits.includes(secret), false);
      }
      assert.equal(primaryFlow.response.headers.get("content-type")?.includes("json"), false);
    });

    await scenario(SCENARIOS[15], async () => {
      primaryFlow = await submitBootstrap(authorities, primaryFlow);
      assert.equal(primaryFlow.bootstrapResponse.status, 303);
      assert.equal(await primaryFlow.bootstrapResponse.clone().text(), "");
      assert.equal(authorities.counters.bindingFetches, 1);
    });

    await scenario(SCENARIOS[16], async () => {
      const cookie = primaryFlow.bootstrapResponse.headers.getSetCookie()[0];
      assert.match(
        cookie,
        /^__Host-celebix_panel_pre_auth=pb1\.[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=\d+$/,
      );
      assert.match(primaryFlow.browserBindingCredential, /^pb1\.[A-Za-z0-9_-]{43}$/);
    });

    await scenario(SCENARIOS[17], async () => {
      assert.equal(
        primaryFlow.bootstrapResponse.headers.get("location"),
        primaryFlow.providerAuthorizationUrl,
      );
      assert.equal(
        primaryFlow.bootstrapResponse.headers.get("location")
          .includes(primaryFlow.browserBindingCredential),
        false,
      );
      const digest = createHash("sha256")
        .update(primaryFlow.providerAuthorizationUrl, "utf8")
        .digest("hex");
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.panel_browser_bindings WHERE authorization_url_digest='" +
            digest + "' AND version=2;",
        ),
        "1",
      );
    });

    await scenario(SCENARIOS[18], async () => {
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.registration_workflows WHERE state_digest='" +
            primaryStateDigest + "' AND status='awaiting_identity';",
        ),
        "1",
      );
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.oidc_transactions WHERE state_digest='" +
            primaryOidcDigest + "' AND status='active';",
        ),
        "1",
      );
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.panel_browser_bindings WHERE state_digest='" +
            primaryStateDigest + "' AND oidc_state_digest='" + primaryOidcDigest +
            "' AND version=2;",
        ),
        "1",
      );
    });

    await scenario(SCENARIOS[19], async () => {
      primaryCompletion = await completeFlow(authorities, primaryFlow);
      assert.equal(primaryCompletion.response.status, 303);
      assert.equal(primaryCompletion.response.headers.get("location"), PANEL_ORIGIN + "/");
      assert.equal(authorities.counters.providerExecutions, 1);
      assert.equal(authorities.counters.issuerExecutions, 1);
      assert.equal(authorities.counters.redeemerExecutions, 1);
    });

    await scenario(SCENARIOS[20], async () => {
      const cookie = primaryCompletion.response.headers.getSetCookie()
        .find((value) => value.startsWith("__Host-celebix_panel="));
      assert.match(
        cookie,
        /^__Host-celebix_panel=v1\.[A-Za-z0-9._-]+\.[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=\d+$/,
      );
      assert.ok(primaryCompletion.sessionCredential);
    });

    await scenario(SCENARIOS[21], async () => {
      assert.equal(
        primaryCompletion.response.headers.getSetCookie().includes(PRE_AUTH_DELETION_COOKIE),
        true,
      );
    });

    await scenario(SCENARIOS[22], async () => {
      primaryResolution = await authorities.makeSessionRepository(primaryPool).resolveSession({
        credential: primaryCompletion.sessionCredential,
        requestId: "phase2b2b2b-primary",
        now: new Date(),
      });
      assert.equal(primaryResolution.kind, "resolved");
      assert.equal(primaryResolution.tenantContext.store.slug, "auth-composition-primary");
      assert.equal(primaryResolution.tenantContext.membership.role, "store_owner");
    });

    await scenario(SCENARIOS[23], async () => {
      primaryCounts = {
        tenant: countRows(backend, "tenant_operations"),
        store: countRows(backend, "stores"),
        membership: countRows(backend, "memberships"),
        handoff: countRows(backend, "panel_session_handoffs"),
        session: countRows(backend, "panel_sessions"),
      };
      assert.deepEqual(primaryCounts, {
        tenant: 1,
        store: 1,
        membership: 1,
        handoff: 1,
        session: 1,
      });
    });

    await scenario(SCENARIOS[24], async () => {
      const response = await authorities.customer.browserBootstrapHandler(new Request(
        BOOTSTRAP_AUTHORITY,
        {
          method: "POST",
          headers: { origin: OWNER_ORIGIN, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            bootstrapCredential: primaryFlow.bootstrapCredential,
            providerAuthorizationUrl: primaryFlow.providerAuthorizationUrl,
          }).toString(),
        },
      ));
      assert.notEqual(response.status, 303);
      assert.equal(response.headers.has("location"), false);
      assert.equal(response.headers.has("set-cookie"), false);
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.panel_browser_bindings WHERE state_digest='" +
            primaryStateDigest + "';",
        ),
        "1",
      );
    });

    await scenario(SCENARIOS[25], async () => {
      const flow = await createBoundFlow(authorities, "auth-missing-cookie");
      const before = {
        provider: authorities.counters.providerExecutions,
        issuer: authorities.counters.issuerExecutions,
        redeemer: authorities.counters.redeemerExecutions,
        fetch: authorities.counters.callbackFetches,
      };
      const response = await authorities.customer.panelSessionCompletionHandler(
        callbackRequest(flow, ""),
      );
      missingCookieCounts = {
        provider: authorities.counters.providerExecutions - before.provider,
        issuer: authorities.counters.issuerExecutions - before.issuer,
        redeemer: authorities.counters.redeemerExecutions - before.redeemer,
      };
      assert.deepEqual(missingCookieCounts, { provider: 0, issuer: 0, redeemer: 0 });
      assert.equal(authorities.counters.callbackFetches - before.fetch, 0);
      assert.equal(response.headers.has("location"), false);
      assert.equal(persistentCookieCount(response), 0);
    });

    await scenario(SCENARIOS[26], async () => {
      const flow = await createBoundFlow(authorities, "auth-wrong-cookie");
      const wrong = "pb1." + randomBytes(32).toString("base64url");
      authorities.secretValues.add(wrong);
      const before = {
        provider: authorities.counters.providerExecutions,
        issuer: authorities.counters.issuerExecutions,
        redeemer: authorities.counters.redeemerExecutions,
      };
      const response = await authorities.customer.panelSessionCompletionHandler(
        callbackRequest(flow, wrong),
      );
      wrongCookieCounts = {
        provider: authorities.counters.providerExecutions - before.provider,
        issuer: authorities.counters.issuerExecutions - before.issuer,
        redeemer: authorities.counters.redeemerExecutions - before.redeemer,
      };
      assert.deepEqual(wrongCookieCounts, { provider: 0, issuer: 0, redeemer: 0 });
      assert.equal(response.headers.has("location"), false);
      assert.equal(persistentCookieCount(response), 0);
    });

    await scenario(SCENARIOS[27], async () => {
      const flow = await createBoundFlow(authorities, "auth-stolen-callback");
      const sessionsBefore = countRows(backend, "panel_sessions");
      const response = await authorities.customer.panelSessionCompletionHandler(
        callbackRequest(flow, ""),
      );
      assert.equal(countRows(backend, "panel_sessions"), sessionsBefore);
      assert.equal(persistentCookieCount(response), 0);
      assert.equal(response.headers.has("location"), false);
    });

    await scenario(SCENARIOS[28], async () => {
      const flowA = await createBoundFlow(authorities, "auth-cross-state-a");
      const flowB = await createBoundFlow(authorities, "auth-cross-state-b");
      const before = {
        provider: authorities.counters.providerExecutions,
        issuer: authorities.counters.issuerExecutions,
        redeemer: authorities.counters.redeemerExecutions,
        sessions: countRows(backend, "panel_sessions"),
      };
      const response = await authorities.customer.panelSessionCompletionHandler(
        callbackRequest(flowA, flowB.browserBindingCredential),
      );
      assert.equal(authorities.counters.providerExecutions - before.provider, 0);
      assert.equal(authorities.counters.issuerExecutions - before.issuer, 0);
      assert.equal(authorities.counters.redeemerExecutions - before.redeemer, 0);
      assert.equal(countRows(backend, "panel_sessions"), before.sessions);
      assert.equal(response.headers.has("location"), false);
    });

    await scenario(SCENARIOS[29], async () => {
      const flow = await createBoundFlow(authorities, "auth-concurrent-callback");
      const sessionsBefore = countRows(backend, "panel_sessions");
      const responses = await Promise.all([
        authorities.customer.panelSessionCompletionHandler(callbackRequest(flow)),
        authorities.customer.panelSessionCompletionHandler(callbackRequest(flow)),
      ]);
      const sessionResponses = responses.filter((response) => persistentCookieCount(response) === 1);
      assert.equal(sessionResponses.length, 1);
      assert.equal(countRows(backend, "panel_sessions") - sessionsBefore, 1);
      concurrentResult = {
        sessionResponses: 1,
        sessionRowsCreated: 1,
      };
    });

    await scenario(SCENARIOS[30], async () => {
      const flow = await createBoundFlow(authorities, "auth-provider-error");
      const handoffsBefore = countRows(backend, "panel_session_handoffs");
      const sessionsBefore = countRows(backend, "panel_sessions");
      const response = await authorities.customer.panelSessionCompletionHandler(new Request(
        CALLBACK_AUTHORITY + "?state=" + encodeURIComponent(flow.state) +
          "&error=access_denied&error_description=private",
        { headers: { cookie: "__Host-celebix_panel_pre_auth=" + flow.browserBindingCredential } },
      ));
      assert.equal(countRows(backend, "panel_session_handoffs"), handoffsBefore);
      assert.equal(countRows(backend, "panel_sessions"), sessionsBefore);
      assert.equal(persistentCookieCount(response), 0);
      assert.equal(response.headers.has("location"), false);
      providerErrorResult = { handoffsCreated: 0, sessionsCreated: 0 };
    });

    await scenario(SCENARIOS[31], async () => {
      const flow = await createBoundFlow(authorities, "auth-owner-response-loss");
      const fetchesBefore = authorities.counters.callbackFetches;
      const redemptionsBefore = authorities.counters.redeemerExecutions;
      const sessionsBefore = countRows(backend, "panel_sessions");
      authorities.transportMode.loseCallbackResponseOnce = true;
      const response = await authorities.customer.panelSessionCompletionHandler(
        callbackRequest(flow),
      );
      assert.equal(response.status, 503);
      assert.equal(authorities.counters.callbackFetches - fetchesBefore, 1);
      assert.equal(authorities.counters.redeemerExecutions - redemptionsBefore, 0);
      assert.equal(countRows(backend, "panel_sessions"), sessionsBefore);
      assert.equal(persistentCookieCount(response), 0);
    });

    await scenario(SCENARIOS[32], async () => {
      const flow = await createBoundFlow(authorities, "auth-redemption-unknown");
      const localCounters = { redeemerExecutions: 0, recoveryExecutions: 0 };
      const commitUnknownRedeemer = authorities.createRealRedeemer(
        unknownCommitPool(primaryPool, 2),
      );
      const customer = authorities.makeCustomerComposition(
        authorities.makeTrackedRedeemer(commitUnknownRedeemer, localCounters),
      );
      assertDisabledCustomerPanelAuthComposition(customer);
      const result = await completeFlow(authorities, flow, customer);
      assert.equal(result.response.status, 303);
      assert.equal(localCounters.redeemerExecutions, 1);
      assert.equal(localCounters.recoveryExecutions, 1);
      assert.equal(persistentCookieCount(result.response), 1);
      recoveryCount = localCounters.recoveryExecutions;
    });

    await scenario(SCENARIOS[33], async () => {
      const dump = dataDump(backend);
      const candidates = new Set(authorities.secretValues);
      for (const bytes of authorities.keyBytes) {
        for (const value of secretEncodings(bytes)) candidates.add(value);
      }
      for (const secret of candidates) {
        if (typeof secret === "string" && secret.length >= 16) {
          assert.equal(dump.includes(secret), false);
        }
      }
    });

    await scenario(SCENARIOS[34], async () => {
      const serialized = JSON.stringify(authorities.audits);
      for (const secret of authorities.secretValues) {
        assert.equal(serialized.includes(secret), false);
      }
    });

    await scenario(SCENARIOS[35], async () => {
      const cleanup = await authorities.browserRepository.cleanupExpired({
        now: new Date(),
        limit: 100,
      });
      assert.deepEqual(cleanup, { kind: "cleaned", count: 0 });
      const before = {
        provider: authorities.counters.providerExecutions,
        issuer: authorities.counters.issuerExecutions,
        redeemer: authorities.counters.redeemerExecutions,
      };
      const replay = await authorities.customer.panelSessionCompletionHandler(
        callbackRequest(primaryFlow),
      );
      assert.equal(replay.status, 409);
      assert.equal(authorities.counters.providerExecutions - before.provider, 0);
      assert.equal(authorities.counters.issuerExecutions - before.issuer, 0);
      assert.equal(authorities.counters.redeemerExecutions - before.redeemer, 0);
      assert.equal(
        psql(
          backend,
          "SELECT count(*) FROM saas.panel_browser_bindings WHERE state_digest='" +
            primaryStateDigest + "' AND version=3 AND callback_claimed_at IS NOT NULL;",
        ),
        "1",
      );
    });

    await scenario(SCENARIOS[36], async () => {
      backup = dumpDatabase(backend, primaryDatabase);
      assert.ok(backup instanceof Buffer || backup instanceof Uint8Array);
      assert.ok(backup.byteLength > 0);
    });

    await scenario(SCENARIOS[37], async () => {
      psql(backend, "CREATE DATABASE " + restoreDatabase + ";", "postgres");
      restoreDatabaseDump(backend, restoreDatabase, backup);
      const restorePool = databasePool(backend, restoreDatabase);
      pools.push(restorePool);
      restoredResolution = await authorities.makeSessionRepository(restorePool).resolveSession({
        credential: primaryCompletion.sessionCredential,
        requestId: "phase2b2b2b-restored",
        now: new Date(),
      });
      assert.equal(restoredResolution.kind, "resolved");
      assert.equal(restoredResolution.tenantContext.store.slug, "auth-composition-primary");
      assert.equal(restoredResolution.tenantContext.membership.role, "store_owner");
      assert.equal(
        psql(backend, "SELECT count(*) FROM saas.panel_sessions;", restoreDatabase),
        psql(backend, "SELECT count(*) FROM saas.panel_sessions;", primaryDatabase),
      );
    });

    await scenario(SCENARIOS[38], async () => {
      assert.equal(connectionEvidence.externalNetworkAttempts, 0);
      assert.equal(connectionEvidence.productionConnectionAttempts, 0);
      assert.equal(connectionEvidence.providerNetworkAttempts, 0);
      assert.equal(backend.host, backend.socketDirectory);
      assert.equal(path.isAbsolute(backend.socketDirectory), true);
    });
  } catch (error) {
    runError = error;
  } finally {
    await Promise.all(pools.map((pool) => pool.end().catch(() => undefined)));
    try {
      stopNativePostgres(backend);
    } catch (error) {
      if (!runError) {
        runError = error;
        firstFailure = activeScenario || SCENARIOS[39];
      }
    }
  }

  if (runError) {
    process.stderr.write(JSON.stringify({
      status: "FAIL",
      firstFailure: firstFailure || activeScenario || "harness_setup",
      executed,
      diagnosticStage,
      diagnosticCode,
      cleanup: temporaryDirectory ? !existsSync(temporaryDirectory) : false,
    }, null, 2) + "\n");
    process.exitCode = 1;
    return;
  }

  try {
    await scenario(SCENARIOS[39], async () => {
      assert.equal(backend.started, false);
      assert.equal(existsSync(temporaryDirectory), false);
      assert.equal(existsSync(backend.socketDirectory), false);
    });
  } catch {
    process.stderr.write(JSON.stringify({
      status: "FAIL",
      firstFailure: firstFailure || SCENARIOS[39],
      executed,
      cleanup: false,
    }, null, 2) + "\n");
    process.exitCode = 1;
    return;
  }

  assert.equal(executed, 40);
  process.stdout.write(JSON.stringify({
    status: "PASS",
    backend: "native-postgresql",
    postgresqlVersion: "16.14",
    scenarioFunctionExecutions: 40,
    scenarios: 40,
    executed,
    passed: executed,
    failed: 0,
    registrationOidcRows: { registration: 1, oidc: 1 },
    browserBindingRows: 1,
    handoffRows: primaryCounts.handoff,
    sessionRows: primaryCounts.session,
    tenantStoreMembershipRows: {
      tenant: primaryCounts.tenant,
      store: primaryCounts.store,
      membership: primaryCounts.membership,
    },
    tenantContext: primaryResolution.kind === "resolved" ? "PASS" : "FAIL",
    missingCookieCounts,
    wrongCookieCounts,
    concurrentResult,
    providerErrorResult,
    commitUnknownRecoveryCount: recoveryCount,
    rawScans: "PASS",
    auditRedaction: "PASS",
    backup: "PASS",
    restore: "PASS",
    restoredTenantContext: restoredResolution.kind === "resolved" ? "PASS" : "FAIL",
    externalNetworkAttempts: connectionEvidence.externalNetworkAttempts,
    providerNetworkAttempts: connectionEvidence.providerNetworkAttempts,
    productionConnectionAttempts: connectionEvidence.productionConnectionAttempts,
    productionConnectionUsed: false,
    cleanup: "PASS",
    evidence,
  }, null, 2) + "\n");
}

await main().catch(() => {
  process.stderr.write(JSON.stringify({
    status: "FAIL",
    firstFailure: "harness_unclassified",
    executed: 0,
  }) + "\n");
  process.exitCode = 1;
});
