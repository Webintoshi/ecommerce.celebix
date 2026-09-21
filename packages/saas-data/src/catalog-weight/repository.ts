import { createHash } from "node:crypto";
import { isCatalogProductOperationAllowed, parseCatalogWeightEditorProjection } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { catalogAuthority, catalogUuid, positiveVersion } from "../catalog/validation.ts";
import { catalogWeightFailure, catalogWeightRepositoryErrorCode, type CatalogWeightErrorCode } from "./errors.ts";
import type { CatalogWeightRepository, PostgresCatalogWeightRepositoryOptions } from "./types.ts";

const GET = "SELECT outcome,result_payload FROM saas.catalog_weight_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)";
const SAVE = "SELECT outcome,result_payload FROM saas.catalog_weight_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::uuid,$12::uuid,$13::bigint,$14::bigint,$15::bigint,$16::bigint,$17::text,$18::text,$19::boolean,$20::integer)";
const RECOVER = "SELECT outcome,result_payload FROM saas.catalog_weight_operation_result($1::uuid,$2::uuid,$3::text,$4::text)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function unavailable(): never { throw catalogWeightFailure("unavailable"); }
function timeout(value: unknown): string { if (!Number.isSafeInteger(value) || (value as number)<1 || (value as number)>60_000) unavailable(); return `${value}ms`; }
function release(client: PostgresClientLike,destroy=false) { try { client.release(destroy||undefined); } catch { /* terminal */ } }
function row(result: Readonly<{ rows: unknown[]; rowCount?: number|null }>): { outcome: string; payload: unknown } {
  if (result.rowCount!==1 || !Array.isArray(result.rows) || result.rows.length!==1) unavailable();
  const candidate=result.rows[0];
  if (!candidate || typeof candidate!=="object" || Array.isArray(candidate)) unavailable();
  const parsed=candidate as Record<string,unknown>;
  if (Object.keys(parsed).sort().join(",")!=="outcome,result_payload" || typeof parsed.outcome!=="string") unavailable();
  return { outcome: parsed.outcome, payload: parsed.result_payload };
}
function mapped(value:string): CatalogWeightErrorCode|undefined {
  const direct = value==="not_found" ? "resource_not_found" : value;
  const known=new Set<CatalogWeightErrorCode>(["invalid_input","unauthenticated","membership_denied","store_inactive","feature_not_enabled","resource_not_found","profile_not_enabled","version_conflict","operation_mismatch","durable_authority_invalid","unavailable"]);
  return known.has(direct as CatalogWeightErrorCode) ? direct as CatalogWeightErrorCode : undefined;
}
function authorityValues(authority: ReturnType<typeof catalogAuthority>): unknown[] {
  return [authority.storeId,authority.principalId,authority.membershipId,authority.planId,authority.planCode,authority.planVersion,authority.now];
}
function fingerprint(storeId:string,body:unknown):string {
  return createHash("sha256").update(JSON.stringify({kind:"manual_save",storeId,body}),"utf8").digest("hex");
}
function id(value:unknown):string { if(typeof value!=="string"||!UUID.test(value)) throw catalogWeightFailure("invalid_input"); return value; }

export class PostgresCatalogWeightRepository implements CatalogWeightRepository {
  private readonly options: PostgresCatalogWeightRepositoryOptions;
  constructor(options: PostgresCatalogWeightRepositoryOptions) {
    try {
      if (!options || options.role!=="celebix_saas_app" || !options.pool || typeof options.pool.connect!=="function" || typeof options.audit!=="function") unavailable();
      for(const value of Object.values(options.timeouts)) timeout(value);
      this.options=Object.freeze({...options,timeouts:Object.freeze({...options.timeouts})});
    } catch { unavailable(); }
  }
  private async acquire(){ try{return await acquirePostgresClient(this.options.pool,this.options.timeouts.poolCheckoutMs);}catch{return unavailable();} }
  private async query(client:PostgresClientLike,text:string,values?:unknown[]){try{return await client.query(text,values);}catch{return unavailable();}}
  private async configure(client:PostgresClientLike){
    await this.query(client,"SELECT pg_catalog.set_config('statement_timeout',$1,true)",[timeout(this.options.timeouts.statementMs)]);
    await this.query(client,"SELECT pg_catalog.set_config('lock_timeout',$1,true)",[timeout(this.options.timeouts.lockMs)]);
    await this.query(client,"SELECT pg_catalog.set_config('idle_in_transaction_session_timeout',$1,true)",[timeout(this.options.timeouts.idleTransactionMs)]);
    await this.query(client,"SET LOCAL ROLE celebix_saas_app");
  }
  private async rollback(client:PostgresClientLike){try{await this.query(client,"ROLLBACK");release(client);}catch{release(client,true);}}
  private projection(payload:unknown,productId:string){try{const parsed=parseCatalogWeightEditorProjection(payload);if(parsed.declarations.some(item=>item.productId!==productId))return unavailable();return parsed;}catch{return unavailable();}}
  private emitUnknown(){try{const pending=this.options.audit({type:"catalog_weight_commit_unknown"});if(pending)void pending.catch(()=>undefined);}catch{/* observational */}}
  async get(input:Parameters<CatalogWeightRepository["get"]>[0]){
    const authority=catalogAuthority(input.tenantContext,input.now); const productId=catalogUuid(input.productId);
    if(!isCatalogProductOperationAllowed(authority.role,"read"))throw catalogWeightFailure("membership_denied");
    const client=await this.acquire();let began=false,terminal=false;
    try{await this.query(client,"BEGIN READ ONLY");began=true;await this.configure(client);const selected=row(await this.query(client,GET,[...authorityValues(authority),productId]));
      const code=mapped(selected.outcome);if(code)throw catalogWeightFailure(code);if(selected.outcome!=="found")unavailable();const projected=this.projection(selected.payload,productId);
      await this.query(client,"COMMIT");terminal=true;release(client);return projected;
    }catch(error){if(began&&!terminal)await this.rollback(client);else if(!terminal)release(client,true);if(catalogWeightRepositoryErrorCode(error))throw error;return unavailable();}
  }
  async save(input:Parameters<CatalogWeightRepository["save"]>[0]){
    const authority=catalogAuthority(input.tenantContext,input.now); const productId=catalogUuid(input.productId),declarationId=id(input.declarationId);
    if(!isCatalogProductOperationAllowed(authority.role,"update"))throw catalogWeightFailure("membership_denied");
    const intent=input.intent; id(intent.operationId); positiveVersion(intent.expectedProductVersion);
    if(!Number.isSafeInteger(intent.expectedDeclarationVersion)||intent.expectedDeclarationVersion<0)throw catalogWeightFailure("invalid_input");
    const variantId=intent.target.variantId===null?null:id(intent.target.variantId);
    const expectedVariant=input.expectedVariantVersion===null?null:positiveVersion(input.expectedVariantVersion);
    if((variantId===null)!==(expectedVariant===null))throw catalogWeightFailure("invalid_input");
    const body={declarationId,productId,expectedVariantVersion:expectedVariant,intent};const hash=fingerprint(authority.storeId,body);
    const values=[...authorityValues(authority),intent.operationId,hash,declarationId,productId,variantId,intent.expectedProductVersion,expectedVariant,intent.expectedDeclarationVersion,
      intent.declaration.gramsMilli,intent.declaration.scope,intent.declaration.salesUnit,intent.declaration.approximate,intent.declaration.toleranceBasisPoints];
    const client=await this.acquire();let began=false,terminal=false;
    try{await this.query(client,"BEGIN ISOLATION LEVEL READ COMMITTED");began=true;await this.configure(client);const selected=row(await this.query(client,SAVE,values));
      const code=mapped(selected.outcome);if(code)throw catalogWeightFailure(code);if(selected.outcome!=="saved"&&selected.outcome!=="operation_replayed")unavailable();const projected=this.projection(selected.payload,productId);
      try{await this.query(client,"COMMIT");terminal=true;release(client);return projected;}catch{terminal=true;release(client,true);this.emitUnknown();
        const recoveredClient=await this.acquire();let recoverBegan=false,recoverTerminal=false;try{await this.query(recoveredClient,"BEGIN READ ONLY");recoverBegan=true;await this.configure(recoveredClient);
          const recovered=row(await this.query(recoveredClient,RECOVER,[authority.storeId,intent.operationId,"manual_save",hash]));if(recovered.outcome!=="operation_replayed")unavailable();const result=this.projection(recovered.payload,productId);
          await this.query(recoveredClient,"COMMIT");recoverTerminal=true;release(recoveredClient);return result;
        }catch(error){if(recoverBegan&&!recoverTerminal)await this.rollback(recoveredClient);else if(!recoverTerminal)release(recoveredClient,true);if(catalogWeightRepositoryErrorCode(error))throw error;return unavailable();}}
    }catch(error){if(began&&!terminal)await this.rollback(client);else if(!terminal)release(client,true);if(catalogWeightRepositoryErrorCode(error))throw error;return unavailable();}
  }
}
