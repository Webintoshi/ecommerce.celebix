import {assertPlatformDatabaseRole,PLATFORM_ROLE_QUERY} from './database-role.ts';
import 'server-only';
import pg from 'pg';
import {createHmac} from 'node:crypto';
import type {PlatformMutation,PlatformReadEnvelope} from '@celebix/saas-contracts';
import type {PlatformRegistryRecord} from './authority.ts';
import {PostgresPlatformRepository,PlatformRepositoryError} from '@celebix/saas-data';

let pool:pg.Pool|undefined;
function invitationIssuer():string{const issuer=process.env.CELEBIX_LOGTO_ISSUER?.trim();if(!issuer||issuer.length>2048)throw new PlatformRepositoryError('unavailable');const url=new URL(issuer);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new PlatformRepositoryError('unavailable');return issuer;}
function database():pg.Pool {
 if(pool)return pool;
 const url=process.env.CELEBIX_PLATFORM_DATABASE_URL?.trim();
 const name=process.env.CELEBIX_SAAS_DATABASE_NAME?.trim();
 if(!url||!name)throw new Error('platform_database_unavailable');
 const parsed=new URL(url);
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||decodeURIComponent(parsed.pathname.slice(1))!==name||!parsed.username||['postgres','celebix_saas_owner'].includes(parsed.username))throw new Error('platform_database_configuration_invalid');
 const ca=process.env.CELEBIX_STAGING_DB_CA_B64;
 pool=new pg.Pool({connectionString:url,ssl:ca?{ca:Buffer.from(ca,'base64').toString('utf8'),rejectUnauthorized:true}:undefined,max:4,connectionTimeoutMillis:2500,idleTimeoutMillis:10000,statement_timeout:10000,lock_timeout:3000,idle_in_transaction_session_timeout:10000,application_name:'celebix-platform-owner'});
 pool.on('error',()=>undefined);
 return pool;
}
export async function platformTransaction<T>(write:boolean,run:(client:pg.PoolClient)=>Promise<T>):Promise<T> {
 const client=await database().connect();
 let terminal=false;
 try {
  const role=await client.query(PLATFORM_ROLE_QUERY);
  assertPlatformDatabaseRole(role.rows[0]);
  await client.query(write?'BEGIN':'BEGIN READ ONLY');
  await client.query('SET LOCAL ROLE celebix_saas_platform_operator');
  const result=await run(client);
  try{await client.query('COMMIT');}catch{terminal=true;client.release(true);throw new PlatformRepositoryError(write?'commit_unknown':'unavailable');}
  return result;
 }catch(error){if(!terminal)await client.query('ROLLBACK').catch(()=>{terminal=true;client.release(true);});throw error;}finally{if(!terminal)client.release();}
}
function repository(){return new PostgresPlatformRepository({pool:{async connect(){const client=await database().connect();try{const r=await client.query(PLATFORM_ROLE_QUERY);assertPlatformDatabaseRole(r.rows[0]);return client;}catch(e){client.release(true);throw e;}}},role:'celebix_saas_platform_operator',timeouts:{poolCheckoutMs:2500,statementMs:10000,lockMs:3000,idleTransactionMs:10000}});}
export async function resolvePlatformRegistry(issuer:string,subject:string):Promise<PlatformRegistryRecord|null> {
 try{const v=await repository().resolveOperator(issuer,subject);return {operatorId:String(v.operatorId??v.id),principalId:String(v.principalId??v.principal_id),issuer:String(v.issuer),subject:String(v.subject),active:v.active===true,label:String(v.label??v.email),version:Number(v.version)};}catch(e){if(e instanceof PlatformRepositoryError&&e.code==='operator_denied')return null;throw e;}
}
export async function readPlatform(operatorId:string,resource:string,query:Record<string,unknown>={}):Promise<PlatformReadEnvelope> {
 if(resource==='operations')return platformTransaction(false,async c=>(await c.query('SELECT saas.platform_operations_read($1::uuid,$2::jsonb) AS value',[operatorId,JSON.stringify(query)])).rows[0].value);
 if(resource==='invitations')return platformTransaction(false,async c=>(await c.query('SELECT saas.platform_invitation_read($1::uuid,$2::jsonb,$3::text) AS value',[operatorId,JSON.stringify(query),invitationIssuer()])).rows[0].value);
 if(resource==='store-detail')return platformTransaction(false,async c=>{
  const value=(await c.query('SELECT saas.platform_read($1::uuid,$2::text,$3::jsonb) AS value',[operatorId,resource,JSON.stringify(query)])).rows[0].value;
  const invitations=(await c.query('SELECT saas.platform_invitation_read($1::uuid,$2::jsonb,$3::text) AS value',[operatorId,JSON.stringify({storeId:query.storeId}),invitationIssuer()])).rows[0].value;
  return {...value,store:value.store?{...value.store,invitations:invitations.items}:value.store};
 });
 return await repository().read(operatorId,resource,query) as PlatformReadEnvelope;
}
export async function commandPlatform(operatorId:string,input:PlatformMutation):Promise<Record<string,unknown>> {
 if(input.action==='support.issue'&&process.env.CELEBIX_PLATFORM_SUPPORT_ENABLED!=='true')throw new PlatformRepositoryError('support_denied');
 if(input.action==='operations.retry')return platformTransaction(true,async c=>(await c.query('SELECT saas.platform_operations_retry($1::uuid,$2::jsonb,$3::bigint,$4::text) AS value',[operatorId,JSON.stringify(input.payload),input.expectedVersion,input.idempotencyKey])).rows[0].value);
 if(input.action==='ownership.invite')return platformTransaction(true,async c=>(await c.query('SELECT saas.platform_invitation_create($1::uuid,$2::jsonb,$3::bigint,$4::text,$5::text) AS value',[operatorId,JSON.stringify(input.payload),input.expectedVersion,input.idempotencyKey,invitationIssuer()])).rows[0].value);
 let payload=input.payload;
 if(input.action==='support.issue'){
  if(Object.keys(payload).some(k=>!['storeId','adminHost','reason'].includes(k))||typeof payload.storeId!=='string'||typeof payload.adminHost!=='string'||typeof payload.reason!=='string')throw new PlatformRepositoryError('invalid_input');
  const encoded=process.env.CELEBIX_PLATFORM_HANDOFF_KEY_B64URL;const key=encoded?Buffer.from(encoded,'base64url'):null;if(!key||key.length!==32)throw new PlatformRepositoryError('unavailable');
  const canonical=JSON.stringify({schemaVersion:1,operatorId,key:input.idempotencyKey,expectedVersion:input.expectedVersion,storeId:payload.storeId,adminHost:payload.adminHost,reason:payload.reason.trim()});
  payload={...payload,handoff:createHmac('sha256',key).update(canonical).digest('hex')};
 }
 const result=await repository().command(operatorId,input.action,payload,input.expectedVersion,input.idempotencyKey);
 if(['support.issue','support.revoke','sales.pause','sales.resume'].includes(input.action)&&!result.outcome)return {outcome:result.replayed===true?'replayed':'committed',version:result.version??1,result};
 return result;
}
