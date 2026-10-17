import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresNativeMarketingRepository, type PostgresPoolLike } from "@celebix/saas-data";
import type { NativeMarketingConfig } from "./config.ts";
import { sendNativeMarketingEmail } from "./resend.ts";
import { createNativeMarketingWorker } from "./worker.ts";
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
type Pool = PostgresPoolLike & Readonly<{ end(): Promise<void> }>;
export type NativeMarketingProductionDependencies = Readonly<{ createPool(url: string, name: string): Pool; fetch: typeof fetch; uuid(): string; now(): Date }>;
const defaults: NativeMarketingProductionDependencies = {
  createPool(connectionString, application_name) { const pool = new pg.Pool({ connectionString, application_name, max: 4, connectionTimeoutMillis: 2_000, idleTimeoutMillis: 10_000 }); pool.on("error", () => undefined); return pool; },
  fetch: (url,init) => globalThis.fetch(url,init), uuid: randomUUID, now: () => new Date(),
};
async function preflight(pool: PostgresPoolLike, name: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true)", ["5000ms", "2000ms", "5000ms"]);
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,current_user AS current_role,role.rolsuper AS session_is_superuser,pg_has_role(session_user,'celebix_saas_workflow','MEMBER') AS workflow_member,
      to_regprocedure('saas.native_marketing_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid,uuid[],boolean)') IS NOT NULL
      AND to_regprocedure('saas.native_marketing_work_authorize(uuid,uuid,text,timestamp with time zone)') IS NOT NULL
      AND to_regprocedure('saas.native_marketing_work_seal(uuid,uuid,text,timestamp with time zone,text,bytea,text,text,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL
      AND to_regprocedure('saas.native_marketing_work_finish(uuid,uuid,text,timestamp with time zone,text,text,timestamp with time zone)') IS NOT NULL
      AND to_regprocedure('saas.native_marketing_provider_event_record(text,text,text,timestamp with time zone,timestamp with time zone,text)') IS NOT NULL AS native_marketing_lifecycle
      FROM pg_catalog.pg_roles AS role WHERE role.rolname=session_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num)/10_000) !== 16 || row.database_name !== name || row.current_role !== "celebix_saas_workflow" || row.session_is_superuser !== false || row.workflow_member !== true || row.native_marketing_lifecycle !== true) throw new Error("native_marketing_production_preflight_failed");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
export async function initializeNativeMarketingProductionRuntime(config: NativeMarketingConfig, deps: NativeMarketingProductionDependencies = defaults) {
  const pool = deps.createPool(config.database.url,`celebix-native-marketing-${config.workerId}`);
  try {
    await preflight(pool,config.database.name);
    const repository = new PostgresNativeMarketingRepository({ pool,role:"celebix_saas_workflow",timeouts:TIMEOUTS,uuid:deps.uuid });
    const worker = createNativeMarketingWorker({ repository,keyring:config.keyring,deliveryMode:config.deliveryMode,...(config.testRecipient ? {testRecipient:config.testRecipient}:{}),senderEmail:config.senderEmail,publicOrigin:config.publicOrigin,...(config.postalAddress ? {postalAddress:config.postalAddress}:{}),storeIds:config.storeIds,workerId:config.workerId,now:deps.now,send:(request,idempotencyKey)=>sendNativeMarketingEmail(request,{apiKey:config.resendApiKey,idempotencyKey,timeoutMs:5_000,fetch:deps.fetch}) });
    return Object.freeze({runOnce:worker.runOnce,async close(){await pool.end();for(const key of Object.values(config.keyring.keys))key.fill(0);}});
  } catch(error) { await pool.end().catch(()=>undefined);for(const key of Object.values(config.keyring.keys))key.fill(0);throw error; }
}
