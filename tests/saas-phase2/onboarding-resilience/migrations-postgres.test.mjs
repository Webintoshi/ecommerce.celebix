import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const marker='celebix-task-owned-disposable-onboarding-20260927';
const databases=['onboarding_migrations_qa_20260928','onboarding_preservation_qa_20260928'];
const stems=['202609270167_registration_onboarding_jobs','202609270168_registration_status_bindings','202609270169_checkout_delivery_days'];
const tables=['stores','principals','memberships','subscriptions','domains','store_domains','admin_domains','storefront_designs','store_media_namespaces','merchant_admin_records'];
const enabled=process.env.CELEBIX_ONBOARDING_MIGRATIONS_QA==='combined-20260928';
function config(database,env=process.env){
 if(env.CELEBIX_ONBOARDING_MIGRATIONS_QA!=='combined-20260928'||!databases.includes(database))throw new Error('explicit_task_database_required');
 if(Object.keys(env).some(key=>key==='DATABASE_URL'||key.startsWith('PG')||key.includes('SUPABASE')||key==='POSTGRES_URL'))throw new Error('ambient_database_authority_denied');
 return {host:'127.0.0.1',port:56417,user:'postgres',database,max:1,connectionTimeoutMillis:3000};
}
const sql=(stem,suffix)=>readFile(new URL(`../../../apps/owner/scripts/sql/saas/${stem}${suffix}`,import.meta.url),'utf8');
async function preservation(client){
 const result={};
 for(const table of tables){
  result[table]=(await client.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(row)::text),'' ORDER BY md5(to_jsonb(row)::text)),'')) AS digest FROM saas.${table} row`)).rows[0];
 }
 return result;
}
async function validator(client){
 return (await client.query("SELECT oid::int,proowner::int,proacl::text,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid='saas.merchant_admin_config_valid(text,jsonb)'::regprocedure")).rows[0];
}
async function apply(client){
 for(const stem of stems){await client.query(await sql(stem,'.up.sql'));await client.query(await sql(stem,'_assertions.sql'));}
}

test('combined migration QA rejects ambient or unapproved database authority',()=>{
 const env={CELEBIX_ONBOARDING_MIGRATIONS_QA:'combined-20260928'};
 assert.equal(config(databases[0],env).host,'127.0.0.1');
 for(const key of ['DATABASE_URL','PGHOST','POSTGRES_URL','SUPABASE_DB_URL'])assert.throws(()=>config(databases[0],{...env,[key]:'denied'}));
 assert.throws(()=>config('celebix_saas_staging_auth01',env));
 assert.throws(()=>config(databases[0],{}));
});

for(const database of databases)test(`PG16 combined167/168/169 and preservation: ${database}`,{skip:!enabled},async()=>{
 const pool=new pg.Pool(config(database));const client=await pool.connect();
 try{
  const authority=(await client.query("SELECT current_database() AS name,current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
  assert.equal(authority.name,database);assert.equal(Math.floor(authority.version/10000),16);assert.equal(authority.marker,marker);
  assert.equal((await client.query("SELECT to_regclass('saas.registration_onboarding_jobs') IS NULL AND to_regclass('saas.registration_status_bindings') IS NULL AND to_regclass('saas.checkout_delivery_days_backup') IS NULL AS absent")).rows[0].absent,true,'fresh schema166 fixture required');
  const before=await preservation(client);const originalValidator=await validator(client);
  await apply(client);assert.deepEqual(await preservation(client),before);
  assert.equal((await client.query("SELECT saas.merchant_admin_config_valid('shipping_setting','{\"shippingPriceCents\":1489,\"estimatedDays\":365}'::jsonb) AS valid")).rows[0].valid,true);
  for(const table of ['registration_authority_scopes','registration_onboarding_jobs','registration_onboarding_access','registration_onboarding_heartbeats','registration_status_bindings','checkout_delivery_days_backup']){
   const flags=(await client.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[`saas.${table}`])).rows[0];
   assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true});
   for(const role of ['celebix_saas_identity','celebix_saas_app'])assert.equal((await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[role,`saas.${table}`])).rows[0].allowed,false);
  }
  if(database===databases[0]){
   assert.equal(before.stores.count,0);
   for(const stem of [...stems].reverse())await client.query(await sql(stem,'.down.sql'));
   assert.deepEqual(await validator(client),originalValidator,'down restores validator OID,owner,ACL and definition exactly');
   assert.deepEqual(await preservation(client),before);
   await apply(client);assert.deepEqual(await preservation(client),before);
  }else{
   assert.ok(before.stores.count>0,'private restored merchant rows required for preservation');
   const count=(await client.query('SELECT count(*)::int AS count FROM saas.registration_authority_scopes')).rows[0].count;
   if(count>0){
    const guardedDown=await sql(stems[0],'.down.sql');
    await assert.rejects(()=>client.query(guardedDown),/ONBOARDING_ROLLBACK_HAS_DURABLE_AUTHORITY/);
    await client.query('ROLLBACK');assert.deepEqual(await preservation(client),before);
   }
  }
  console.info(JSON.stringify({database,pass:true,cycle:database===databases[0]?'up/assertions/down/up':'up/assertions',preservedTables:tables.length,roleAndRlsChecks:true}));
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
});
