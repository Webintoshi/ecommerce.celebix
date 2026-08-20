import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import {
  IYZICO_IFRAME_PACKET,
  PAYTR_IFRAME_PACKET,
  createBoundedProviderTransport,
} from "@celebix/payment-adapters";
import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";
import {
  PostgresPaymentAttemptRepository,
  PostgresQuickOrderHostedPaymentRepository,
  PostgresPublicQuickOrderRepository,
  PostgresPublicAbandonedCartRepository,
  PostgresPublicStorefrontRepository,
  PostgresPublicStorefrontContentRepository,
  PostgresNewsletterRepository,
  PostgresStorefrontCommerceRepository,
  PostgresStorefrontHostedCheckoutRepository,
  PostgresStorefrontHostedCheckoutWorkerRepository,
  PostgresStorefrontIdentityRepository,
  PostgresPublicAnalyticsRepository,
  PostgresStoreDomainOriginHealthRepository,
  parseMerchantProviderCredentialKeyring,
  type PaymentAttemptRepository,
  type PublicStorefrontContentRepository,
  type PublicStorefrontRepository,
  type NewsletterRepository,
  type StorefrontCommerceRepository,
  type StoreDomainOriginHealthRepository,
  type StorefrontHostedCheckoutWorkerRepository,
} from "@celebix/saas-data";
import pg from "pg";

import { parseCheckoutRuntimeConfig } from "./checkout/config.ts";
import {
  createCheckoutRuntime,
  resolveDefaultCheckoutPaymentRuntime,
  type CheckoutRuntime,
} from "./checkout/runtime.ts";
import type {
  QuickOrderHostedPaymentBridgeRuntime,
  QuickOrderHostedPaymentExecution,
} from "./checkout/hosted-payment.ts";
import { parseStorefrontDataConfig, parseStorefrontIdentityConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS, STOREFRONT_IDENTITY_ENVIRONMENT_FIELDS } from "./runtime-config.ts";
import { parseUmamiPublicCollectorConfig, type UmamiPublicCollectorConfig } from "./analytics/config.ts";
import {
  createDefaultStorefrontHostedPaymentCompiledAuthorities,
  createDefaultHostedPaymentRuntime,
  resolveStorefrontHostedPaymentActivationMode,
  type StorefrontHostedPaymentCompiledAuthorities,
} from "./payment-adapters/default.ts";
import type {
  HostedPaymentRuntime,
  HostedPaymentRuntimeDependencies,
} from "./payment-adapters/runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "./trusted-host-authority.ts";
import { parseStorefrontCommerceCredentialKeyring } from "./cart/credential.ts";
import { createStorefrontCommerceRuntime, type StorefrontCommerceRuntime } from "./cart/runtime.ts";
import { createStandardHostedCheckoutRuntime, type StandardHostedCheckoutRuntime } from "./checkout/standard-hosted-payment.ts";
import { createStorefrontLoginCode } from "./account/credential.ts";
import { createResendStorefrontIdentityEmailDelivery } from "./account/email-delivery.ts";
import { createStorefrontIdentityRuntime, type StorefrontIdentityRuntime } from "./account/runtime.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
export type PublicStorefrontRuntime = Readonly<{
  repository: PublicStorefrontRepository;
  content: PublicStorefrontContentRepository;
  commerce: StorefrontCommerceRepository;
  cart: StorefrontCommerceRuntime;
  hostedCheckout: StandardHostedCheckoutRuntime | null;
  checkout: CheckoutRuntime;
  abandonedCarts: InstanceType<typeof PostgresPublicAbandonedCartRepository>;
  analytics: InstanceType<typeof PostgresPublicAnalyticsRepository> | null;
  analyticsCollector: UmamiPublicCollectorConfig | null;
  newsletter: NewsletterRepository;
  domainHealth: StoreDomainOriginHealthRepository;
  identity: StorefrontIdentityRuntime | null;
  mediaOrigin: string;
}>;
let initialization: Promise<PublicStorefrontRuntime | null> | undefined;
type HostedPaymentInfrastructure = Readonly<{
  runtime: HostedPaymentRuntime;
  attempts: PaymentAttemptRepository;
  createRuntime: (attempts: PaymentAttemptRepository) => HostedPaymentRuntime | null;
  pool: InstanceType<typeof Pool>;
  close: () => Promise<void>;
}>;
let hostedPaymentInitialization: Promise<HostedPaymentInfrastructure | null> | undefined;
let quickOrderHostedBridgeInitialization: Promise<QuickOrderHostedPaymentBridgeRuntime | null> | undefined;

function compiledHostedPaymentAuthorities(): StorefrontHostedPaymentCompiledAuthorities {
  return createDefaultStorefrontHostedPaymentCompiledAuthorities();
}

type ExecutableCompiledAuthority = Readonly<{
  providerCode: "paytr_iframe" | "iyzico_iframe";
  authority: Readonly<PaymentProviderExecutionAuthority>;
}>;

function executableCompiledAuthorities(
  authorities: StorefrontHostedPaymentCompiledAuthorities,
  source: Readonly<Record<string, string | undefined>>,
): readonly ExecutableCompiledAuthority[] {
  const packets = Object.freeze({
    paytr_iframe: PAYTR_IFRAME_PACKET,
    iyzico_iframe: IYZICO_IFRAME_PACKET,
  });
  return Object.freeze((Object.keys(packets) as readonly (keyof typeof packets)[])
    .flatMap((providerCode) => {
      const authority = authorities[providerCode];
      return authority !== null
        && resolveStorefrontHostedPaymentActivationMode(source, providerCode) === "approved_test_sandbox"
        && authority.environment === "test"
        && authority.adapterVersion === packets[providerCode].adapterVersion
        && /^sha256:[a-f0-9]{64}$/.test(authority.evidenceDigest)
        && (providerCode === "iyzico_iframe" || packets[providerCode].readiness.test === "sandbox_ready")
        ? [Object.freeze({ providerCode, authority })]
        : [];
    }));
}

async function currentExecutionAuthorityMatches(
  pool: InstanceType<typeof Pool>,
  authority: Parameters<HostedPaymentRuntimeDependencies["matchesCompiledAuthority"]>[0],
): Promise<boolean> {
  try {
    const exact = await pool.query({
      text: `SELECT saas.merchant_provider_execution_authority_matches(
        $1::text,$2::text,$3::text,$4::integer,$5::text
      ) AS exact_authority`,
      values: [
        authority.providerCode,
        authority.capability,
        authority.environment,
        authority.adapterVersion,
        authority.evidenceDigest,
      ],
    });
    return exact.rowCount === 1 && exact.rows[0]?.exact_authority === true;
  } catch {
    return false;
  }
}

async function queryAsWorkflowRole(
  pool: InstanceType<typeof Pool>,
  text: string,
  values: readonly unknown[] = [],
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query({ text, values: [...values] });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function initialize(): Promise<PublicStorefrontRuntime | null> {
  if (process.env.CELEBIX_DEPLOYMENT_TIER !== "staging" || process.env.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging") return null;
  const snapshot = Object.fromEntries(STOREFRONT_DATA_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]));
  let config;
  let checkoutConfig;
  let identityConfig: ReturnType<typeof parseStorefrontIdentityConfig> | null = null;
  try {
    config = parseStorefrontDataConfig(snapshot);
    checkoutConfig = parseCheckoutRuntimeConfig(snapshot);
    try { identityConfig = parseStorefrontIdentityConfig(Object.fromEntries(STOREFRONT_IDENTITY_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]))); } catch { identityConfig = null; }
  } catch { return null; }
  const analyticsCollector = await parseUmamiPublicCollectorConfig(process.env).catch(() => null);
  const pool = new Pool({ connectionString: checkoutConfig.database.url, max: 8, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: "celebix-shared-storefront-staging" });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_host_resolver','MEMBER') AS resolver_member,pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,to_regclass('saas.store_domains') IS NOT NULL AND to_regclass('saas.product_media') IS NOT NULL AND to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NOT NULL AND to_regprocedure('saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)') IS NOT NULL AND to_regprocedure('saas.public_list_product_media(uuid,text,timestamp with time zone,uuid)') IS NOT NULL AS migration_020,to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.quick_links_resolve_redemption(text,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.checkout_get_redemption_status(text,text,timestamp with time zone)') IS NOT NULL AS migration_027,pg_catalog.strpos(COALESCE((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)')),''),'effective_expires_at:=LEAST(p_expires_at,current_link.expires_at)')>0 AS migration_028,to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)') IS NOT NULL AS migration_032,to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb)') IS NOT NULL AND to_regprocedure('saas.public_cart_mutate_without_customer_identity_v103(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_projection(uuid,uuid)') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute WHERE attribute.attrelid=to_regclass('saas.abandoned_carts') AND attribute.attname='customer_id' AND NOT attribute.attisdropped) AND pg_catalog.strpos(COALESCE((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=to_regprocedure('saas.abandoned_carts_projection(uuid,uuid)')),''),'''firstProductName''')>0 AND pg_catalog.strpos(COALESCE((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=to_regprocedure('saas.abandoned_carts_projection(uuid,uuid)')),''),'''customerId''')>0 AS migration_103,to_regclass('saas.store_analytics_connections') IS NOT NULL AND to_regprocedure('saas.analytics_connection_get_for_host(text,timestamp with time zone)') IS NOT NULL AS migration_039,to_regclass('saas.store_policy_pages') IS NOT NULL AND to_regprocedure('saas.public_policy_index(text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.public_policy_get(text,timestamp with time zone,text)') IS NOT NULL AND to_regprocedure('saas.public_search_products(text,timestamp with time zone,text,integer,text)') IS NOT NULL AND to_regprocedure('saas.public_resolve_product_ids(text,timestamp with time zone,uuid[])') IS NOT NULL AS migration_071,to_regclass('saas.storefront_carts') IS NOT NULL AND to_regclass('saas.storefront_checkout_operations') IS NOT NULL AND to_regprocedure('saas.public_cart_resolve(text,timestamp with time zone,jsonb)') IS NOT NULL AND to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)') IS NOT NULL AND to_regprocedure('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NOT NULL AS migration_072,pg_catalog.strpos(COALESCE((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=to_regprocedure('saas.storefront_cart_projection(uuid,uuid,timestamp with time zone)')),''),'''checkoutBlocker''')>0 AS migration_073,to_regclass('saas.storefront_newsletter_subscribers') IS NOT NULL AND to_regprocedure('saas.public_newsletter_subscribe(text,timestamp with time zone,text,text)') IS NOT NULL AS migration_075,to_regprocedure('saas.storefront_design_get_public(uuid,text,timestamp with time zone)') IS NOT NULL AS migration_081,to_regclass('saas.storefront_accounts') IS NOT NULL AND to_regprocedure('saas.public_account_auth_start(text,timestamp with time zone,uuid,text,text,text,text,timestamp with time zone,uuid,text,jsonb,text)') IS NOT NULL AND to_regprocedure('saas.public_account_session_get(text,timestamp with time zone,jsonb)') IS NOT NULL AS migration_083,to_regprocedure('saas.resolve_store_domain_origin_health(text,timestamp with time zone)') IS NOT NULL AS migration_088 FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0];
    const identityMigration = identityConfig === null ? true : (await pool.query("SELECT to_regprocedure('saas.public_account_auth_start_v2(text,timestamp with time zone,uuid,text,text,text,text,text,text,timestamp with time zone,uuid,text,jsonb,text)') IS NOT NULL AND to_regprocedure('saas.public_account_auth_verify_v2(text,timestamp with time zone,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)') IS NOT NULL AS ready")).rows[0]?.ready === true;
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== checkoutConfig.database.name || row.is_superuser !== false || row.resolver_member !== true || row.workflow_member !== true || row.migration_020 !== true || row.migration_027 !== true || row.migration_028 !== true || row.migration_032 !== true || row.migration_103 !== true || row.migration_071 !== true || row.migration_072 !== true || row.migration_073 !== true || row.migration_075 !== true || row.migration_081 !== true || row.migration_088 !== true || (analyticsCollector !== null && row.migration_039 !== true)) throw new Error("storefront_database_preflight_failed");
    const repository = new PostgresPublicStorefrontRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS });
    const content = new PostgresPublicStorefrontContentRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS });
    const commerce = new PostgresStorefrontCommerceRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS, audit: () => undefined });
    const commerceKeyring = parseStorefrontCommerceCredentialKeyring(process.env);
    const hostedMigration = await queryAsWorkflowRole(pool, `SELECT
      to_regclass('saas.storefront_hosted_checkout_sessions') IS NOT NULL
        AND to_regclass('saas.checkout_inventory_reservations') IS NOT NULL
        AND to_regprocedure('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)') IS NOT NULL AS migration_090,
      to_regprocedure('saas.public_storefront_hosted_checkout_authority(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)') IS NOT NULL
        AND to_regprocedure('saas.public_storefront_hosted_checkout_begin(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text)') IS NOT NULL
        AND to_regprocedure('saas.public_storefront_hosted_checkout_presentation(text,timestamp with time zone,jsonb)') IS NOT NULL AS migration_091,
      to_regprocedure('saas.storefront_hosted_checkout_settlement_preflight()') IS NOT NULL
        AND saas.storefront_hosted_checkout_settlement_preflight() AS migration_092`);
    const hostedReady = hostedMigration.rowCount === 1
      && hostedMigration.rows[0]?.migration_090 === true
      && hostedMigration.rows[0]?.migration_091 === true
      && hostedMigration.rows[0]?.migration_092 === true;
    const presentationInfrastructure = hostedReady ? await resolveDefaultCheckoutPaymentRuntime() : null;
    const hostedCheckout = hostedReady && presentationInfrastructure !== null
      ? createStandardHostedCheckoutRuntime({
          repository: new PostgresStorefrontHostedCheckoutRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS, audit: () => undefined }),
          commerceKeyring,
          presentationKeyring: presentationInfrastructure.keyring,
          now: () => new Date(),
          randomUuid: randomUUID,
          resolveExecution: async () => {
            const execution = await resolveDefaultHostedPaymentInfrastructure();
            return execution === null ? null : Object.freeze({ attempts: execution.attempts, createRuntime: execution.createRuntime });
          },
        })
      : null;
    const activeHostedAuthorities = new Map(executableCompiledAuthorities(compiledHostedPaymentAuthorities(), Object.freeze({
      CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: process.env.CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE,
      CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE: process.env.CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE,
    })).map(({ providerCode, authority }) => [providerCode, authority]));
    const cart = createStorefrontCommerceRuntime({ repository: commerce, keyring: commerceKeyring, now: () => new Date(), randomBytes: (size) => new Uint8Array(randomBytes(size)), randomUuid: randomUUID,
      hostedPaymentAvailable: async (method) => {
        if (hostedCheckout === null) return false;
        const authority = activeHostedAuthorities.get(method.providerCode);
        return authority !== undefined && await currentExecutionAuthorityMatches(pool, Object.freeze({
          providerCode: method.providerCode,
          capability: "payment_processing" as const,
          environment: authority.environment,
          adapterVersion: authority.adapterVersion,
          evidenceDigest: authority.evidenceDigest,
        }));
      } });
    const quickOrderRepository = new PostgresPublicQuickOrderRepository({
      pool,
      role: "celebix_saas_workflow",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    });
    const abandonedCarts = new PostgresPublicAbandonedCartRepository({
      pool,
      role: "celebix_saas_workflow",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    });
    const analytics = analyticsCollector === null ? null : new PostgresPublicAnalyticsRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS });
    const newsletter = new PostgresNewsletterRepository({ pool, publicRole: "celebix_saas_host_resolver", timeouts: TIMEOUTS });
    const domainHealth = new PostgresStoreDomainOriginHealthRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS });
    const identity = identityConfig !== null && row.migration_083 === true && identityMigration ? createStorefrontIdentityRuntime({
      repository: new PostgresStorefrontIdentityRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS, audit: () => undefined }),
      hmacKeyring: identityConfig.hmacKeyring,
      sealKeyring: identityConfig.sealKeyring,
      now: () => new Date(),
      randomBytes: (size) => new Uint8Array(randomBytes(size)),
      randomUuid: randomUUID,
      randomLoginCode: () => createStorefrontLoginCode(),
      deliverLoginCode: createResendStorefrontIdentityEmailDelivery({ apiKey: identityConfig.email.apiKey, from: identityConfig.email.from, fetch: (request) => fetch(request), timeoutMs: 5_000 }),
    }) : null;
    return Object.freeze({
      repository,
      content,
      commerce,
      cart,
      hostedCheckout,
      checkout: createCheckoutRuntime({ storefrontRepository: repository, quickOrderRepository }),
      abandonedCarts,
      analytics,
      analyticsCollector,
      newsletter,
      domainHealth,
      identity,
      mediaOrigin: config.mediaOrigin,
    });
  } catch { await pool.end().catch(() => undefined); return null; }
}

export async function resolveDefaultPublicStorefrontRuntime(): Promise<PublicStorefrontRuntime | null> {
  initialization ??= initialize();
  return initialization;
}

export async function resolveDefaultHostedPaymentRuntime(): Promise<HostedPaymentRuntime | null> {
  const source = Object.freeze({
    CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE:
      process.env.CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE,
    CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE:
      process.env.CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE,
  });
  const compiledAuthorities = compiledHostedPaymentAuthorities();
  const executableAuthorities = executableCompiledAuthorities(compiledAuthorities, source);
  if (executableAuthorities.length === 0) return null;
  hostedPaymentInitialization ??= initializeHostedPaymentInfrastructure(
    source,
    compiledAuthorities,
    executableAuthorities,
  );
  return (await hostedPaymentInitialization)?.runtime ?? null;
}

export type DefaultStandardCheckoutReconciliationRuntime = Readonly<{
  sessions: StorefrontHostedCheckoutWorkerRepository;
  attempts: PaymentAttemptRepository;
  runtime: HostedPaymentRuntime;
  close: () => Promise<void>;
}>;

export async function resolveDefaultStandardCheckoutReconciliationRuntime(): Promise<DefaultStandardCheckoutReconciliationRuntime | null> {
  const infrastructure = await resolveDefaultHostedPaymentInfrastructure();
  if (infrastructure === null) return null;
  return Object.freeze({
    sessions: new PostgresStorefrontHostedCheckoutWorkerRepository({
      pool: infrastructure.pool,
      role: "celebix_saas_workflow",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    }),
    attempts: infrastructure.attempts,
    runtime: infrastructure.runtime,
    close: infrastructure.close,
  });
}

async function resolveDefaultHostedPaymentInfrastructure(): Promise<HostedPaymentInfrastructure | null> {
  const source = Object.freeze({
    CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE:
      process.env.CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE,
    CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE:
      process.env.CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE,
  });
  const compiledAuthorities = compiledHostedPaymentAuthorities();
  const executableAuthorities = executableCompiledAuthorities(compiledAuthorities, source);
  if (executableAuthorities.length === 0) return null;
  hostedPaymentInitialization ??= initializeHostedPaymentInfrastructure(
    source, compiledAuthorities, executableAuthorities,
  );
  return hostedPaymentInitialization;
}

async function initializeHostedPaymentInfrastructure(
  source: Readonly<Record<string, string | undefined>>,
  compiledAuthorities: StorefrontHostedPaymentCompiledAuthorities,
  executableAuthorities: readonly ExecutableCompiledAuthority[],
): Promise<HostedPaymentInfrastructure | null> {
  const snapshot = Object.fromEntries(
    STOREFRONT_DATA_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]),
  );
  let checkoutConfig;
  let keyring;
  try {
    checkoutConfig = parseCheckoutRuntimeConfig(snapshot);
    keyring = parseMerchantProviderCredentialKeyring(process.env);
  } catch {
    return null;
  }
  let pool: InstanceType<typeof Pool> | undefined;
  let runtimeOwnsKeyring = false;
  try {
    pool = new Pool({
      connectionString: checkoutConfig.database.url,
      max: 4,
      connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
      idleTimeoutMillis: 10_000,
      statement_timeout: TIMEOUTS.statementMs,
      lock_timeout: TIMEOUTS.lockMs,
      idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
      application_name: "celebix-shared-storefront-hosted-payment-staging",
    });
    pool.on("error", () => undefined);
    const preflight = await queryAsWorkflowRole(pool, `SELECT
        current_setting('server_version_num')::integer AS version_num,
        current_database() AS database_name,
        role.rolsuper AS is_superuser,
        pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,
        to_regclass('saas.payment_attempts') IS NOT NULL
          AND to_regprocedure('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)') IS NOT NULL
          AND to_regprocedure('saas.payment_callback_authority(text,text,timestamp with time zone)') IS NOT NULL
          AS migration_052,
        to_regclass('saas.merchant_provider_execution_authorities') IS NOT NULL
          AND to_regprocedure('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)') IS NOT NULL
          AND to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()') IS NOT NULL
          AND saas.payment_provider_keyed_lifecycle_preflight()
          AS migration_056,
        to_regprocedure('saas.quick_order_hosted_payment_authority_preflight()') IS NOT NULL
          AND saas.quick_order_hosted_payment_authority_preflight()
          AS migration_057,
        to_regprocedure('saas.storefront_hosted_checkout_settlement_preflight()') IS NOT NULL
          AND saas.storefront_hosted_checkout_settlement_preflight()
          AS migration_092
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname=current_user`);
    const row = preflight.rows[0] as Record<string, unknown> | undefined;
    if (
      preflight.rowCount !== 1
      || !row
      || Math.floor(Number(row.version_num) / 10_000) !== 16
      || row.database_name !== checkoutConfig.database.name
      || row.is_superuser !== false
      || row.workflow_member !== true
      || row.migration_052 !== true
      || row.migration_056 !== true
      || row.migration_057 !== true
      || row.migration_092 !== true
    ) throw new Error("storefront_hosted_payment_preflight_failed");
    for (const { providerCode, authority } of executableAuthorities) {
      if (!await currentExecutionAuthorityMatches(pool, Object.freeze({
          providerCode,
          capability: "payment_processing" as const,
          environment: authority.environment,
          adapterVersion: authority.adapterVersion,
          evidenceDigest: authority.evidenceDigest,
        }))) throw new Error("storefront_hosted_payment_authority_mismatch");
    }
    const attempts = new PostgresPaymentAttemptRepository({
      pool,
      role: "celebix_saas_workflow",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    });
    const transport = createBoundedProviderTransport({
      fetch: (request) => fetch(request),
      timeoutMs: 5_000,
      maximumResponseBytes: 262_144,
    });
    const sharedDependencies = Object.freeze({
        keyring,
        transport,
        selectAuthority: (headers: Headers) =>
          selectTrustedStorefrontHostAuthority(headers),
        matchesCompiledAuthority: (authority: Parameters<HostedPaymentRuntimeDependencies["matchesCompiledAuthority"]>[0]) =>
          currentExecutionAuthorityMatches(pool!, authority),
        now: () => new Date(),
        randomBytes: (size: number) => new Uint8Array(randomBytes(size)),
    });
    const createRuntime = (selectedAttempts: PaymentAttemptRepository) => createDefaultHostedPaymentRuntime({
      source,
      compiledAuthorities,
      dependencies: { attempts: selectedAttempts, ...sharedDependencies },
    });
    const runtime = createRuntime(attempts);
    if (runtime === null) throw new Error("storefront_hosted_payment_disabled");
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      for (const { key } of keyring.keys) key.fill(0);
      await pool!.end();
    };
    runtimeOwnsKeyring = true;
    return Object.freeze({ runtime, attempts, createRuntime, pool, close });
  } catch {
    await pool?.end().catch(() => undefined);
    return null;
  } finally {
    if (!runtimeOwnsKeyring) {
      for (const { key } of keyring.keys) key.fill(0);
    }
  }
}

async function initializeQuickOrderHostedPaymentBridge(): Promise<QuickOrderHostedPaymentBridgeRuntime | null> {
  if (process.env.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || process.env.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging") return null;
  let pool: InstanceType<typeof Pool> | undefined;
  try {
    const config = parseCheckoutRuntimeConfig(process.env);
    pool = new Pool({
      connectionString: config.database.url,
      max: 4,
      connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
      idleTimeoutMillis: 10_000,
      statement_timeout: TIMEOUTS.statementMs,
      lock_timeout: TIMEOUTS.lockMs,
      idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
      application_name: "celebix-shared-storefront-quick-order-hosted-bridge-staging",
    });
    pool.on("error", () => undefined);
    const preflight = await pool.query({
      text: `SELECT
        current_setting('server_version_num')::integer AS version_num,
        current_database() AS database_name,
        role.rolsuper AS is_superuser,
        pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,
        to_regprocedure('saas.quick_order_hosted_payment_bridge_preflight()') IS NOT NULL
          AND saas.quick_order_hosted_payment_bridge_preflight() AS migration_058
      FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user`,
      values: [],
    });
    const row = preflight.rows[0] as Record<string, unknown> | undefined;
    if (preflight.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16
      || row.database_name !== config.database.name || row.is_superuser !== false
      || row.workflow_member !== true || row.migration_058 !== true) {
      throw new Error("storefront_quick_order_hosted_bridge_preflight_failed");
    }
    const hostedPayments = new PostgresQuickOrderHostedPaymentRepository({
      pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS, audit: () => undefined,
    });
    return Object.freeze({
      hostedPayments,
      resolveExecution: async (): Promise<QuickOrderHostedPaymentExecution | null> => {
        const [hosted, checkout] = await Promise.all([
          resolveDefaultHostedPaymentInfrastructure(),
          resolveDefaultCheckoutPaymentRuntime(),
        ]);
        return hosted === null || checkout === null ? null : Object.freeze({
          attempts: hosted.attempts,
          keyring: checkout.keyring,
          createRuntime: hosted.createRuntime,
        });
      },
    });
  } catch {
    await pool?.end().catch(() => undefined);
    return null;
  }
}

export async function resolveDefaultQuickOrderHostedPaymentBridgeRuntime(): Promise<QuickOrderHostedPaymentBridgeRuntime | null> {
  quickOrderHostedBridgeInitialization ??= initializeQuickOrderHostedPaymentBridge();
  const pending = quickOrderHostedBridgeInitialization;
  const runtime = await pending;
  if (runtime === null && quickOrderHostedBridgeInitialization === pending) {
    quickOrderHostedBridgeInitialization = undefined;
  }
  return runtime;
}
