import { randomUUID } from "node:crypto";

import type { AdminDomainView, StoreDomainDnsInstruction, TenantContext } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { StoreDomainRepositoryError } from "../store-domains/errors.ts";
import type { PostgresStoreDomainOriginHealthRepositoryOptions, PostgresStoreDomainRepositoryOptions, PostgresStoreDomainWorkflowRepositoryOptions, StoreDomainOriginHealth, StoreDomainWorkflowRepository } from "../store-domains/types.ts";
import { adminDomainView, authorityValues, date, exact, fingerprint, hostname, safeError, safeId, uuid, version, workflowClaim } from "../store-domains/validation.ts";

type Versioned=Readonly<{tenantContext:TenantContext;now:Date;domainId:string;expectedVersion:number}>;
type AdminDomainPersistence=Readonly<{
  list(input:Readonly<{tenantContext:TenantContext;now:Date}>):Promise<readonly AdminDomainView[]>;
  prepareCreate(input:Readonly<{tenantContext:TenantContext;now:Date;operationId:string;fingerprint:string;domainId:string;hostname:string;provider:"cloudflare_for_saas";cnameTarget:string}>):Promise<Readonly<{domain:AdminDomainView;replayed:boolean}>>;
  bindProvider(input:Readonly<{tenantContext:TenantContext;now:Date;domainId:string;expectedVersion:number;providerHostnameId:string;ownershipValidation:readonly StoreDomainDnsInstruction[];certificateValidation:readonly StoreDomainDnsInstruction[]}>):Promise<AdminDomainView>;
  requestRecheck(input:Versioned):Promise<AdminDomainView>;makePrimary(input:Versioned):Promise<AdminDomainView>;disable(input:Versioned):Promise<AdminDomainView>;
}>;

function fail(code:"invalid_input"|"feature_not_enabled"|"limit_reached"|"hostname_already_claimed"|"stale_version"|"not_found"|"operation_mismatch"|"unavailable"):never{throw new StoreDomainRepositoryError(code);}
function mapped(outcome:string):never{if(["invalid_input","durable_authority_invalid"].includes(outcome))fail("invalid_input");if(["feature_not_enabled","membership_denied","store_inactive"].includes(outcome))fail("feature_not_enabled");if(outcome==="limit_reached")fail("limit_reached");if(outcome==="hostname_already_claimed")fail("hostname_already_claimed");if(["stale_version","not_ready"].includes(outcome))fail("stale_version");if(["domain_not_found","not_found"].includes(outcome))fail("not_found");if(outcome==="operation_mismatch")fail("operation_mismatch");fail("unavailable");}

export class PostgresAdminDomainLifecycleRepository implements AdminDomainPersistence{
  readonly #options:PostgresStoreDomainRepositoryOptions;
  constructor(options:PostgresStoreDomainRepositoryOptions){if(!options||options.role!=="celebix_saas_app"||!options.pool||!options.timeouts)fail("unavailable");this.#options=options;}
  async #execute(text:string,values:unknown[],readOnly:boolean){let client:PostgresClientLike;try{client=await acquirePostgresClient(this.#options.pool,this.#options.timeouts.poolCheckoutMs);}catch{fail("unavailable");}let began=false;try{await client.query(readOnly?"BEGIN READ ONLY":"BEGIN");began=true;for(const[name,value]of [["statement_timeout",this.#options.timeouts.statementMs],["lock_timeout",this.#options.timeouts.lockMs],["idle_in_transaction_session_timeout",this.#options.timeouts.idleTransactionMs]]as const)await client.query("SELECT pg_catalog.set_config($1,$2,true)",[name,`${value}ms`]);await client.query("SET LOCAL ROLE celebix_saas_app");const result=await client.query(text,values);if(result.rows.length!==1)fail("unavailable");const row=exact(result.rows[0],["outcome","result_payload"],"unavailable");if(typeof row.outcome!=="string")fail("unavailable");await client.query("COMMIT");client.release();return{outcome:row.outcome,payload:row.result_payload};}catch(caught){if(began)try{await client.query("ROLLBACK");client.release();}catch{client.release(true);}else client.release(true);if(caught instanceof StoreDomainRepositoryError)throw caught;fail("unavailable");}}
  #authority(input:{tenantContext:unknown;now:unknown}){return[...authorityValues(input.tenantContext),date(input.now)];}
  #selected(result:{outcome:string;payload:unknown},accepted:readonly string[]){if(!accepted.includes(result.outcome))mapped(result.outcome);return adminDomainView(result.payload);}
  async list(input:Parameters<AdminDomainPersistence["list"]>[0]){const parsed=exact(input,["tenantContext","now"]);const result=await this.#execute("SELECT outcome,result_payload FROM saas.merchant_admin_domain_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",this.#authority(parsed as never),true);if(result.outcome!=="listed")mapped(result.outcome);const payload=exact(result.payload,["items"],"unavailable");if(!Array.isArray(payload.items)||payload.items.length>16)fail("unavailable");return Object.freeze(payload.items.map(adminDomainView));}
  async prepareCreate(input:Parameters<AdminDomainPersistence["prepareCreate"]>[0]){const p=exact(input,["tenantContext","now","operationId","fingerprint","domainId","hostname","provider","cnameTarget"]);if(p.provider!=="cloudflare_for_saas")fail("invalid_input");const result=await this.#execute("SELECT outcome,result_payload FROM saas.merchant_admin_domain_prepare_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::text,$13::text)",[...this.#authority(p as never),uuid(p.operationId),fingerprint(p.fingerprint),uuid(p.domainId),hostname(p.hostname),p.provider,hostname(p.cnameTarget)],false);return Object.freeze({domain:this.#selected(result,["prepared","operation_replayed"]),replayed:result.outcome==="operation_replayed"});}
  async bindProvider(input:Parameters<AdminDomainPersistence["bindProvider"]>[0]){const p=exact(input,["tenantContext","now","domainId","expectedVersion","providerHostnameId","ownershipValidation","certificateValidation"]);if(!Array.isArray(p.ownershipValidation)||!Array.isArray(p.certificateValidation))fail("invalid_input");const result=await this.#execute("SELECT outcome,result_payload FROM saas.merchant_admin_domain_bind_provider($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint,$10::text,$11::jsonb,$12::jsonb)",[...this.#authority(p as never),uuid(p.domainId),version(p.expectedVersion),safeId(p.providerHostnameId),JSON.stringify(p.ownershipValidation),JSON.stringify(p.certificateValidation)],false);return this.#selected(result,["bound"]);}
  async #versioned(name:"request_recheck"|"make_primary"|"disable",input:Parameters<AdminDomainPersistence["requestRecheck"]>[0]){const p=exact(input,["tenantContext","now","domainId","expectedVersion"]);const result=await this.#execute(`SELECT outcome,result_payload FROM saas.merchant_admin_domain_${name}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint)`,[...this.#authority(p as never),uuid(p.domainId),version(p.expectedVersion)],false);return this.#selected(result,[name==="request_recheck"?"recheck_requested":name==="make_primary"?"activated":"disabled"]);}
  requestRecheck(input:Parameters<AdminDomainPersistence["requestRecheck"]>[0]){return this.#versioned("request_recheck",input);}makePrimary(input:Parameters<AdminDomainPersistence["makePrimary"]>[0]){return this.#versioned("make_primary",input);}disable(input:Parameters<AdminDomainPersistence["disable"]>[0]){return this.#versioned("disable",input);}
}

export class PostgresAdminDomainWorkflowRepository implements StoreDomainWorkflowRepository {
  readonly #options: PostgresStoreDomainWorkflowRepositoryOptions;
  constructor(options: PostgresStoreDomainWorkflowRepositoryOptions) {
    if (!options || options.role !== "celebix_saas_workflow" || !options.pool || !options.timeouts) fail("unavailable");
    this.#options = options;
  }
  async #execute(text: string, values: unknown[]) {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.#options.pool, this.#options.timeouts.poolCheckoutMs); }
    catch { fail("unavailable"); }
    let began = false;
    try {
      await client.query("BEGIN"); began = true;
      for (const [name, value] of [["statement_timeout", this.#options.timeouts.statementMs], ["lock_timeout", this.#options.timeouts.lockMs], ["idle_in_transaction_session_timeout", this.#options.timeouts.idleTransactionMs]] as const) {
        await client.query("SELECT pg_catalog.set_config($1,$2,true)", [name, `${value}ms`]);
      }
      await client.query("SET LOCAL ROLE celebix_saas_workflow");
      const result = await client.query(text, values);
      if (result.rows.length !== 1) fail("unavailable");
      const row = exact(result.rows[0], ["outcome", "result_payload"], "unavailable");
      if (typeof row.outcome !== "string") fail("unavailable");
      await client.query("COMMIT"); client.release();
      return { outcome: row.outcome, payload: row.result_payload };
    } catch (caught) {
      if (began) try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); }
      else client.release(true);
      if (caught instanceof StoreDomainRepositoryError) throw caught;
      fail("unavailable");
    }
  }
  async claim(input: Parameters<StoreDomainWorkflowRepository["claim"]>[0]) {
    const parsed = exact(input, ["workerId", "now", "leaseExpiresAt", "limit"]);
    const now = date(parsed.now), leaseExpiresAt = date(parsed.leaseExpiresAt);
    if (!Number.isSafeInteger(parsed.limit) || (parsed.limit as number) < 1 || (parsed.limit as number) > 20 || leaseExpiresAt <= now) fail("invalid_input");
    const result = await this.#execute(
      "SELECT outcome,result_payload FROM saas.admin_domain_work_claim($1::text,$2::timestamptz,$3::timestamptz,$4::integer,$5::uuid)",
      [safeId(parsed.workerId), now, leaseExpiresAt, parsed.limit, randomUUID()],
    );
    if (result.outcome !== "claimed") mapped(result.outcome);
    const payload = exact(result.payload, ["items"], "unavailable");
    if (!Array.isArray(payload.items) || payload.items.length > (parsed.limit as number)) fail("unavailable");
    return Object.freeze(payload.items.map(workflowClaim));
  }
  async complete(input: Parameters<StoreDomainWorkflowRepository["complete"]>[0]): Promise<void> {
    const parsed = exact(input, ["domainId", "leaseId", "workerId", "now", "hostnameStatus", "sslStatus", "dnsStatus", "originStatus", "safeProviderErrorCode", "nextCheckAt"]);
    if (!["pending", "active", "failed", "deleted"].includes(String(parsed.hostnameStatus))
      || !["pending", "active", "failed", "deleted"].includes(String(parsed.sslStatus))
      || !["pending", "ready", "mismatch"].includes(String(parsed.dnsStatus))
      || !["pending", "ready", "failed"].includes(String(parsed.originStatus))) fail("invalid_input");
    const result = await this.#execute(
      "SELECT outcome,result_payload FROM saas.admin_domain_work_complete($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::text,$6::text,$7::text,$8::text,$9::text,$10::timestamptz)",
      [uuid(parsed.domainId), uuid(parsed.leaseId), safeId(parsed.workerId), date(parsed.now), parsed.hostnameStatus, parsed.sslStatus, parsed.dnsStatus, parsed.originStatus, safeError(parsed.safeProviderErrorCode), date(parsed.nextCheckAt)],
    );
    if (result.outcome !== "completed") mapped(result.outcome);
  }
  async fail(input: Parameters<StoreDomainWorkflowRepository["fail"]>[0]): Promise<void> {
    const parsed = exact(input, ["domainId", "leaseId", "workerId", "now", "errorCode", "retryAt", "terminal"]);
    if (typeof parsed.terminal !== "boolean") fail("invalid_input");
    const result = await this.#execute(
      "SELECT outcome,result_payload FROM saas.admin_domain_work_fail($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::text,$6::timestamptz,$7::boolean)",
      [uuid(parsed.domainId), uuid(parsed.leaseId), safeId(parsed.workerId), date(parsed.now), safeError(parsed.errorCode), date(parsed.retryAt), parsed.terminal],
    );
    if (result.outcome !== (parsed.terminal ? "failed" : "retry_scheduled")) mapped(result.outcome);
  }
}

export class PostgresAdminDomainOriginHealthRepository {
  readonly #options: PostgresStoreDomainOriginHealthRepositoryOptions;
  constructor(options: PostgresStoreDomainOriginHealthRepositoryOptions) {
    if (!options || options.role !== "celebix_saas_host_resolver" || !options.pool || !options.timeouts) fail("unavailable");
    this.#options = options;
  }
  async get(input: Readonly<{ hostname: string; now: Date }>): Promise<StoreDomainOriginHealth> {
    const parsed = exact(input, ["hostname", "now"]);
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.#options.pool, this.#options.timeouts.poolCheckoutMs); } catch { fail("unavailable"); }
    let began = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true;
      for (const [name, value] of [["statement_timeout", this.#options.timeouts.statementMs], ["lock_timeout", this.#options.timeouts.lockMs], ["idle_in_transaction_session_timeout", this.#options.timeouts.idleTransactionMs]] as const) {
        await client.query("SELECT pg_catalog.set_config($1,$2,true)", [name, `${value}ms`]);
      }
      await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
      const result = await client.query("SELECT outcome,result_payload FROM saas.resolve_admin_domain_origin_health($1::text,$2::timestamptz)", [hostname(parsed.hostname), date(parsed.now)]);
      if (result.rows.length !== 1) fail("unavailable");
      const row = exact(result.rows[0], ["outcome", "result_payload"], "unavailable");
      if (row.outcome !== "found") mapped(String(row.outcome));
      const payload = exact(row.result_payload, ["schemaVersion", "status", "storeId", "hostname"], "unavailable");
      if (payload.schemaVersion !== 1 || payload.status !== "ok") fail("unavailable");
      const projection = Object.freeze({ schemaVersion: 1 as const, status: "ok" as const, storeId: uuid(payload.storeId, "unavailable"), hostname: hostname(payload.hostname, "unavailable") });
      await client.query("COMMIT"); client.release();
      return projection;
    } catch (caught) {
      if (began) try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); }
      else client.release(true);
      if (caught instanceof StoreDomainRepositoryError) throw caught;
      fail("unavailable");
    }
  }
}
