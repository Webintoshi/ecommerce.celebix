import "server-only";
import process from "node:process";
import { PostgresPublicStorefrontRepository, type PublicStorefrontRepository } from "@celebix/saas-data";
import pg from "pg";

import { parseStorefrontDataConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS } from "./runtime-config.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
export type PublicStorefrontRuntime = Readonly<{ repository: PublicStorefrontRepository; mediaOrigin: string }>;
let initialization: Promise<PublicStorefrontRuntime | null> | undefined;

async function initialize(): Promise<PublicStorefrontRuntime | null> {
  if (process.env.CELEBIX_DEPLOYMENT_TIER !== "staging" || process.env.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging") return null;
  const snapshot = Object.fromEntries(STOREFRONT_DATA_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]));
  let config; try { config = parseStorefrontDataConfig(snapshot); } catch { return null; }
  const pool = new Pool({ connectionString: config.database.url, max: 8, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: "celebix-shared-storefront-staging" });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_host_resolver','MEMBER') AS resolver_member,to_regclass('saas.store_domains') IS NOT NULL AND to_regclass('saas.product_media') IS NOT NULL AND to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NOT NULL AND to_regprocedure('saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)') IS NOT NULL AND to_regprocedure('saas.public_list_product_media(uuid,text,timestamp with time zone,uuid)') IS NOT NULL AS migration_020 FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== config.database.name || row.is_superuser !== false || row.resolver_member !== true || row.migration_020 !== true) throw new Error("storefront_database_preflight_failed");
    return Object.freeze({ repository: new PostgresPublicStorefrontRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS }), mediaOrigin: config.mediaOrigin });
  } catch { await pool.end().catch(() => undefined); return null; }
}

export async function resolveDefaultPublicStorefrontRuntime(): Promise<PublicStorefrontRuntime | null> {
  initialization ??= initialize();
  return initialization;
}
