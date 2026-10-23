import {isCatalogProductOperationAllowed,parseProductTaxRead,type ProductTaxRead,type TenantContext} from '@celebix/saas-contracts';
import {acquirePostgresClient,type PostgresPoolLike,type PostgresTimeoutOptions} from '../postgres/pool.ts';
import {catalogAuthority,catalogUuid} from '../catalog/validation.ts';
import {CATALOG_ERROR_CODES,CatalogRepositoryError,type CatalogErrorCode} from '../catalog/errors.ts';

export type ProductTaxReadInput=Readonly<{tenantContext:TenantContext;now:Date;productId:string}>;
export interface ProductTaxRepository{read(input:ProductTaxReadInput):Promise<ProductTaxRead>;}
function fail(code:CatalogErrorCode='unavailable'):never{throw new CatalogRepositoryError(code);}
export function createPostgresProductTaxRepository(options:Readonly<{pool:PostgresPoolLike;timeouts?:PostgresTimeoutOptions}>):ProductTaxRepository{
 if(typeof window!=='undefined'||!options.pool||typeof options.pool.connect!=='function')fail();
 const limits={poolCheckoutMs:3000,statementMs:10000,lockMs:3000,idleTransactionMs:10000,...options.timeouts};
 if(Object.values(limits).some(value=>!Number.isSafeInteger(value)||value<1||value>60000))fail('invalid_input');
 return Object.freeze({async read(input:ProductTaxReadInput):Promise<ProductTaxRead>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='now,productId,tenantContext')fail('invalid_input');
  const authority=catalogAuthority(input.tenantContext,input.now),productId=catalogUuid(input.productId);
  if(!isCatalogProductOperationAllowed(authority.role,'read'))fail('membership_denied');
  let client;try{client=await acquirePostgresClient(options.pool,limits.poolCheckoutMs);}catch{fail();}
  let terminal=false;
  try{
   await client.query('BEGIN READ ONLY');
   await client.query("SELECT pg_catalog.set_config('statement_timeout',$1,true)",[limits.statementMs+'ms']);
   await client.query("SELECT pg_catalog.set_config('lock_timeout',$1,true)",[limits.lockMs+'ms']);
   await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout',$1,true)",[limits.idleTransactionMs+'ms']);
   await client.query('SET LOCAL ROLE celebix_saas_app');
   const result=await client.query('SELECT outcome,result_payload FROM saas.catalog_tax_read($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)',[authority.storeId,authority.principalId,authority.membershipId,authority.planId,authority.planCode,authority.planVersion,authority.now,productId]);
   if(result.rows.length!==1)fail();const row=result.rows[0];
   if(row.outcome!=='found'){if(row.outcome==='not_found')fail('product_not_found');if(typeof row.outcome==='string'&&(CATALOG_ERROR_CODES as readonly string[]).includes(row.outcome))fail(row.outcome as CatalogErrorCode);fail();}
   let projected:ProductTaxRead;try{projected=parseProductTaxRead(row.result_payload);}catch{fail();}
   if(projected.productId!==productId)fail();
   try{await client.query('COMMIT');terminal=true;client.release();}catch{terminal=true;client.release(true);fail();}
   return projected;
  }catch(error){if(!terminal){try{await client.query('ROLLBACK');client.release();}catch{client.release(true);}}if(error instanceof CatalogRepositoryError)throw error;fail();}
 }});
}
