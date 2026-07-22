import "server-only";
import process from "node:process";
import {
  PostgresPublicQuickOrderRepository,
  PostgresPublicAbandonedCartRepository,
  PostgresPublicStorefrontRepository,
  type PublicStorefrontRepository,
} from "@celebix/saas-data";
import pg from "pg";

import { parseCheckoutRuntimeConfig } from "./checkout/config.ts";
import { createCheckoutRuntime, type CheckoutRuntime } from "./checkout/runtime.ts";
import { parseStorefrontDataConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS } from "./runtime-config.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
export type PublicStorefrontRuntime = Readonly<{
  repository: PublicStorefrontRepository;
  checkout: CheckoutRuntime;
  abandonedCarts: InstanceType<typeof PostgresPublicAbandonedCartRepository>;
  mediaOrigin: string;
}>;
let initialization: Promise<PublicStorefrontRuntime | null> | undefined;

async function initialize(): Promise<PublicStorefrontRuntime | null> {
  if (process.env.CELEBIX_DEPLOYMENT_TIER !== "staging" || process.env.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging") return null;
  const snapshot = Object.fromEntries(STOREFRONT_DATA_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]));
  let config;
  let checkoutConfig;
  try {
    config = parseStorefrontDataConfig(snapshot);
    checkoutConfig = parseCheckoutRuntimeConfig(snapshot);
  } catch { return null; }
  const pool = new Pool({ connectionString: checkoutConfig.database.url, max: 8, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: "celebix-shared-storefront-staging" });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_host_resolver','MEMBER') AS resolver_member,pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,to_regclass('saas.store_domains') IS NOT NULL AND to_regclass('saas.product_media') IS NOT NULL AND to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NOT NULL AND to_regprocedure('saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)') IS NOT NULL AND to_regprocedure('saas.public_list_product_media(uuid,text,timestamp with time zone,uuid)') IS NOT NULL AS migration_020,to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.quick_links_resolve_redemption(text,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.checkout_get_redemption_status(text,text,timestamp with time zone)') IS NOT NULL AS migration_027,pg_catalog.strpos(COALESCE((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)')),''),'effective_expires_at:=LEAST(p_expires_at,current_link.expires_at)')>0 AS migration_028,to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)') IS NOT NULL AS migration_032 FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== checkoutConfig.database.name || row.is_superuser !== false || row.resolver_member !== true || row.workflow_member !== true || row.migration_020 !== true || row.migration_027 !== true || row.migration_028 !== true || row.migration_032 !== true) throw new Error("storefront_database_preflight_failed");
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
    return Object.freeze({
      repository,
      checkout: createCheckoutRuntime({ storefrontRepository: repository, quickOrderRepository }),
      abandonedCarts,
      mediaOrigin: config.mediaOrigin,
    });
  } catch { await pool.end().catch(() => undefined); return null; }
}

export async function resolveDefaultPublicStorefrontRuntime(): Promise<PublicStorefrontRuntime | null> {
  initialization ??= initialize();
  return initialization;
}
