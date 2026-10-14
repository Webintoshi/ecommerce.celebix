import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
// Disposable Unix-only cluster: no DSN, credentials, existing DB, or network provider.
const SQL=import.meta.dirname,BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202610140234_google_merchant_queue_progress.up.sql',DOWN=UP.replace('.up.','.down.');
const root=mkdtempSync('/tmp/celebix-merchant-queue-'),socket=path.join(root,'socket'),data=path.join(root,'data'),port=26000+Math.floor(Math.random()*10000),DB='merchant_queue_fixture';
mkdirSync(socket,{mode:0o700});
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const STORE=id(1),OTHER=id(2),PRODUCT=id(3),VARIANT=id(4),OWNER=id(5),MEMBER=id(6),PLAN=id(7),REF=id(8),SET=id(9),SET2=id(10);
const lit=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`;
const source=file=>readFileSync(path.join(SQL,file),'utf8');
function command(name,args,input='',allow=false){const x=spawnSync(path.join(BIN,name),args,{input,encoding:'utf8',timeout:60000,env:{...process.env,LC_ALL:'C',LANG:'C'},maxBuffer:8*1024*1024});if(x.error)throw x.error;if(!allow&&x.status!==0)throw Error(x.stderr);return x;}
const sql=(text,db=DB,allow=false)=>command('psql',['-h',socket,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],text,allow);
const scalar=text=>sql(text).stdout.trim(),query=text=>JSON.parse(scalar(text));
const owned=text=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${text};COMMIT;`);
const functions=(file,names)=>{const s=source(file);return names.map(name=>{const re=new RegExp(`CREATE (?:OR REPLACE )?FUNCTION saas\\.${name}\\([\\s\\S]*?AS \\$(\\w+)\\$[\\s\\S]*?\\$\\1\\$;`);const x=s.match(re);assert.ok(x,`${file}:${name}`);return x[0];}).join('\n');};
const tables=(file,names)=>names.map(name=>{const x=source(file).match(new RegExp(`CREATE TABLE saas\\.${name}\\([\\s\\S]*?\\n\\);|CREATE TABLE saas\\.${name}\\s*\\([\\s\\S]*?\\n\\);`));assert.ok(x,`${file}:${name}`);return x[0];}).join('\n');
let count=0;
const check=(name,run)=>{run();console.log(`PASS ${++count} ${name}`);};
const authority=`'${STORE}','${OWNER}','${MEMBER}','${PLAN}','growth',1,clock_timestamp()`;
function rpc(action,input={},auth=authority){return query(`BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.google_merchant_command(${auth},${lit(action)},${json(input)});COMMIT;`);}
const identity=(ownBrand=true,brandName='Fixture Jewelry',expectedVersion=0,op=randomUUID())=>({operationId:op,fingerprint:createHash('sha256').update(JSON.stringify({ownBrand,brandName,expectedVersion,op})).digest('hex'),ownBrand,brandName,expectedVersion});
const projection=()=>query(`SELECT saas.google_merchant_projection('${STORE}','${VARIANT}',clock_timestamp())`);
const claim=(limit=2)=>query(`BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT result_payload FROM saas.google_merchant_claim(clock_timestamp(),${limit},'${randomUUID()}');COMMIT;`);
const finish=(job,result='submitted')=>query(`SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.google_merchant_finish('${job.storeId}','${job.variantId}',${job.generation},${job.connectionVersion},'${job.leaseId}',clock_timestamp(),'${result}','tr~TR~${job.variantId}','[]')`);
try{
 command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);sql(`CREATE DATABASE ${DB}`,'postgres');
 sql(`CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS;CREATE ROLE celebix_saas_app NOLOGIN;CREATE ROLE celebix_saas_workflow NOLOGIN;CREATE ROLE celebix_saas_host_resolver NOLOGIN;CREATE ROLE celebix_saas_identity NOLOGIN;CREATE ROLE celebix_saas_bootstrap NOLOGIN;CREATE ROLE celebix_saas_observability NOLOGIN;CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;GRANT USAGE ON SCHEMA saas TO PUBLIC;SET ROLE celebix_saas_owner;
 CREATE TABLE saas.stores(id uuid PRIMARY KEY,status text,locale text);CREATE TABLE saas.principals(id uuid PRIMARY KEY);
 CREATE TABLE saas.products(id uuid PRIMARY KEY,store_id uuid REFERENCES saas.stores,slug text,title text,description text,status text,currency text,updated_at timestamptz,UNIQUE(store_id,id));
 CREATE TABLE saas.product_variants(id uuid PRIMARY KEY,store_id uuid,product_id uuid,title text,sku text,barcode text,price_cents bigint,status text,attributes jsonb DEFAULT '{}',updated_at timestamptz,UNIQUE(store_id,id),UNIQUE(store_id,product_id,id));
 CREATE TABLE saas.price_lists(id uuid PRIMARY KEY,store_id uuid,status text);CREATE TABLE saas.price_list_items(store_id uuid,price_list_id uuid,variant_id uuid,price_cents bigint);CREATE TABLE saas.price_list_rules(id uuid,store_id uuid,price_list_id uuid,channel text,starts_at timestamptz,ends_at timestamptz,customer_tag_id uuid,priority integer);
 CREATE TABLE saas.customers(id uuid,store_id uuid,email text,status text);CREATE TABLE saas.customer_tags(id uuid,store_id uuid,archived_at timestamptz);CREATE TABLE saas.customer_tag_assignments(store_id uuid,customer_id uuid,tag_id uuid);
 CREATE TABLE saas.google_marketing_connections(store_id uuid,service text,status text,credential jsonb,selection jsonb,version bigint,google_subject text,updated_at timestamptz,PRIMARY KEY(store_id,service));
 CREATE TABLE saas.store_domains(store_id uuid,hostname text,status text,is_primary boolean,verified_at timestamptz);
 CREATE TABLE saas.catalog_product_profiles(store_id uuid,product_id uuid,product_type text,minimum_purchase_quantity integer,google_product_category_id text);
 CREATE TABLE saas.catalog_admin_resources(id uuid,store_id uuid,name text,resource_kind text,status text);CREATE TABLE saas.catalog_admin_resource_products(store_id uuid,product_id uuid,resource_id uuid,position integer);
 CREATE TABLE saas.variant_media_galleries(store_id uuid,product_id uuid,variant_id uuid);CREATE TABLE saas.variant_media_links(store_id uuid,product_id uuid,variant_id uuid,media_id uuid,position integer);
 CREATE TABLE saas.product_media(id uuid,store_id uuid,product_id uuid,variant_id uuid,status text,object_deleted_at timestamptz,sort_order integer,public_url text);
 ${tables('202609200130_reference_pricing.up.sql',['pricing_reference_definitions','pricing_reference_sets','pricing_reference_set_values','pricing_reference_state','pricing_variant_policy_versions','pricing_variant_policy_state','pricing_dynamic_activation'])}
 ${functions('202609200130_reference_pricing.up.sql',['pricing_calculate_variant_price','resolve_effective_variant_price'])}
 CREATE FUNCTION saas.platform_support_journal_write() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN coalesce(NEW,OLD);END $f$;
 CREATE FUNCTION saas.platform_support_begin(uuid,uuid,uuid,text) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
 CREATE FUNCTION saas.platform_membership_is_authorized(uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT $1='${MEMBER}'::uuid $f$;
 CREATE FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) RETURNS text LANGUAGE sql AS $f$ SELECT CASE WHEN $1='${STORE}'::uuid AND $2='${OWNER}'::uuid AND $3='${MEMBER}'::uuid THEN NULL ELSE 'membership_denied' END $f$;
 CREATE FUNCTION saas.google_marketing_connection_projection(uuid,text) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;
 CREATE FUNCTION saas.orders_json_timestamp(timestamptz) RETURNS text LANGUAGE sql AS $f$ SELECT $1::text $f$;
 CREATE FUNCTION saas.variant_primary_media_id(uuid,uuid,uuid) RETURNS uuid LANGUAGE sql AS $f$ SELECT NULL::uuid $f$;
 CREATE FUNCTION saas.public_effective_product_projection(uuid,uuid,timestamptz) RETURNS jsonb LANGUAGE sql AS $f$ SELECT jsonb_build_object('variants',coalesce(jsonb_agg(jsonb_build_object('id',v.id,'available',true,'priceCents',r.price_cents)) FILTER(WHERE r.outcome='found'),'[]')) FROM saas.product_variants v CROSS JOIN LATERAL saas.resolve_effective_variant_price($1,v.id,'storefront',$3,NULL) r WHERE v.store_id=$1 AND v.product_id=$2 AND v.status='active' $f$;
 ${tables('202610140230_google_merchant.up.sql',['google_merchant_accounts','google_merchant_preferences','google_merchant_operations','google_merchant_outbox','google_merchant_price_boundaries'])}
 ${functions('202610140230_google_merchant.up.sql',['google_merchant_gtin_valid','google_merchant_attributes_valid','google_merchant_plain','google_merchant_projection','google_merchant_enqueue','google_merchant_enqueue_product','google_merchant_advance_price_boundaries','google_merchant_product_row','google_merchant_command','google_merchant_job_projection','google_merchant_claim','google_merchant_read','google_merchant_finish','google_merchant_defer'])}
 GRANT EXECUTE ON FUNCTION saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) TO celebix_saas_app;
 INSERT INTO saas.stores VALUES('${STORE}','active','tr'),('${OTHER}','active','tr');INSERT INTO saas.principals VALUES('${OWNER}');
 INSERT INTO saas.products VALUES('${PRODUCT}','${STORE}','fixture-ring','Fixture ring','Gold ring','active','TRY',clock_timestamp());INSERT INTO saas.product_variants VALUES('${VARIANT}','${STORE}','${PRODUCT}','Standart','RING-4','970000004',100,'active','{}',clock_timestamp());
 INSERT INTO saas.catalog_product_profiles VALUES('${STORE}','${PRODUCT}','physical',1,NULL);
 INSERT INTO saas.product_media VALUES('${id(99)}','${STORE}','${PRODUCT}',NULL,'active',NULL,0,'https://media.example.test/ring.webp');
 INSERT INTO saas.store_domains VALUES('${STORE}','shop.example.test','active',true,'2026-01-01');INSERT INTO saas.google_marketing_connections VALUES('${STORE}','merchant','connected','{}','{"accountId":"123","resourceId":"456"}',1,'fixture',clock_timestamp());INSERT INTO saas.google_merchant_accounts VALUES('${STORE}',1,'shop.example.test',NULL);
 INSERT INTO saas.pricing_reference_definitions VALUES('${REF}','${STORE}','gold_gram','Gold',NULL,'${OWNER}',clock_timestamp());
 INSERT INTO saas.pricing_reference_sets VALUES('${SET}','${STORE}',1,'${OWNER}',clock_timestamp()),('${SET2}','${STORE}',2,'${OWNER}',clock_timestamp());
 INSERT INTO saas.pricing_reference_set_values VALUES('${STORE}','${SET}','${REF}',5000,true),('${STORE}','${SET2}','${REF}',6000,true);
 INSERT INTO saas.pricing_reference_state VALUES('${STORE}','${SET}',1,2,clock_timestamp());INSERT INTO saas.pricing_dynamic_activation VALUES('${STORE}',true);
 INSERT INTO saas.pricing_variant_policy_versions VALUES('${STORE}','${VARIANT}',1,'gold_gram',NULL,NULL,2,'${REF}','direct',NULL,'per_item_try',100,10,false,'{}','${OWNER}',clock_timestamp());INSERT INTO saas.pricing_variant_policy_state VALUES('${STORE}','${VARIANT}',1);
 RESET ROLE;`);
 sql(source('202610140231_google_merchant_delivery_gate.up.sql'));

 sql(source('202610140232_google_merchant_retail_identity.up.sql'));
 assert.equal(rpc('identity',identity()).outcome,'saved');
 owned(`UPDATE saas.google_merchant_delivery_control SET enabled=true;UPDATE saas.product_variants SET attributes='{"color":"Gold"}';UPDATE saas.google_merchant_catalog_batches SET processed=true;REVOKE ALL ON FUNCTION saas.google_merchant_claim(timestamptz,integer,uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION saas.google_merchant_claim(timestamptz,integer,uuid) TO celebix_saas_workflow`);
 const signature='saas.google_merchant_claim(timestamptz,integer,uuid)';
 const definition=()=>scalar(`SELECT pg_get_functiondef('${signature}'::regprocedure)`);
 const beforeDefinition=definition();
 const beforeAuthority=query(`SELECT jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl::text,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid),'securityDefiner',prosecdef,'config',proconfig) FROM pg_proc WHERE oid='${signature}'::regprocedure`);
 if(!process.argv.includes('--before-fix'))sql(source(UP));
 const reset=()=>owned(`DELETE FROM saas.google_merchant_outbox;UPDATE saas.google_merchant_catalog_batches SET processed=true;UPDATE saas.google_marketing_connections SET version=1,status='connected' WHERE store_id='${STORE}'`);
 const seed=(variant=VARIANT,googleState='submitted')=>owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${variant}');UPDATE saas.google_merchant_outbox SET last_google_state=${lit(googleState)},last_submission_connection_version=connection_version,last_export_fingerprint=md5((saas.google_merchant_projection(store_id,variant_id,clock_timestamp())->'offer')::text),google_product_id='tr~TR~'||variant_id::text,last_submitted_at=clock_timestamp()-interval '1 hour',next_attempt_at=clock_timestamp()-interval '1 hour' WHERE variant_id='${variant}'`);
 const read=job=>query(`SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.google_merchant_read('${job.storeId}','${job.variantId}',${job.generation},${job.connectionVersion},'${job.leaseId}',clock_timestamp())`);
 const defer=job=>scalar(`SELECT outcome FROM saas.google_merchant_defer('${job.storeId}','${job.variantId}',${job.generation},${job.connectionVersion},'${job.leaseId}',clock_timestamp(),'provider_limit',60)`);
 check('unchanged submitted offer produces a status job on the first claim',()=>{
  reset();seed();const jobs=claim();assert.equal(jobs.length,1,'a previously submitted unchanged offer needs an immediate status job');assert.equal(jobs[0].action,'status');assert.equal(jobs[0].renewal,false);assert.equal(jobs[0].variantId,VARIANT);
  assert.equal(finish(jobs[0],'pending').outcome,'finished');assert.equal(scalar(`SELECT state='submitted' AND next_action='status' AND next_attempt_at>clock_timestamp()+interval '3 hours 59 minutes' FROM saas.google_merchant_outbox`),'t','only an actual pending status response earns the four-hour wait');
 });
 check('unchanged limited and disapproved offers reconcile through status jobs',()=>{
  for(const state of ['limited','disapproved']){reset();seed(VARIANT,state);const jobs=claim();assert.equal(jobs.length,1);assert.equal(jobs[0].action,'status');assert.equal(jobs[0].renewal,false);}
 });
 check('unchanged approved offer restores its known approval without a network job',()=>{
  reset();seed(VARIANT,'approved');assert.deepEqual(claim(),[]);assert.equal(scalar(`SELECT state='approved' AND next_action='upsert' AND next_attempt_at=last_submitted_at+interval '25 days' AND attempts=0 FROM saas.google_merchant_outbox`),'t');
 });
 check('generation-only enqueue preserves the offer and acknowledged fingerprint',()=>{
  reset();seed();const before=query(`SELECT jsonb_build_object('generation',generation,'fingerprint',last_export_fingerprint,'offer',saas.google_merchant_projection(store_id,variant_id,clock_timestamp())->'offer','id',google_product_id) FROM saas.google_merchant_outbox`);
  owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${VARIANT}')`);const [job]=claim();assert.ok(job);assert.equal(job.action,'status');assert.equal(job.generation,before.generation+1);assert.deepEqual(job.projection,before.offer);assert.equal(job.googleProductId,before.id);assert.equal(scalar(`SELECT last_export_fingerprint FROM saas.google_merchant_outbox`),before.fingerprint);
 });
 check('actual changed offer and stale connection acknowledgement still require upsert',()=>{
  for(const mutation of ["last_export_fingerprint='00000000000000000000000000000000'",'last_submission_connection_version=connection_version+1']){reset();seed(VARIANT,'approved');owned(`UPDATE saas.google_merchant_outbox SET ${mutation}`);const jobs=claim();assert.equal(jobs.length,1);assert.equal(jobs[0].action,'upsert');}
 });
 check('expired unchanged approval still renews through upsert',()=>{
  reset();seed(VARIANT,'approved');owned(`UPDATE saas.google_merchant_outbox SET last_submitted_at=clock_timestamp()-interval '26 days'`);const [job]=claim();assert.equal(job.action,'upsert');assert.equal(job.renewal,true);
 });
 const extras=Array.from({length:102},(_,n)=>id(1000+n));
 owned(`INSERT INTO saas.product_variants SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${STORE}','${PRODUCT}','Standart','RING-'||n,NULL,100,'active','{"color":"Gold"}',clock_timestamp() FROM generate_series(1000,1101)n`);
 const bulkSeed=(approvedCount,newCount)=>{
  reset();const variants=extras.slice(0,approvedCount+newCount);
  owned(`INSERT INTO saas.google_merchant_outbox(store_id,product_id,variant_id,connection_version,next_attempt_at) SELECT store_id,product_id,id,1,clock_timestamp()-interval '2 hours' FROM saas.product_variants WHERE id IN(${variants.map(lit).join(',')});UPDATE saas.google_merchant_outbox SET last_google_state='approved',last_submission_connection_version=connection_version,last_export_fingerprint=md5((saas.google_merchant_projection(store_id,variant_id,clock_timestamp())->'offer')::text),google_product_id='tr~TR~'||variant_id::text,last_submitted_at=clock_timestamp()-interval '1 hour' WHERE variant_id IN(${extras.slice(0,approvedCount).map(lit).join(',')})`);
 };
 check('unchanged approved rows ahead of new work do not consume the two-job limit',()=>{
  bulkSeed(98,4);const jobs=claim();assert.deepEqual(jobs.map(job=>job.variantId),extras.slice(98,100));assert.ok(jobs.every(job=>job.action==='upsert'));assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_outbox WHERE state='approved'`),'98');assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_outbox WHERE state='leased'`),'2');assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_outbox WHERE state='pending'`),'2');
 });
 check('one claim scans at most one hundred local candidates',()=>{
  bulkSeed(101,1);assert.deepEqual(claim(),[]);assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_outbox WHERE state='approved'`),'100');assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_outbox WHERE state='pending'`),'2');const jobs=claim();assert.equal(jobs.length,1);assert.equal(jobs[0].variantId,extras[101]);
 });
 check('network jobs stop at the requested limit even with a larger scan budget',()=>{
  bulkSeed(98,4);assert.equal(claim(1).length,1);assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_outbox WHERE state='leased'`),'1');
 });
 check('delivery pause and connection version fences still prevent claims',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_delivery_control SET enabled=false`);assert.deepEqual(claim(),[]);owned(`UPDATE saas.google_merchant_delivery_control SET enabled=true;UPDATE saas.google_marketing_connections SET version=2 WHERE store_id='${STORE}'`);assert.deepEqual(claim(),[]);
 });
 check('missing credentials prevent claiming and invalidate a claimed job',()=>{
  reset();seed();owned(`UPDATE saas.google_marketing_connections SET credential=NULL WHERE store_id='${STORE}'`);assert.deepEqual(claim(),[]);owned(`UPDATE saas.google_marketing_connections SET credential='{}' WHERE store_id='${STORE}'`);const [job]=claim();owned(`UPDATE saas.google_marketing_connections SET credential=NULL WHERE store_id='${STORE}'`);assert.equal(read(job).outcome,'stale');owned(`UPDATE saas.google_marketing_connections SET credential='{}' WHERE store_id='${STORE}'`);
 });
 check('generation changes fence status read, finish, and defer',()=>{
  reset();seed();const [job]=claim();owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${VARIANT}')`);assert.equal(read(job).outcome,'stale');assert.equal(finish(job,'approved').outcome,'stale');assert.equal(defer(job),'stale');assert.equal(scalar(`SELECT state FROM saas.google_merchant_outbox`),'pending');
 });
 check('catalog changes fence status read and finish before approval acknowledgement',()=>{
  reset();seed();const [job]=claim();owned(`INSERT INTO saas.google_merchant_catalog_revisions(store_id,revision) VALUES('${STORE}',1) ON CONFLICT(store_id) DO UPDATE SET revision=saas.google_merchant_catalog_revisions.revision+1`);assert.equal(read(job).outcome,'stale');assert.equal(finish(job,'approved').outcome,'stale');assert.equal(defer(job),'stale');assert.equal(scalar(`SELECT last_google_state FROM saas.google_merchant_outbox`),'submitted');
 });
 check('expired leases cannot acknowledge approval',()=>{
  reset();seed();const [job]=claim();owned(`UPDATE saas.google_merchant_outbox SET lease_until=clock_timestamp()-interval '1 second'`);assert.equal(read(job).outcome,'stale');assert.equal(finish(job,'approved').outcome,'stale');assert.equal(defer(job),'stale');
 });
 check('function OID, signature, response, owner, grants, and security settings are preserved',()=>{
  const after=query(`SELECT jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl::text,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid),'securityDefiner',prosecdef,'config',proconfig) FROM pg_proc WHERE oid='${signature}'::regprocedure`);assert.deepEqual(after,beforeAuthority);
 });
 sql(source(UP.replace('.up.','_assertions.')));
 check('down restores the original function exactly and up applies again',()=>{
  sql(source(DOWN));assert.equal(definition(),beforeDefinition);assert.equal(scalar(`SELECT to_regclass('saas.google_merchant_234_backup') IS NULL`),'t');sql(source(UP));sql(source(UP.replace('.up.','_assertions.')));
  reset();seed();const jobs=claim();assert.equal(jobs.length,1);assert.equal(jobs[0].action,'status');
 });
 check('rollback rejects source drift without discarding its private backup',()=>{
  const installed=definition();owned(installed.replace('LIMIT 100 FOR UPDATE OF q SKIP LOCKED LOOP','LIMIT 99 FOR UPDATE OF q SKIP LOCKED LOOP'));const result=sql(source(DOWN),DB,true);assert.notEqual(result.status,0);assert.match(result.stderr,/MERCHANT234_ROLLBACK_SOURCE_DRIFT/);assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_234_backup`),'1');owned(installed);
 });
 check('rollback rejects permission drift even when the function source is unchanged',()=>{
  const installed=definition();owned(`GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_app`);assert.equal(definition(),installed);const result=sql(source(DOWN),DB,true);assert.notEqual(result.status,0,'rollback must reject changed function permissions');assert.match(result.stderr,/MERCHANT234_ROLLBACK_AUTHORITY_DRIFT/);assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_234_backup`),'1');owned(`REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_app`);
 });
 check('apply rejects unexpected claim source and rolls back the backup table',()=>{
  sql(source(DOWN));owned(beforeDefinition.replace('LIMIT p_limit FOR UPDATE OF q SKIP LOCKED LOOP','LIMIT 99 FOR UPDATE OF q SKIP LOCKED LOOP'));const result=sql(source(UP),DB,true);assert.notEqual(result.status,0);assert.match(result.stderr,/MERCHANT234_CLAIM_SOURCE_DRIFT/);assert.equal(scalar(`SELECT to_regclass('saas.google_merchant_234_backup') IS NULL`),'t');owned(beforeDefinition);sql(source(UP));sql(source(UP.replace('.up.','_assertions.')));
 });
 console.log(`PASS native Merchant queue progress: ${count} scenarios`);
}finally{command('pg_ctl',['-D',data,'stop','-m','immediate'],'',true);rmSync(root,{recursive:true,force:true});}
