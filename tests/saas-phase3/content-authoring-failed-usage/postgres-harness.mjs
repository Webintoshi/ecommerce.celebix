// Native PostgreSQL acceptance. Clone only an explicitly local feature-up fixture;
// never connect to a TCP server or print restored merchant data/credentials.
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
const root=path.resolve(import.meta.dirname,'../../..');
const sql=path.join(root,'apps/owner/scripts/sql/saas');
const host=process.env.CONTENT_USAGE_PG_SOCKET??path.join(homedir(),'.codex/tmp/celebix-content-authoring-20260929/restore-rehearsal/socket');
const port=Number(process.env.CONTENT_USAGE_PG_PORT??28173);
const template=process.env.CONTENT_USAGE_PG_TEMPLATE??'content_authoring_atomic_v2_runner';
assert.ok(path.isAbsolute(host)&&existsSync(host)&&!host.includes('\0'),'local Unix socket required');
assert.ok(/^content_authoring_[a-z0-9_]+$/.test(template),'only local content fixture templates allowed');
assert.ok(Number.isSafeInteger(port)&&port>1024&&port<65536);
const database='content_authoring_usage_'+process.pid+'_'+Date.now();
const config={host,port,user:'postgres',connectionTimeoutMillis:5000,query_timeout:15000};
const admin=new pg.Client({...config,database:'postgres'});
let client,peers=[],created=false;
const migrations=['202609290170_content_authoring_operations','202609290171_storefront_product_seo','202609290172_content_authoring_origins'];
const sourceHashes=()=>Object.fromEntries(migrations.flatMap(n=>['up','down'].map(dir=>{const f=n+'.'+dir+'.sql';return[f,createHash('sha256').update(readFileSync(path.join(sql,f))).digest('hex')];})));
const originalSources=sourceHashes();
const funcs=async()=> (await client.query("SELECT p.oid::text AS id,pg_get_functiondef(p.oid) AS def,p.proowner::text AS owner,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' ORDER BY p.oid")).rows;
const ids={store:randomUUID(),actor:randomUUID(),membership:randomUUID(),config:randomUUID(),draft:randomUUID()};
const now='2026-09-29T12:00:00.000Z',fp='a'.repeat(64),source='b'.repeat(64);
let auth;
const usage={inputTokens:150,outputTokens:25,totalTokens:175};
async function invoke(c,name,args,a=auth){await c.query('BEGIN');try{await c.query('SET LOCAL ROLE celebix_saas_app');const r=await c.query(`SELECT * FROM saas.content_authoring_${name}(${[...a,...args].map((_,i)=>'$'+(i+1)).join(',')})`,[...a,...args]);await c.query('COMMIT');return r.rows[0];}catch(e){await c.query('ROLLBACK');throw e;}}
async function claimed(){const id=randomUUID();assert.equal((await invoke(client,'begin',[id,fp,ids.draft,null,source,ids.config,'deepseek','deepseek-flash',1,'v1'])).outcome,'pending');const c=await invoke(client,'claim',[id,1]);assert.equal(c.outcome,'claimed');return{id,token:c.result_payload.claimToken};}
const args=(op,u=usage,code='invalid_output',state='dispatched',version=2)=>[op.id,op.token,version,code,state,u===null?null:JSON.stringify(u)];
const row=async id=>(await client.query('SELECT to_jsonb(o) AS row FROM saas.content_authoring_operations o WHERE id=$1',[id])).rows[0].row;
try{
 await admin.connect();
 assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
 await admin.query(`CREATE DATABASE ${database} TEMPLATE ${template}`);created=true;
 client=new pg.Client({...config,database});await client.connect();
 const before=await funcs();
 const plan=(await client.query("SELECT id,plan_code AS code,version FROM saas.plans WHERE plan_code='free_starter' ORDER BY version DESC LIMIT 1")).rows[0];assert.ok(plan);
 auth=[ids.store,ids.actor,ids.membership,plan.id,plan.code,Number(plan.version),now];
 await client.query('BEGIN');await client.query('SET LOCAL ROLE celebix_saas_owner');
 await client.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Synthetic usage fixture',$2,'active','tr','TRY','starter','2026-01-01','2026-01-01')",[ids.store,'usage-'+ids.store]);
 await client.query("INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES($1,'https://identity.example.test/oidc',$2,'usage@example.test',true,'2026-01-01','2026-01-01')",[ids.actor,ids.actor]);
 await client.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active','2026-01-01','2026-01-01')",[ids.membership,ids.actor,ids.store]);
 await client.query("INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active','2026-01-01','2026-01-01','2026-01-01')",[randomUUID(),ids.store,plan.id,plan.code,plan.version]);await client.query('COMMIT');
 const sealed={algorithm:'A256GCM',ciphertext:'Y3JlZGVudGlhbA',iv:'MTIzNDU2Nzg5MDEy',keyId:'qa',tag:'MTIzNDU2Nzg5MDEyMzQ1Ng',version:1};
 await client.query('BEGIN');await client.query('SET LOCAL ROLE celebix_saas_app');
 await client.query(`SELECT * FROM saas.toshi_provider_connect(${Array.from({length:18},(_,i)=>'$'+(i+1)).join(',')})`,[...auth,randomUUID(),fp,ids.config,'deepseek',JSON.stringify(sealed),'sha256:'+fp,1,'••••QA01','deepseek-flash',JSON.stringify([{id:'deepseek-flash',label:'Flash'}]),0]);await client.query('COMMIT');
 const first=await claimed();
 if(process.env.CONTENT_USAGE_RED==='1'){
  await invoke(client,'fail',args(first).slice(0,5));assert.deepEqual((await row(first.id)).usage,usage,'RED old failure RPC discards known usage');
 }else{
  await client.query(readFileSync(path.join(sql,'202609290173_content_authoring_failed_usage.up.sql'),'utf8'));
  const bad=[{},[],{...usage,raw:'synthetic'},{inputTokens:null,outputTokens:25,totalTokens:25},{inputTokens:true,outputTokens:25,totalTokens:26},{inputTokens:'150',outputTokens:25,totalTokens:175},{inputTokens:1.5,outputTokens:0,totalTokens:1.5},{inputTokens:-1,outputTokens:2,totalTokens:1},{inputTokens:2147483648,outputTokens:0,totalTokens:2147483648},{inputTokens:2147483647,outputTokens:1,totalTokens:2147483648},{...usage,totalTokens:176},{inputTokens:150,outputTokens:25}];
  const pending=await row(first.id);
  for(const u of bad){assert.equal((await invoke(client,'fail_v2',args(first,u))).outcome,'invalid_input');assert.deepEqual(await row(first.id),pending);}
  for(const extra of [args(first,usage,'cancelled'),args(first,usage,'invalid_output','unknown'),args(first,usage,'invalid_output','not_dispatched'),[first.id,null,2,'invalid_output','dispatched',JSON.stringify(usage)]]){assert.equal((await invoke(client,'fail_v2',extra)).outcome,'invalid_input');assert.deepEqual(await row(first.id),pending);}
  for(const extra of [[first.id,randomUUID(),2,'invalid_output','dispatched',JSON.stringify(usage)],args(first,usage,'invalid_output','dispatched',1)])assert.equal((await invoke(client,'fail_v2',extra)).outcome,'version_conflict');
  // Both alternate authorities are real, currently active owners; rejection must come
  // from operation tenant/actor binding, not a missing authority fixture.
  const otherActor=randomUUID(),otherMembership=randomUUID(),otherStore=randomUUID(),otherTenantMembership=randomUUID();
  await client.query("INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES($1,'https://identity.example.test/oidc',$2,'other-usage@example.test',true,'2026-01-01','2026-01-01')",[otherActor,otherActor]);
  await client.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active','2026-01-01','2026-01-01')",[otherMembership,otherActor,ids.store]);
  await client.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Other synthetic fixture',$2,'active','tr','TRY','starter','2026-01-01','2026-01-01')",[otherStore,'usage-'+otherStore]);
  await client.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active','2026-01-01','2026-01-01')",[otherTenantMembership,otherActor,otherStore]);
  await client.query("INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active','2026-01-01','2026-01-01','2026-01-01')",[randomUUID(),otherStore,plan.id,plan.code,plan.version]);
  for(const wrong of [[ids.store,otherActor,otherMembership,...auth.slice(3)],[otherStore,otherActor,otherTenantMembership,...auth.slice(3)]]){assert.equal((await invoke(client,'fail_v2',args(first),wrong)).outcome,'operation_not_found');assert.deepEqual(await row(first.id),pending);}
  await client.query("UPDATE saas.memberships SET status='revoked' WHERE id=$1",[ids.membership]);assert.equal((await invoke(client,'fail_v2',args(first))).outcome,'membership_denied');await client.query("UPDATE saas.memberships SET status='active' WHERE id=$1",[ids.membership]);
  // Fault after old fail transition, during usage assignment, must roll the entire statement back.
  await client.query("CREATE FUNCTION pg_temp.reject_fixture_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.usage IS NOT NULL THEN RAISE EXCEPTION 'synthetic usage update fault'; END IF; RETURN NEW; END $$");
  await client.query('CREATE TRIGGER usage_fixture_fault BEFORE UPDATE ON saas.content_authoring_operations FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_fixture_usage()');
  await assert.rejects(()=>invoke(client,'fail_v2',args(first)),/synthetic usage update fault/);assert.deepEqual(await row(first.id),pending);await client.query('DROP TRIGGER usage_fixture_fault ON saas.content_authoring_operations');
  const done=await invoke(client,'fail_v2',args(first));assert.equal(done.outcome,'failed');assert.deepEqual(done.result_payload.usage,usage);assert.equal(done.result_payload.version,3);assert.equal(done.result_payload.draft,null);const frozen=await row(first.id);
  assert.equal((await invoke(client,'fail_v2',args(first))).outcome,'failed');assert.deepEqual(await row(first.id),frozen);
  for(const u of [null,{inputTokens:1,outputTokens:1,totalTokens:2}]){assert.equal((await invoke(client,'fail_v2',args(first,u))).outcome,'operation_mismatch');assert.deepEqual(await row(first.id),frozen);}
  await client.query("UPDATE saas.memberships SET status='revoked' WHERE id=$1",[ids.membership]);assert.equal((await invoke(client,'fail_v2',args(first))).outcome,'membership_denied');await client.query("UPDATE saas.memberships SET status='active' WHERE id=$1",[ids.membership]);
  console.log('PASS malformed usages, authority/token/CAS, atomic rollback, exact replay and immutable known usage');
  peers=[new pg.Client({...config,database}),new pg.Client({...config,database})];await Promise.all(peers.map(c=>c.connect()));
  for(const same of [true,false]){const op=await claimed();const results=await Promise.all(peers.map((c,i)=>invoke(c,'fail_v2',args(op,same||i===0?usage:{inputTokens:2,outputTokens:3,totalTokens:5}))));assert.deepEqual(results.map(x=>x.outcome).sort(),same?['failed','failed']:['failed','operation_mismatch']);assert.equal((await row(op.id)).version,3);}
  for(const u of [null,{inputTokens:0,outputTokens:0,totalTokens:0},{inputTokens:2147483647,outputTokens:0,totalTokens:2147483647}]){const op=await claimed();assert.equal((await invoke(client,'fail_v2',args(op,u))).outcome,'failed');assert.deepEqual((await row(op.id)).usage,u);if(u===null){const jsonNull=args(op,null);jsonNull[5]='null';assert.equal((await invoke(client,'fail_v2',jsonNull)).outcome,'failed');assert.equal((await invoke(client,'fail_v2',args(op,usage))).outcome,'operation_mismatch');assert.equal((await row(op.id)).usage,null);}}
  // Six reservations exhausted at this time: advance only synthetic authority time.
  auth[6]='2026-09-29T12:02:00.000Z';
  const old=await claimed();assert.equal((await invoke(client,'fail',args(old).slice(0,5))).outcome,'failed');assert.equal((await row(old.id)).usage,null);
  const expired=await claimed();const later=[...auth];later[6]='2026-09-29T12:04:00.000Z';assert.equal((await invoke(client,'fail_v2',args(expired),later)).outcome,'version_conflict');assert.equal((await row(expired.id)).usage,null);assert.equal((await row(expired.id)).status,'unknown');
  for(const role of ['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver']){const grants=await client.query("SELECT has_function_privilege($1,'saas.content_authoring_fail_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,text,jsonb)','EXECUTE') AS execute,has_table_privilege($1,'saas.content_authoring_operations','UPDATE') AS raw",[role]);assert.equal(grants.rows[0].execute,role==='celebix_saas_app');assert.equal(grants.rows[0].raw,false);}
  const retained=(await client.query('SELECT to_jsonb(o) AS row FROM saas.content_authoring_operations o WHERE store_id=$1 ORDER BY id',[ids.store])).rows;
  await client.query(readFileSync(path.join(sql,'202609290173_content_authoring_failed_usage.down.sql'),'utf8'));assert.deepEqual(await funcs(),before);assert.deepEqual((await client.query('SELECT to_jsonb(o) AS row FROM saas.content_authoring_operations o WHERE store_id=$1 ORDER BY id',[ids.store])).rows,retained);
  await client.query(readFileSync(path.join(sql,'202609290173_content_authoring_failed_usage.up.sql'),'utf8'));const after=await funcs();assert.equal(after.length,before.length+1);assert.deepEqual(after.filter(x=>before.some(y=>x.id===y.id)),before);assert.deepEqual(sourceHashes(),originalSources);
  console.log('PASS concurrent replay, NULL/zero/max bounds, legacy RPC, expired fencing, RLS/grants, populated down/up and every original function owner/ACL/definition unchanged');
 }
}finally{await Promise.all(peers.map(c=>c.end()));await client?.end();if(created)await admin.query(`DROP DATABASE ${database}`);await admin.end();}
