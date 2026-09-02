import process from "node:process";

import { PostgresAdminDomainOriginHealthRepository } from "@celebix/saas-data";
import pg from "pg";

import {
  CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS,
  parseCustomerPanelStagingAuthConfig,
  resolveCustomerPanelStagingAuthMode,
} from "../panel-auth-authority/config.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
let initialized: Promise<PostgresAdminDomainOriginHealthRepository | null> | undefined;

async function initialize(): Promise<PostgresAdminDomainOriginHealthRepository | null> {
  if (resolveCustomerPanelStagingAuthMode(process.env) !== "approved_staging") return null;
  const auth = parseCustomerPanelStagingAuthConfig(Object.fromEntries(
    CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]),
  ));
  const pool = new Pool({
    connectionString: auth.database.url, max: 2, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000,
    application_name: `celebix-panel-admin-origin-health-${auth.activationId}`,
  });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      role.rolsuper AS is_superuser,
      pg_has_role(current_user, 'celebix_saas_host_resolver', 'MEMBER') AS host_resolver_member,
      to_regprocedure('saas.resolve_admin_domain_origin_health(text,timestamp with time zone)') IS NOT NULL AS ready
      FROM pg_roles AS role WHERE role.rolname = current_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16
        || row.database_name !== auth.database.name || row.is_superuser !== false
        || row.host_resolver_member !== true || row.ready !== true) {
      throw new Error("admin_domain_origin_health_preflight_failed");
    }
    return new PostgresAdminDomainOriginHealthRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS });
  } catch (caught) {
    await pool.end().catch(() => undefined);
    throw caught;
  }
}

export async function resolveAdminDomainOriginHealth(hostname: string, now: Date) {
  initialized ??= initialize().catch(() => null);
  const repository = await initialized;
  return repository ? repository.get({ hostname, now }) : null;
}
