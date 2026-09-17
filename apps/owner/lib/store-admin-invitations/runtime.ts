import pg from "pg";
import type { PostgresPoolLike } from "@celebix/saas-data";
import type { OwnerStagingAuthConfig } from "../self-serve-auth-authority/config.ts";
import { parseInvitationRuntimeConfig } from "./runtime-config.ts";
import { createInvitationIdentityRepository, createInvitationManagerResolver } from "./repository.ts";
import { createInvitationService } from "./service.ts";
import { createInvitationManagementService } from "./management-service.ts";
export const INVITATION_DATABASE = "celebix_saas_staging_auth01";
export const INVITATION_TIMEOUTS = Object.freeze({ poolCheckoutMs: 2000, statementMs: 5000, lockMs: 3000, idleTransactionMs: 5000 });
type Pool = PostgresPoolLike & { end(): Promise<void>; on?(event: string, listener: () => void): unknown };
type Environment = Readonly<Record<string, string | undefined>>;
const authority = "uuid,uuid,uuid,uuid,text,bigint,timestamptz";
const signatures = {
  identity: [`manager(text,text,text,timestamptz)`, `list(${authority})`, `source(${authority},uuid,bigint)`, `resend_source(${authority},uuid,bigint)`, `issue(${authority},uuid,text,uuid,bigint,jsonb)`, `resend(${authority},uuid,text,uuid,bigint,jsonb)`, `revoke(${authority},uuid,text,uuid,bigint)`, `recover_operation(${authority},uuid,text)`, "resolve(text,timestamptz)", "grant(uuid,bigint,text,text,text,text,text,text,boolean,uuid,text,uuid,text,timestamptz,timestamptz)", "grant_preview(text,text,text,timestamptz)", "accept(text,text,text,uuid,text,uuid,uuid,timestamptz)", "recover_acceptance(text,text,text,uuid,text,timestamptz)"],
  workflow: ["delivery_claim(text,uuid,timestamptz,timestamptz,integer,uuid,text)", "delivery_authorize(uuid,uuid,text,timestamptz)", "delivery_settle(uuid,uuid,text,timestamptz,text,text,text,timestamptz)"],
};
export async function preflightInvitationPool(pool: PostgresPoolLike, role: "identity" | "workflow") {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT current_setting('server_version_num')::integer version_num,current_database() database_name,r.rolsuper is_superuser,
      pg_has_role(current_user,$1,'MEMBER') AND
      NOT EXISTS(SELECT 1 FROM unnest($2::text[]) signature LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature) WHERE p.oid IS NULL OR NOT p.prosecdef OR p.proowner<>'celebix_saas_owner'::regrole OR NOT ('search_path=pg_catalog, saas'=ANY(p.proconfig) OR 'search_path=pg_catalog,saas'=ANY(p.proconfig)) OR NOT has_function_privilege($1,p.oid,'EXECUTE') OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) AND
      NOT EXISTS(SELECT 1 FROM unnest(ARRAY['store_admin_invitations','store_admin_invitation_deliveries','store_admin_invitation_operations','store_admin_invitation_acceptance_grants','store_admin_invitation_events','store_admin_invitation_provider_events']) name LEFT JOIN pg_class c ON c.oid=to_regclass('saas.'||name) WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR c.relowner<>'celebix_saas_owner'::regrole) AND
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('saas.store_admin_invitations') AND conname='store_admin_invitations_role_check' AND convalidated) AND
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('saas.store_admin_invitation_deliveries') AND conname='store_admin_invitation_deliveries_renderer_version_check' AND convalidated) AND
      to_regprocedure('saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz)') IS NOT NULL AND
      to_regprocedure('saas.store_admin_invitation_delivery_claim(text,uuid,timestamptz,timestamptz,integer)') IS NULL AS ready
      FROM pg_roles r WHERE r.rolname=current_user`, [`celebix_saas_${role}`, signatures[role].map(s => `saas.store_admin_invitation_${s}`)]);
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row || Math.floor(Number(row.version_num) / 10000) !== 16 || row.database_name !== INVITATION_DATABASE || row.is_superuser !== false || row.ready !== true) throw Error("invitation_preflight_failed");
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL ROLE celebix_saas_${role}`);
    await client.query("ROLLBACK");
  } catch { try { await client.query("ROLLBACK"); } catch {} throw Error("invitation_preflight_failed"); }
  finally { client.release(); }
}
export async function initializeInvitationRuntime(env: Environment, owner: OwnerStagingAuthConfig, d: { createPool?(config: pg.PoolConfig): Pool; clock?(): Date; role?: "identity" | "workflow" } = {}) {
  let config: ReturnType<typeof parseInvitationRuntimeConfig>;
  let pool: Pool | undefined;
  const ownedKeys: Uint8Array[] = [];
  const wipe = () => { for (const key of ownedKeys) key.fill(0); };
  try {
    config = parseInvitationRuntimeConfig(env, owner.database, owner.authority);
    if (!config) return { state: "disabled" as const };
    ownedKeys.push(...Object.values(config.keyring.keys));
    if (config.database.name !== INVITATION_DATABASE) throw Error("target");
    pool = (d.createPool ?? (options => new pg.Pool(options)))({ ...config.poolConfig, max: 3, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000, statement_timeout: 5000, lock_timeout: 3000, idle_in_transaction_session_timeout: 5000, application_name: "celebix-invitations" });
    pool.on?.("error", () => undefined);
    await preflightInvitationPool(pool, d.role ?? "identity");
    const clock = d.clock ?? (() => new Date()), repository = createInvitationIdentityRepository({ pool, timeouts: INVITATION_TIMEOUTS });
    const sessionKey = new Uint8Array(owner.keys.session); ownedKeys.push(sessionKey);
    const service = createInvitationService({ repository, config: config.delivery, keyring: config.keyring, clock });
    const management = createInvitationManagementService({ panelOrigin: owner.authority.panelOrigin, sessionKeys: new Map([[owner.keys.sessionKeyId, sessionKey]]), resolver: createInvitationManagerResolver({ pool, timeouts: INVITATION_TIMEOUTS }), service, clock });
    const readyPool = pool; let closing: Promise<void> | undefined;
    return { state: "ready" as const, config, pool: readyPool, repository, management, close() { return closing ??= readyPool.end().finally(wipe); } };
  } catch { await pool?.end().catch(() => undefined); wipe(); return { state: "unavailable" as const }; }
}
