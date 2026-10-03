import 'server-only';
import pg from 'pg';
import {normalizeAdminRequestHostname} from '@celebix/saas-data';
import {supportAccess,type SupportAccess} from './policy.ts';
let pool:pg.Pool|undefined;
function database():pg.Pool{
 if(process.env.CELEBIX_PLATFORM_SUPPORT_ENABLED!=='true')throw Error('support_disabled');
 if(pool)return pool;
 const url=process.env.CELEBIX_SUPPORT_DATABASE_URL?.trim(),name=process.env.CELEBIX_SAAS_DATABASE_NAME?.trim();
 if(!url||!name)throw Error('support_database_invalid');
 const parsed=new URL(url);
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||decodeURIComponent(parsed.pathname.slice(1))!==name||!parsed.username||['postgres','celebix_saas_owner'].includes(parsed.username))throw Error('support_database_invalid');
 const ca=process.env.CELEBIX_STAGING_DB_CA_B64;
 pool=new pg.Pool({connectionString:url,ssl:ca?{ca:Buffer.from(ca,'base64').toString('utf8'),rejectUnauthorized:true}:undefined,max:3,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,statement_timeout:5000,lock_timeout:3000,idle_in_transaction_session_timeout:5000,application_name:'celebix-platform-support'});
 pool.on('error',()=>undefined);
 return pool;
}
export async function supportQuery(action:'resolve'|'redeem'|'end',values:unknown[]):Promise<unknown>{
 const client=await database().connect();
 let terminal=false;
 try {
  const role=await client.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,pg_has_role(current_user,'celebix_saas_support_runtime','MEMBER') AS support,EXISTS(SELECT 1 FROM unnest(ARRAY['celebix_saas_owner','celebix_saas_bootstrap','celebix_saas_platform_operator','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_migrator']) AS privileged(name) WHERE pg_has_role(current_user,privileged.name,'MEMBER')) AS excessive FROM pg_roles WHERE rolname=current_user");
  if(role.rows[0]?.rolsuper!==false||role.rows[0]?.rolbypassrls!==false||role.rows[0]?.rolcreaterole!==false||role.rows[0]?.rolcreatedb!==false||role.rows[0]?.rolreplication!==false||role.rows[0]?.support!==true||role.rows[0]?.excessive!==false)throw Error('support_database_role_invalid');
  await client.query(action==='resolve'?'BEGIN READ ONLY':'BEGIN');
  await client.query('SET LOCAL ROLE celebix_saas_support_runtime');
  const query=action==='resolve'?'SELECT saas.platform_support_resolve($1,$2,$3) AS result':action==='redeem'?'SELECT saas.platform_support_redeem($1,$2,$3) AS result':'SELECT saas.platform_support_end($1,$2) AS result';
  const result=await client.query(query,values);
  try { await client.query('COMMIT'); }catch { terminal=true;client.release(true);throw Error('support_unavailable'); }
  return result.rows[0]?.result;
 }catch{if(!terminal)await client.query('ROLLBACK').catch(()=>{terminal=true;client.release(true);});throw Error('support_unavailable');}finally{if(!terminal)client.release();}
}
export async function resolveSupportCredential(input:Readonly<{credential:string;hostname?:string|null;requestId:string;now:Date}>):Promise<SupportAccess>{
 if(process.env.CELEBIX_PLATFORM_SUPPORT_ENABLED!=='true')return {kind:'unauthorized'};
 if(!/^support:[a-f0-9]{64}$/.test(input.credential))return {kind:'unauthorized'};
 try{const host=normalizeAdminRequestHostname(input.hostname);return supportAccess(await supportQuery('resolve',[input.credential.slice(8),host,input.requestId]),host,input.now);}catch{return {kind:'unavailable'};}
}
