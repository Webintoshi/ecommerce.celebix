import { randomBytes, randomUUID } from "node:crypto";

import pg from "pg";
import { PostgresSaaSDataRepository, PostgresTenantOperationRecovery } from "@celebix/saas-data";
import { createStarterTenantService } from "@celebix/saas-tenant-core";

import { createOwnerSelfServeAuthCompositionApproval } from "../self-serve-auth-composition/activation.ts";
import { createDisabledOwnerSelfServeAuthComposition } from "../self-serve-auth-composition/composition.ts";
import { createOwnerSelfServeAuthRouteMountApproval } from "../self-serve-auth-route-mount/activation.ts";
import {
  createApprovedStagingOwnerSelfServeAuthRouteSet,
  type OwnerSelfServeAuthRouteSet,
} from "../self-serve-auth-route-mount/route-set.ts";
import {
  createOwnerStagingDatabasePoolConfig,
  type OwnerStagingAuthConfig,
} from "../self-serve-auth-authority/config.ts";
import { createApprovedStagingSelfServeRequestGate } from "../self-serve-auth-authority/request-gate.ts";
import { createLogtoOidcProvider } from "../self-serve-logto-provider/provider.ts";
import { createPanelBrowserBindingAuthorityCodec } from "../panel-browser-binding/credential-codec.ts";
import { createPostgresPanelBrowserBindingRepository } from "../panel-browser-binding/postgres-repository.ts";
import { createPanelReturningLoginService } from "../panel-returning-login/service.ts";
import { createPostgresReturningPanelSessionIssuer } from "../panel-returning-login/postgres-session-issuer.ts";
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "../saas-persistence/identity-crypto.ts";
import { PostgresOidcTransactionStore } from "../saas-persistence/postgres-oidc-transaction-store.ts";
import { PostgresRegistrationAttemptStore } from "../saas-persistence/postgres-registration-attempt-store.ts";
import { createOwnerTenantCoreAdapter } from "../saas-tenant-core/adapter.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../self-serve-http/runtime.ts";
import { createPersistentRegistrationCompletionService } from "../self-serve-registration-completion.ts";
import { createOwnerStagingCallbackAudit, createOwnerStagingOidcAudit } from "./staging-callback-audit.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({
  poolCheckoutMs: 2_000,
  statementMs: 5_000,
  lockMs: 5_000,
  idleTransactionMs: 5_000,
});

async function preflight(pool: pg.Pool, databaseName: string): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      role.rolsuper AS is_superuser,
      pg_has_role(current_user, 'celebix_saas_identity', 'MEMBER') AS identity_member,
      pg_has_role(current_user, 'celebix_saas_bootstrap', 'MEMBER') AS bootstrap_member,
      to_regclass('saas.registration_workflows') IS NOT NULL AS workflows,
      to_regclass('saas.oidc_transactions') IS NOT NULL AS oidc_transactions,
      to_regclass('saas.registration_verified_identities') IS NOT NULL AS identities,
      to_regclass('saas.registration_tenant_completions') IS NOT NULL AS completions,
      to_regclass('saas.panel_browser_bindings') IS NOT NULL AS browser_bindings,
      to_regclass('saas.panel_session_handoffs') IS NOT NULL AS handoffs,
      to_regclass('saas.panel_sessions') IS NOT NULL AS sessions,
      to_regclass('saas.admin_domains') IS NOT NULL AS admin_domains,
      (SELECT count(DISTINCT proname) FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
       WHERE n.nspname='saas' AND proname IN (
         'create_panel_browser_bootstrap','bind_panel_browser_credential','claim_panel_browser_callback',
         'create_panel_session_handoff','redeem_panel_session_handoff','resolve_panel_session',
         'issue_returning_panel_session','recover_returning_panel_session',
         'issue_returning_panel_session_for_admin_host','recover_returning_panel_session_for_admin_host',
         'provision_canonical_admin_domain'
       )) = 11 AS required_functions
    FROM pg_roles AS role WHERE role.rolname = current_user`);
    const row = result.rows[0];
    if (!row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== databaseName ||
        row.is_superuser !== false || row.identity_member !== true || row.bootstrap_member !== true ||
        ["workflows", "oidc_transactions", "identities", "completions", "browser_bindings", "handoffs", "sessions", "admin_domains", "required_functions"]
          .some((key) => row[key] !== true)) throw new Error("owner_staging_database_preflight_failed");
  } finally { client.release(); }
}

export async function initializeOwnerStagingAuthRouteSet(
  config: OwnerStagingAuthConfig,
): Promise<OwnerSelfServeAuthRouteSet> {
  const pool = new Pool({
    ...createOwnerStagingDatabasePoolConfig(config.database),
    max: 10,
    connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
    idleTimeoutMillis: 10_000,
    statement_timeout: TIMEOUTS.statementMs,
    lock_timeout: TIMEOUTS.lockMs,
    idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
    application_name: `celebix-owner-${config.activationId}`,
  });
  pool.on("error", () => undefined);
  try { await preflight(pool, config.database.name); }
  catch (error) { await pool.end().catch(() => undefined); throw error; }

  const clock = () => new Date();
  const bytes = (size: number) => new Uint8Array(randomBytes(size));
  const stateDigester = createOpaqueStateDigester({ key: config.keys.identityHmac, context: "registration-attempt-state" });
  const oidcStateDigester = createOpaqueStateDigester({ key: config.keys.identityHmac, context: "oidc-transaction-state" });
  const identityDependencies = (context: string) => ({
    pool,
    stateDigester: createOpaqueStateDigester({ key: config.keys.identityHmac, context }),
    payloadCipher: createAes256GcmPayloadCipher({
      currentKeyId: config.keys.identityEncryptionKeyId,
      resolveKey: (keyId) => keyId === config.keys.identityEncryptionKeyId ? config.keys.identityEncryption : undefined,
    }),
    timeouts: TIMEOUTS,
    clock,
    audit: () => undefined,
    identityRole: "celebix_saas_identity" as const,
  });
  const registrationStore = new PostgresRegistrationAttemptStore(
    identityDependencies("registration-attempt-state"),
    { panelOrigin: config.authority.panelOrigin, platformDomainSuffix: config.authority.platformDomainSuffix },
    { oidcStateDigester },
  );
  const oidcStore = new PostgresOidcTransactionStore(
    identityDependencies("oidc-transaction-state"),
    { callbackAuthority: config.authority.panelCallbackUrl },
  );
  const repositoryOptions = {
    pool,
    generateId: () => randomUUID(),
    audit: () => undefined,
    timeouts: TIMEOUTS,
    bootstrapRole: "celebix_saas_bootstrap" as const,
    panelOrigin: config.authority.panelOrigin,
    adminOriginEnvironment: "staging" as const,
  };
  const tenantRepository = new PostgresSaaSDataRepository(repositoryOptions);
  const completion = createPersistentRegistrationCompletionService({
    workflowStore: registrationStore,
    tenantCore: createOwnerTenantCoreAdapter(createStarterTenantService({
      repository: tenantRepository,
      platformDomainSuffix: config.authority.platformDomainSuffix,
      panelBaseUrl: config.authority.panelOrigin,
      adminOriginEnvironment: "staging",
    })),
    recovery: new PostgresTenantOperationRecovery(repositoryOptions),
    panelOrigin: config.authority.panelOrigin,
    platformDomainSuffix: config.authority.platformDomainSuffix,
    clock,
    audit: () => undefined,
  });
  const oidcAudit = createOwnerStagingOidcAudit();
  const provider = createLogtoOidcProvider({
    ...config.logto,
    fetch: globalThis.fetch,
    clock,
    timeoutMs: 5_000,
    maximumResponseBytes: 65_536,
    audit: oidcAudit,
  });
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("approved_staging"),
    registrationAttemptStore: registrationStore,
    oidcTransactionStore: oidcStore,
    registrationCompletion: completion,
    consumedCallbackRecovery: registrationStore,
    oidcProvider: provider,
    requestGate: createApprovedStagingSelfServeRequestGate({ authority: config.authority, clock }),
    clock,
    audit: () => undefined,
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 8_192 },
    registrationOrigin: config.authority.ownerOrigin,
    callbackAuthority: config.authority.panelCallbackUrl,
    panelOrigin: config.authority.panelOrigin,
    platformDomainSuffix: config.authority.platformDomainSuffix,
    providerAuthority: {
      issuer: config.logto.issuer,
      audience: config.logto.clientId,
      authorizationOrigin: new URL(config.logto.issuer).origin,
    },
  });
  const browserCodec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([[config.keys.browserBootstrapKeyId, config.keys.browserBootstrap]]),
    activeBootstrapKeyId: config.keys.browserBootstrapKeyId,
    browserBindingKeys: new Map([[config.keys.browserBindingKeyId, config.keys.browserBinding]]),
    activeBrowserBindingKeyId: config.keys.browserBindingKeyId,
    randomBytes: bytes,
  });
  const browserRepository = createPostgresPanelBrowserBindingRepository({
    pool,
    stateDigester,
    oidcStateDigester,
    credentialCodec: browserCodec,
    clock,
    timeouts: TIMEOUTS,
    audit: () => undefined,
  });
  const returningSessionIssuer = createPostgresReturningPanelSessionIssuer({
    pool,
    activeSessionKeyId: config.keys.sessionKeyId,
    sessionKeys: new Map([[config.keys.sessionKeyId, config.keys.session]]),
    randomBytes: bytes,
    randomUuid: randomUUID,
    clock,
    timeouts: TIMEOUTS,
    audit: () => undefined,
  });
  const returningLogin = createPanelReturningLoginService({
    provider,
    transactionStore: oidcStore,
    browserBindingCodec: browserCodec,
    sessionIssuer: returningSessionIssuer,
    callbackAuthority: config.authority.panelCallbackUrl,
    expectedIssuer: config.logto.issuer,
    expectedAudience: config.logto.clientId,
    expectedAuthorizationOrigin: new URL(config.logto.issuer).origin,
    clock,
  });
  const callbackAudit = createOwnerStagingCallbackAudit();
  const composition = createDisabledOwnerSelfServeAuthComposition({
    activationApproval: createOwnerSelfServeAuthCompositionApproval("approved_staging"),
    runtime,
    authorityProfile: config.authority,
    stateDigester,
    browserBindingCredentialCodec: browserCodec,
    browserBindingRepository: browserRepository,
    returningLogin,
    ownerInternalOrigin: config.authority.ownerOrigin,
    browserBindingInternalKeys: new Map([[config.keys.browserInternalKeyId, config.keys.browserInternal]]),
    sessionCompletionInternalKeys: new Map([[config.keys.callbackInternalKeyId, config.keys.callbackInternal]]),
    browserBindingMaximumBodyBytes: 16_384,
    sessionCompletionMaximumBodyBytes: 16_384,
    clock,
    randomUuid: randomUUID,
    randomNonceBytes: bytes,
    handoffIssuer: {
      pool,
      handoffKeys: new Map([[config.keys.handoffKeyId, config.keys.handoff]]),
      activeHandoffKeyId: config.keys.handoffKeyId,
      sessionTokenKeyId: config.keys.sessionKeyId,
      randomBytes: bytes,
      timeouts: TIMEOUTS,
      audit: () => undefined,
    },
    bridgeAudit: () => undefined,
    browserBindingStartAudit: () => undefined,
    browserBindingGatewayAudit: () => undefined,
    initialCallbackAudit: callbackAudit,
    sessionHandoffGatewayAudit: () => undefined,
  });
  return createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: createOwnerSelfServeAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition,
  });
}
