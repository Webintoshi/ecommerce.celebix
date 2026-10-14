import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// Actual Merchant trigger/enqueue functions in a disposable socket-only cluster.
const SQL=import.meta.dirname,BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202610150235_google_merchant_domain_health_queue.up.sql',DOWN=UP.replace('.up.','.down.'),ASSERT=UP.replace('.up.','_assertions.');
const root=mkdtempSync('/tmp/celebix-merchant-domain-'),socket=path.join(root,'socket'),data=path.join(root,'data'),port=26000+Math.floor(Math.random()*10000),DB='merchant_domain_fixture';
mkdirSync(socket,{mode:0o700});
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1),B=id(2),P1=id(3),P2=id(4),PB=id(5),V1=id(6),V2=id(7),V3=id(8),VB=id(9),D1=id(10),D2=id(11),DB1=id(12),DNEW=id(13);
const source=file=>readFileSync(path.join(SQL,file),'utf8');
function command(name,args,input='',allow=false){const x=spawnSync(path.join(BIN,name),args,{input,encoding:'utf8',timeout:60000,env:{...process.env,LC_ALL:'C',LANG:'C'},maxBuffer:8*1024*1024});if(x.error)throw x.error;if(!allow&&x.status!==0)throw Error(x.stderr);return x;}
const sql=(text,allow=false,db=DB)=>command('psql',['-h',socket,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],text,allow);
const scalar=text=>sql(text).stdout.trim(),query=text=>JSON.parse(scalar(text));
const owned=text=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${text};COMMIT;`);
const functions=(names)=>names.map(name=>{const found=source('202610140230_google_merchant.up.sql').match(new RegExp(`CREATE FUNCTION saas\\.${name}\\([\\s\\S]*?AS \\$(\\w+)\\$[\\s\\S]*?\\$\\1\\$;`));assert.ok(found,name);return found[0];}).join('\n');
const tables=names=>names.map(name=>{const found=source('202610140230_google_merchant.up.sql').match(new RegExp(`CREATE TABLE saas\\.${name}\\([\\s\\S]*?\\n\\);`));assert.ok(found,name);return found[0];}).join('\n');
const signature='saas.google_merchant_changed()';
const definition=()=>scalar(`SELECT pg_get_functiondef('${signature}'::regprocedure)`);
const authority=()=>query(`SELECT jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl::text,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid),'securityDefiner',prosecdef,'config',proconfig) FROM pg_proc WHERE oid='${signature}'::regprocedure`);
const snapshot=()=>query(`SELECT jsonb_object_agg(variant_id,jsonb_build_object('generation',generation,'state',state,'connectionVersion',connection_version,'lastGoogleState',last_google_state,'fingerprint',last_export_fingerprint)) FROM saas.google_merchant_outbox`);
function baseline(){owned(`UPDATE saas.store_domains SET store_id='${A}',hostname='shop.example.test',status='active',is_primary=true,verified_at='2026-01-01',version=1,health_result='healthy' WHERE id='${D1}';UPDATE saas.google_marketing_connections SET status='connected',version=1 WHERE store_id='${A}';DELETE FROM saas.google_merchant_outbox;SELECT saas.google_merchant_enqueue(store_id,product_id,id) FROM saas.product_variants;UPDATE saas.google_merchant_outbox SET state='approved',last_google_state='approved',last_submission_connection_version=connection_version,last_export_fingerprint=repeat('a',32),google_product_id='tr~TR~'||variant_id::text,last_submitted_at=clock_timestamp()-interval '1 hour',next_attempt_at=clock_timestamp()+interval '24 days'`);}
function queuedOnly(before,variants){const after=snapshot();for(const [variant,value]of Object.entries(before)){assert.deepEqual(after[variant],variants.includes(variant)?{...value,generation:value.generation+1,state:'pending'}:value,variant);}}
let count=0;
const check=(name,run)=>{run();console.log(`PASS ${++count} ${name}`);};
try{
 command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);sql(`CREATE DATABASE ${DB}`,false,'postgres');
 sql(`CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS;CREATE ROLE celebix_saas_app NOLOGIN;CREATE ROLE celebix_saas_workflow NOLOGIN;CREATE ROLE celebix_saas_host_resolver NOLOGIN;CREATE ROLE celebix_saas_identity NOLOGIN;CREATE ROLE celebix_saas_bootstrap NOLOGIN;CREATE ROLE celebix_saas_observability NOLOGIN;CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;GRANT USAGE ON SCHEMA saas TO PUBLIC;SET ROLE celebix_saas_owner;
 CREATE TABLE saas.stores(id uuid PRIMARY KEY);
 CREATE TABLE saas.products(id uuid PRIMARY KEY,store_id uuid,title text);
 CREATE TABLE saas.product_variants(id uuid PRIMARY KEY,store_id uuid,product_id uuid);
 CREATE TABLE saas.store_domains(id uuid PRIMARY KEY,store_id uuid,hostname text,status text,is_primary boolean,verified_at timestamptz,version bigint,updated_at timestamptz,checked_at timestamptz,health_result text);
 CREATE TABLE saas.google_marketing_connections(store_id uuid,service text,status text,credential jsonb,selection jsonb,version bigint,updated_at timestamptz,PRIMARY KEY(store_id,service));
 ${tables(['google_merchant_accounts','google_merchant_outbox'])}
 ${functions(['google_merchant_enqueue','google_merchant_enqueue_product','google_merchant_changed'])}
 REVOKE ALL ON FUNCTION saas.google_merchant_changed() FROM PUBLIC;GRANT EXECUTE ON FUNCTION saas.google_merchant_changed() TO celebix_saas_workflow;
 INSERT INTO saas.stores VALUES('${A}'),('${B}');INSERT INTO saas.products VALUES('${P1}','${A}','First'),('${P2}','${A}','Second'),('${PB}','${B}','Other tenant');
 INSERT INTO saas.product_variants VALUES('${V1}','${A}','${P1}'),('${V2}','${A}','${P1}'),('${V3}','${A}','${P2}'),('${VB}','${B}','${PB}');
 INSERT INTO saas.store_domains VALUES('${D1}','${A}','shop.example.test','active',true,'2026-01-01',1,clock_timestamp(),NULL,'healthy'),('${D2}','${A}','alias.example.test','active',false,'2026-01-01',1,clock_timestamp(),NULL,'healthy'),('${DB1}','${B}','other.example.test','active',true,'2026-01-01',1,clock_timestamp(),NULL,'healthy');
 INSERT INTO saas.google_marketing_connections VALUES('${A}','merchant','connected','{}','{"accountId":"123","resourceId":"456"}',1,clock_timestamp()),('${B}','merchant','connected','{}','{"accountId":"789","resourceId":"987"}',1,clock_timestamp());
 CREATE TRIGGER google_merchant_domain_changed AFTER INSERT OR UPDATE OR DELETE ON saas.store_domains FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
 CREATE TRIGGER google_merchant_product_changed AFTER INSERT OR UPDATE OR DELETE ON saas.products FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
 CREATE TRIGGER google_merchant_connection_changed AFTER INSERT OR UPDATE OF selection,version,status ON saas.google_marketing_connections FOR EACH ROW WHEN(NEW.service='merchant') EXECUTE FUNCTION saas.google_merchant_changed();RESET ROLE;`);
 const beforeDefinition=definition(),beforeAuthority=authority(),beforeHelpers=query(`SELECT jsonb_object_agg(proname,pg_get_functiondef(oid)) FROM pg_proc WHERE oid IN('saas.google_merchant_enqueue(uuid,uuid,uuid)'::regprocedure,'saas.google_merchant_enqueue_product(uuid,uuid)'::regprocedure)`);
 if(!process.argv.includes('--before-fix'))sql(source(UP));
 check('successful health metadata updates preserve approved jobs and generations',()=>{
  baseline();const before=snapshot();owned(`UPDATE saas.store_domains SET status='active',verified_at=coalesce(verified_at,clock_timestamp()),version=version+1,updated_at=clock_timestamp(),checked_at=clock_timestamp(),health_result='healthy' WHERE id IN('${D1}','${D2}')`);assert.deepEqual(snapshot(),before,'routine health checks must not requeue already approved offers');assert.equal(scalar(`SELECT version=2 AND checked_at IS NOT NULL FROM saas.store_domains WHERE id='${D1}'`),'t');
 });
 check('NULL routing fields compare safely when only health metadata changes',()=>{
  baseline();owned(`UPDATE saas.store_domains SET verified_at=NULL WHERE id='${D1}'`);const before=snapshot();owned(`UPDATE saas.store_domains SET version=version+1,updated_at=clock_timestamp(),health_result='retrying' WHERE id='${D1}'`);assert.deepEqual(snapshot(),before);
 });
 for(const [name,assignment]of [['hostname',"hostname='new.example.test'"],['status',"status='pending'"],['primary domain','is_primary=false'],['verification time',"verified_at='2026-02-01'"]])check(`meaningful ${name} changes still enqueue only the owning tenant`,()=>{
  baseline();const before=snapshot();owned(`UPDATE saas.store_domains SET ${assignment} WHERE id='${D1}'`);queuedOnly(before,[V1,V2,V3]);
 });
 check('domain tenant reassignment retains its existing new-tenant enqueue behavior',()=>{
  baseline();const before=snapshot();owned(`UPDATE saas.store_domains SET store_id='${B}' WHERE id='${D1}'`);queuedOnly(before,[VB]);
 });
 check('domain INSERT still queues its tenant even with an unchanged primary domain',()=>{
  baseline();const before=snapshot();owned(`INSERT INTO saas.store_domains VALUES('${DNEW}','${A}','extra.example.test','pending',false,NULL,1,clock_timestamp(),NULL,NULL)`);queuedOnly(before,[V1,V2,V3]);owned(`DELETE FROM saas.store_domains WHERE id='${DNEW}'`);
 });
 check('domain DELETE still queues the former owning tenant',()=>{
  baseline();owned(`INSERT INTO saas.store_domains VALUES('${DNEW}','${A}','extra.example.test','pending',false,NULL,1,clock_timestamp(),NULL,NULL)`);const before=snapshot();owned(`DELETE FROM saas.store_domains WHERE id='${DNEW}'`);queuedOnly(before,[V1,V2,V3]);
 });
 check('product changes still queue only that products variants',()=>{
  baseline();const before=snapshot();owned(`UPDATE saas.products SET title='Updated title' WHERE id='${P1}'`);queuedOnly(before,[V1,V2]);
 });
 check('credential refresh and equivalent connection selection do not queue products',()=>{
  baseline();const before=snapshot();owned(`UPDATE saas.google_marketing_connections SET credential='{"refreshed":true}',updated_at=clock_timestamp() WHERE store_id='${A}';UPDATE saas.google_marketing_connections SET selection=selection,version=version,status=status WHERE store_id='${A}'`);assert.deepEqual(snapshot(),before);
 });
 check('disconnect still invalidates the affected tenant without changing another tenant',()=>{
  baseline();const before=snapshot();owned(`UPDATE saas.google_marketing_connections SET status='needs_reconnect' WHERE store_id='${A}'`);const after=snapshot();for(const variant of [V1,V2,V3])assert.deepEqual(after[variant],{...before[variant],generation:before[variant].generation+1,state:'excluded'});assert.deepEqual(after[VB],before[VB]);assert.equal(scalar(`SELECT bool_and(issues->0->>'code'='not_connected') FROM saas.google_merchant_outbox WHERE store_id='${A}'`),'t');
 });
 check('function identity, trigger contract, grants and enqueue helpers remain unchanged',()=>{
  assert.deepEqual(authority(),beforeAuthority);assert.deepEqual(query(`SELECT jsonb_object_agg(proname,pg_get_functiondef(oid)) FROM pg_proc WHERE oid IN('saas.google_merchant_enqueue(uuid,uuid,uuid)'::regprocedure,'saas.google_merchant_enqueue_product(uuid,uuid)'::regprocedure)`),beforeHelpers);sql(source(ASSERT));
 });
 check('down restores the exact original trigger and up applies again',()=>{
  sql(source(DOWN));assert.equal(definition(),beforeDefinition);assert.equal(scalar(`SELECT to_regclass('saas.google_merchant_235_backup') IS NULL`),'t');sql(source(UP));sql(source(ASSERT));baseline();const before=snapshot();owned(`UPDATE saas.store_domains SET version=version+1 WHERE id='${D1}'`);assert.deepEqual(snapshot(),before);
 });
 check('source and permission drift guards reject unsafe migration rollback or apply',()=>{
  const installed=definition();owned(`GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_app`);let failed=sql(source(DOWN),true);assert.notEqual(failed.status,0);assert.match(failed.stderr,/MERCHANT235_ROLLBACK_AUTHORITY_DRIFT/);assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_235_backup`),'1');owned(`REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_app`);
  owned(installed.replace("ELSIF TG_TABLE_NAME='products' THEN","ELSIF TG_TABLE_NAME = 'products' THEN"));failed=sql(source(DOWN),true);assert.notEqual(failed.status,0);assert.match(failed.stderr,/MERCHANT235_ROLLBACK_SOURCE_DRIFT/);owned(installed);sql(source(DOWN));
  owned(beforeDefinition.replace("ELSIF TG_TABLE_NAME='store_domains' THEN","ELSIF TG_TABLE_NAME = 'store_domains' THEN"));failed=sql(source(UP),true);assert.notEqual(failed.status,0);assert.match(failed.stderr,/MERCHANT235_CHANGED_SOURCE_DRIFT/);assert.equal(scalar(`SELECT to_regclass('saas.google_merchant_235_backup') IS NULL`),'t');owned(beforeDefinition);sql(source(UP));sql(source(ASSERT));
 });
 console.log(`PASS native Merchant domain health queue: ${count} scenarios`);
}finally{command('pg_ctl',['-D',data,'stop','-m','immediate'],'',true);rmSync(root,{recursive:true,force:true});}
