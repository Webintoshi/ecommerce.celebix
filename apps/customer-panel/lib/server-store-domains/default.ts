import "server-only";

import { randomUUID } from "node:crypto";
import process from "node:process";

import { createCloudflareCustomHostnameProvider, createStoreDomainService } from "@celebix/saas-domain-core";
import { PostgresStoreDomainRepository } from "@celebix/saas-data";
import pg from "pg";

import {
  CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS,
  parseCustomerPanelStagingAuthConfig,
  resolveCustomerPanelStagingAuthMode,
} from "../panel-auth-authority/config.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import {
  registerServerStoreDomainService,
  resolveServerStoreDomainRuntime,
  type ServerStoreDomainRuntime,
} from "./runtime.ts";

const { Pool } = pg;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 });
let initialization: Promise<ServerStoreDomainRuntime | null> | undefined;

function required(name: string, maximum: number): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("server_store_domain_config_invalid");
  }
  return value;
}

function exactHostname(value: string): string {
  if (value !== value.toLowerCase() || value.length > 253 || !HOSTNAME.test(value)) throw new Error("server_store_domain_config_invalid");
  return value;
}

async function initialize(): Promise<ServerStoreDomainRuntime | null> {
  if (resolveCustomerPanelStagingAuthMode(process.env) !== "approved_staging") return null;
  const access = await resolveDefaultServerPanelAccessRuntime();
  if (access.readiness.mode !== "approved_staging") return null;
  const auth = parseCustomerPanelStagingAuthConfig(Object.fromEntries(
    CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]),
  ));
  const apiToken = required("CLOUDFLARE_SAAS_API_TOKEN", 2_048);
  const zoneId = required("CLOUDFLARE_SAAS_ZONE_ID", 128);
  if (apiToken.length < 8 || /\s/u.test(apiToken) || !SAFE_ID.test(zoneId)) throw new Error("server_store_domain_config_invalid");
  const apiBaseUrl = process.env.CLOUDFLARE_SAAS_API_BASE_URL ?? "https://api.cloudflare.com/client/v4";
  if (apiBaseUrl !== "https://api.cloudflare.com/client/v4") throw new Error("server_store_domain_config_invalid");
  const cnameTarget = exactHostname(required("CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET", 253));
  const reservedSuffixes = Object.freeze(required("CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES", 1_024).split(",").map(exactHostname));
  if (reservedSuffixes.length < 1 || reservedSuffixes.length > 16 || new Set(reservedSuffixes).size !== reservedSuffixes.length
      || !reservedSuffixes.some((suffix) => cnameTarget === suffix || cnameTarget.endsWith(`.${suffix}`))) {
    throw new Error("server_store_domain_config_invalid");
  }
  const pool = new Pool({
    connectionString: auth.database.url,
    max: 4,
    connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
    idleTimeoutMillis: 10_000,
    statement_timeout: TIMEOUTS.statementMs,
    lock_timeout: TIMEOUTS.lockMs,
    idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
    application_name: `celebix-panel-store-domains-${auth.activationId}`,
  });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      role.rolsuper AS is_superuser,
      pg_has_role(current_user,'celebix_saas_app','MEMBER') AS app_member,
      to_regprocedure('saas.merchant_store_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.merchant_store_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)') IS NOT NULL
        AND to_regprocedure('saas.merchant_store_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,text,jsonb,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.merchant_store_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.merchant_store_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.merchant_store_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)') IS NOT NULL AS domain_lifecycle
      FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16
        || row.database_name !== auth.database.name || row.is_superuser !== false || row.app_member !== true || row.domain_lifecycle !== true) {
      throw new Error("server_store_domain_database_preflight_failed");
    }
    const repository = new PostgresStoreDomainRepository({ pool, role: "celebix_saas_app", timeouts: TIMEOUTS });
    const provider = createCloudflareCustomHostnameProvider({ zoneId, apiToken, apiBaseUrl, minimumTlsVersion: "1.2", timeoutMs: 5_000 });
    registerServerStoreDomainService(access, createStoreDomainService({
      repository,
      provider,
      hostnamePolicy: Object.freeze({ cnameTarget, reservedSuffixes }),
      generateId: randomUUID,
    }));
    return resolveServerStoreDomainRuntime(access);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}

export async function resolveDefaultServerStoreDomainRuntime(): Promise<ServerStoreDomainRuntime | null> {
  initialization ??= initialize().catch(() => null);
  return initialization;
}
