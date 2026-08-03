import "server-only";
import { randomBytes } from "node:crypto";
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
  PostgresPublicAnalyticsRepository,
  parseMerchantProviderCredentialKeyring,
  type PaymentAttemptRepository,
  type PublicStorefrontRepository,
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
import { parseStorefrontDataConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS } from "./runtime-config.ts";
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

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
export type PublicStorefrontRuntime = Readonly<{
  repository: PublicStorefrontRepository;
  checkout: CheckoutRuntime;
  abandonedCarts: InstanceType<typeof PostgresPublicAbandonedCartRepository>;
  analytics: InstanceType<typeof PostgresPublicAnalyticsRepository> | null;
  analyticsCollector: UmamiPublicCollectorConfig | null;
  mediaOrigin: string;
}>;
let initialization: Promise<PublicStorefrontRuntime | null> | undefined;
type HostedPaymentInfrastructure = Readonly<{
  runtime: HostedPaymentRuntime;
  attempts: PaymentAttemptRepository;
  createRuntime: (attempts: PaymentAttemptRepository) => HostedPaymentRuntime | null;
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

async function initialize(): Promise<PublicStorefrontRuntime | null> {
  if (process.env.CELEBIX_DEPLOYMENT_TIER !== "staging" || process.env.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging") return null;
  const snapshot = Object.fromEntries(STOREFRONT_DATA_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]));
  let config;
  let checkoutConfig;
  try {
    config = parseStorefrontDataConfig(snapshot);
    checkoutConfig = parseCheckoutRuntimeConfig(snapshot);
  } catch { return null; }
  const analyticsCollector = await parseUmamiPublicCollectorConfig(process.env).catch(() => null);
  const pool = new Pool({ connectionString: checkoutConfig.database.url, max: 8, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: "celebix-shared-storefront-staging" });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_host_resolver','MEMBER') AS resolver_member,pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,to_regclass('saas.store_domains') IS NOT NULL AND to_regclass('saas.product_media') IS NOT NULL AND to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NOT NULL AND to_regprocedure('saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)') IS NOT NULL AND to_regprocedure('saas.public_list_product_media(uuid,text,timestamp with time zone,uuid)') IS NOT NULL AS migration_020,to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.quick_links_resolve_redemption(text,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.checkout_get_redemption_status(text,text,timestamp with time zone)') IS NOT NULL AS migration_027,pg_catalog.strpos(COALESCE((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)')),''),'effective_expires_at:=LEAST(p_expires_at,current_link.expires_at)')>0 AS migration_028,to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)') IS NOT NULL AS migration_032,to_regclass('saas.store_analytics_connections') IS NOT NULL AND to_regprocedure('saas.analytics_connection_get_for_host(text,timestamp with time zone)') IS NOT NULL AS migration_039,to_regprocedure('saas.storefront_design_get_public(uuid,text,timestamp with time zone)') IS NOT NULL AS migration_081 FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== checkoutConfig.database.name || row.is_superuser !== false || row.resolver_member !== true || row.workflow_member !== true || row.migration_020 !== true || row.migration_027 !== true || row.migration_028 !== true || row.migration_032 !== true || row.migration_081 !== true || (analyticsCollector !== null && row.migration_039 !== true)) throw new Error("storefront_database_preflight_failed");
    const repository = new PostgresPublicStorefrontRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS });
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
    return Object.freeze({
      repository,
      checkout: createCheckoutRuntime({ storefrontRepository: repository, quickOrderRepository }),
      abandonedCarts,
      analytics,
      analyticsCollector,
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
    const preflight = await pool.query({
      text: `SELECT
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
          AS migration_057
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname=current_user`,
      values: [],
    });
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
    runtimeOwnsKeyring = true;
    return Object.freeze({ runtime, attempts, createRuntime });
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
