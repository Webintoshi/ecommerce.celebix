import {acquirePostgresClient} from '../postgres/pool.ts';
import {parseMerchantWhatsAppCommand} from '../../../saas-contracts/src/merchant-whatsapp/validation.ts';
import type {MerchantWhatsAppCommand} from '../../../saas-contracts/src/merchant-whatsapp/types.ts';
import type {PostgresMerchantWhatsAppOptions} from './types.ts';
import {merchantWhatsAppResult} from './validation.ts';
export class PostgresMerchantWhatsAppRepository {
 readonly options:PostgresMerchantWhatsAppOptions;
 constructor(options:PostgresMerchantWhatsAppOptions){this.options=options;if(options.role!=='celebix_saas_identity')throw Error('merchant_whatsapp_unavailable');}
 async command(command:MerchantWhatsAppCommand){const c=parseMerchantWhatsAppCommand(command);return execute(this.options,'celebix_saas_identity','SELECT outcome,authority FROM saas.merchant_whatsapp_command($1::text,$2::jsonb)',[c.action,JSON.stringify(c.input)]);}
}
export function createPostgresMerchantWhatsAppRepository(options:PostgresMerchantWhatsAppOptions){return new PostgresMerchantWhatsAppRepository(options);}
async function execute(options:Omit<PostgresMerchantWhatsAppOptions,'role'>,role:'celebix_saas_identity'|'celebix_saas_platform_operator',query:string,values:unknown[]){const client=await acquirePostgresClient(options.pool,options.timeouts.poolCheckoutMs);let released=false,committing=false;try{await client.query('BEGIN');for(const[name,ms]of [['statement_timeout',options.timeouts.statementMs],['lock_timeout',options.timeouts.lockMs],['idle_in_transaction_session_timeout',options.timeouts.idleTransactionMs]]as const){if(!Number.isSafeInteger(ms)||ms<1||ms>60000)throw Error();await client.query('SELECT pg_catalog.set_config($1,$2,true)',[name,`${ms}ms`]);}await client.query(`SET LOCAL ROLE ${role}`);const result=await client.query(query,values);if(result.rows.length!==1)throw Error();const parsed=merchantWhatsAppResult(result.rows[0]);committing=true;await client.query('COMMIT');client.release();released=true;return parsed;}catch{if(committing){client.release(true);released=true;throw Error('merchant_whatsapp_commit_unknown');}try{await client.query('ROLLBACK');}catch{client.release(true);released=true;}throw Error('merchant_whatsapp_unavailable');}finally{if(!released)client.release();}}

/** Only the central TOTP-authorized control plane supplies operator authority. */
export function createPostgresMerchantPhoneSecurityResetRepository(options:Omit<PostgresMerchantWhatsAppOptions,'role'>&{role:'celebix_saas_platform_operator'}){
 if(options.role!=='celebix_saas_platform_operator')throw Error('merchant_whatsapp_unavailable');
 return {async reset(input:import('../../../saas-contracts/src/merchant-whatsapp/types.ts').MerchantPhoneSecurityResetInput){
  if(!input||Object.keys(input).sort().join(',')!=='operationId,operatorId,principalId,reason'||!['operatorId','principalId','operationId'].every(k=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(input[k as 'operatorId']))||typeof input.reason!=='string'||input.reason!==input.reason.trim()||input.reason.length<10||input.reason.length>1000)throw Error('merchant_whatsapp_invalid_input');
  return execute(options,'celebix_saas_platform_operator',"SELECT value->>'outcome' AS outcome,NULL::jsonb AS authority FROM (SELECT saas.merchant_phone_security_reset($1::uuid,$2::uuid,$3::uuid,$4::text) AS value)x",[input.operatorId,input.principalId,input.operationId,input.reason]);
 }};
}
