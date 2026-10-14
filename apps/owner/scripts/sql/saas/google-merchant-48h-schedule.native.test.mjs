import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
// Disposable Unix-only cluster: no DSN, credentials, existing DB, or network provider.
const SQL=import.meta.dirname,BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202610150236_google_merchant_48h_schedule.up.sql',DOWN=UP.replace('.up.','.down.');
const root=mkdtempSync('/tmp/celebix-merchant-48h-'),socket=path.join(root,'socket'),data=path.join(root,'data'),port=26000+Math.floor(Math.random()*10000),DB='merchant_48h_fixture';
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
 CREATE TABLE saas.product_variants(id uuid PRIMARY KEY,store_id uuid,product_id uuid,title text,sku text,barcode text,price_cents bigint,status text,attributes jsonb DEFAULT '{}',updated_at timestamptz,available boolean DEFAULT true,UNIQUE(store_id,id),UNIQUE(store_id,product_id,id));
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
 CREATE FUNCTION saas.public_effective_product_projection(uuid,uuid,timestamptz) RETURNS jsonb LANGUAGE sql AS $f$ SELECT jsonb_build_object('variants',coalesce(jsonb_agg(jsonb_build_object('id',v.id,'available',v.available,'priceCents',r.price_cents)) FILTER(WHERE r.outcome='found'),'[]')) FROM saas.product_variants v CROSS JOIN LATERAL saas.resolve_effective_variant_price($1,v.id,'storefront',$3,NULL) r WHERE v.store_id=$1 AND v.product_id=$2 AND v.status='active' $f$;
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

 sql(source('202610140234_google_merchant_queue_progress.up.sql'));
 const signatures=['saas.google_merchant_claim(timestamptz,integer,uuid)','saas.google_merchant_finish(uuid,uuid,bigint,bigint,uuid,timestamptz,text,text,jsonb)'];
 const definitions=()=>query(`SELECT jsonb_object_agg(oid::regprocedure::text,pg_get_functiondef(oid)) FROM pg_proc WHERE oid IN(${signatures.map(x=>`${lit(x)}::regprocedure`).join(',')})`);
 const authority=()=>query(`SELECT jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl::text,'result',pg_get_function_result(oid),'securityDefiner',prosecdef,'config',proconfig)) FROM pg_proc WHERE oid IN(${signatures.map(x=>`${lit(x)}::regprocedure`).join(',')})`);
 const beforeDefinitions=definitions(),beforeAuthority=authority();
 const extras=Array.from({length:6},(_,i)=>id(1000+i));
 owned(`INSERT INTO saas.product_variants SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${STORE}','${PRODUCT}','Standart','RING-'||n,NULL,100,'active','{"color":"Gold"}',clock_timestamp(),true FROM generate_series(1000,1005)n`);
 const reset=()=>owned(`DELETE FROM saas.google_merchant_outbox;UPDATE saas.google_merchant_catalog_batches SET processed=true;UPDATE saas.google_marketing_connections SET credential='{}',status='connected',version=1 WHERE store_id='${STORE}';UPDATE saas.product_variants SET price_cents=100,available=true WHERE store_id='${STORE}'`);
 const seed=(variant=VARIANT,state='approved')=>owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${variant}');UPDATE saas.google_merchant_outbox SET state=${lit(state)},last_google_state=${lit(state==='pending'?'submitted':state)},last_submission_connection_version=connection_version,last_export_fingerprint=md5((saas.google_merchant_projection(store_id,variant_id,clock_timestamp())->'offer')::text),google_product_id='tr~TR~'||variant_id::text,last_submitted_at=clock_timestamp()-interval '1 hour',next_attempt_at=clock_timestamp()-interval '1 hour' WHERE variant_id='${variant}'`);
 reset();seed();seed(extras[0],'pending');seed(extras[1]);seed(extras[3],'submitted');seed(extras[4],'submitted');
 owned(`UPDATE saas.google_merchant_outbox SET next_action='status' WHERE variant_id IN('${extras[3]}','${extras[4]}');UPDATE saas.google_merchant_outbox SET last_submission_connection_version=2 WHERE variant_id='${extras[4]}';UPDATE saas.google_merchant_outbox SET state='leased',lease_id='${id(99)}',lease_generation=generation,lease_connection_version=connection_version,lease_catalog_revision=1,lease_until=clock_timestamp()+interval '2 minutes' WHERE variant_id='${extras[1]}';SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${extras[2]}')`);
 const migrationBefore=query(`SELECT jsonb_object_agg(variant_id,to_jsonb(q)) FROM saas.google_merchant_outbox q`),migrationStart=scalar('SELECT clock_timestamp()');
 let migrationAfter;
 if(!process.argv.includes('--before-fix')){sql(source(UP));migrationAfter=query(`SELECT jsonb_object_agg(variant_id,to_jsonb(q)) FROM saas.google_merchant_outbox q`);}
 const future=(variant=VARIANT,hours=36)=>owned(`UPDATE saas.google_merchant_outbox SET next_status_check_at=clock_timestamp()+interval '${hours} hours',next_attempt_at=clock_timestamp() WHERE variant_id='${variant}'`);
 const row=(variant=VARIANT)=>query(`SELECT to_jsonb(q) FROM saas.google_merchant_outbox q WHERE variant_id='${variant}'`);
 const finishResult=(job,result)=>query(`SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.google_merchant_finish('${job.storeId}','${job.variantId}',${job.generation},${job.connectionVersion},'${job.leaseId}',clock_timestamp(),${lit(result)},'tr~TR~${job.variantId}','[]')`);
 check('first upload remains immediate and schedules its first status check after 48 hours',()=>{
  reset();owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${VARIANT}')`);const [job]=claim();assert.equal(job.action,'upsert');assert.equal(job.renewal,true);assert.equal(finishResult(job,'submitted').outcome,'finished');assert.equal(Number(scalar(`SELECT extract(epoch FROM next_attempt_at-last_submitted_at) FROM saas.google_merchant_outbox`)),172800,'first status check must wait 48 hours, not fifteen minutes');assert.equal(row().next_action,'status');
 });
 check('migration schedules tracked acknowledgements without delaying pending, leased or new uploads',()=>{
  for(const variant of [VARIANT,extras[0],extras[1],extras[3]]){const after=migrationAfter[variant];assert.ok(Date.parse(after.next_status_check_at)>=Date.parse(migrationStart)+172800000);assert.equal(after.generation,migrationBefore[variant].generation);}
  for(const variant of [extras[0],extras[1],extras[2],extras[4]]){const before=migrationBefore[variant],{next_status_check_at,...after}=migrationAfter[variant];assert.deepEqual(after,before);if([extras[2],extras[4]].includes(variant))assert.equal(next_status_check_at,null);}
  for(const variant of [VARIANT,extras[3]]){assert.equal(migrationAfter[variant].next_action,'status');assert.equal(migrationAfter[variant].next_attempt_at,migrationAfter[variant].next_status_check_at);}
 });
 check('an unchanged approved offer waits through hour 36 of its 48-hour status interval',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_outbox SET last_submitted_at=clock_timestamp()-interval '36 hours',next_status_check_at=NULL`);assert.deepEqual(claim(),[]);const q=row();assert.equal(q.state,'approved');assert.equal(q.next_action,'status');assert.ok(Date.parse(q.next_attempt_at)>Date.now()+11.9*3600000);
 });
 check('unchanged submitted, limited and disapproved offers also respect a future status deadline',()=>{
  for(const state of ['submitted','limited','disapproved']){reset();seed(VARIANT,state);future();assert.deepEqual(claim(),[]);assert.equal(row().state,state);}
 });
 check('an unchanged approved offer becomes a GET job once its status deadline passes',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_outbox SET next_action='status',next_status_check_at=clock_timestamp()-interval '1 second'`);const [job]=claim();assert.equal(job.action,'status');assert.equal(job.renewal,false);
 });
 check('a legacy NULL deadline falls back to last submission plus 48 hours',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_outbox SET last_submitted_at=clock_timestamp()-interval '49 hours',next_status_check_at=NULL`);assert.equal(claim()[0].action,'status');
 });
 check('repeated noop events preserve the deadline and never resend or request premature status',()=>{
  reset();seed();future();const before=row();owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${VARIANT}') FROM generate_series(1,5)`);assert.deepEqual(claim(),[]);const q=row();assert.equal(q.next_status_check_at,before.next_status_check_at);assert.equal(q.next_attempt_at,before.next_status_check_at);assert.equal(q.last_export_fingerprint,before.last_export_fingerprint);assert.equal(q.generation,before.generation+5);
 });
 check('an actual price change forces only the changed offer to upsert before its status deadline',()=>{
  reset();seed(extras[0]);seed(extras[1]);future(extras[0]);future(extras[1]);owned(`UPDATE saas.google_merchant_outbox SET next_action='status';UPDATE saas.product_variants SET price_cents=250 WHERE id='${extras[0]}'`);const jobs=claim();assert.equal(jobs.length,1);assert.equal(jobs[0].variantId,extras[0]);assert.equal(jobs[0].action,'upsert');assert.equal(jobs[0].projection.price.amountMicros,'2500000');
 });
 check('an availability change forces immediate upsert for that offer',()=>{
  reset();seed(extras[0]);future(extras[0]);owned(`UPDATE saas.google_merchant_outbox SET next_action='status';UPDATE saas.product_variants SET available=false WHERE id='${extras[0]}'`);const [job]=claim();assert.equal(job.action,'upsert');assert.equal(job.projection.availability,'out_of_stock');
 });
 check('an invalidated offer still takes the immediate deletion path',()=>{
  reset();seed();future();owned(`INSERT INTO saas.google_merchant_preferences VALUES('${STORE}','${PRODUCT}','${VARIANT}',false,'{}',clock_timestamp()) ON CONFLICT(store_id,variant_id) DO UPDATE SET enabled=false;UPDATE saas.google_merchant_outbox SET next_action='status'`);const [job]=claim();assert.equal(job.action,'delete');assert.equal(job.projection,null);owned(`DELETE FROM saas.google_merchant_preferences`);
 });
 check('successful status results schedule 48 hours while preserving the 25-day renewal cap',()=>{
  for(const state of ['pending','approved','limited','disapproved']){reset();seed();owned(`UPDATE saas.google_merchant_outbox SET last_submitted_at=clock_timestamp()-interval '24 days',next_status_check_at=clock_timestamp()-interval '1 second'`);const [job]=claim();const before=row();assert.equal(finishResult(job,state).outcome,'finished');const after=row();assert.equal(after.last_submitted_at,before.last_submitted_at);assert.ok(Date.parse(after.next_status_check_at)>Date.now()+47.9*3600000);assert.equal(Date.parse(after.next_attempt_at),Date.parse(before.last_submitted_at)+25*86400000);assert.equal(after.next_action,'status');}
 });
 check('an expired 25-day offer renews through upsert even with a future status deadline',()=>{
  reset();seed();future();owned(`UPDATE saas.google_merchant_outbox SET last_submitted_at=clock_timestamp()-interval '26 days',next_action='status'`);const [job]=claim();assert.equal(job.action,'upsert');assert.equal(job.renewal,true);
 });
 check('new connection acknowledgements cannot reuse a prior connections future status deadline',()=>{
  reset();seed();future();owned(`UPDATE saas.google_merchant_outbox SET last_submission_connection_version=2,next_action='status'`);const [job]=claim();assert.equal(job.action,'upsert');assert.equal(job.renewal,true);
 });
 check('the existing two-job network limit remains in effect',()=>{
  reset();for(const variant of extras.slice(0,4)){seed(variant);owned(`UPDATE saas.google_merchant_outbox SET next_status_check_at=clock_timestamp()-interval '1 second' WHERE variant_id='${variant}'`);}assert.equal(claim().length,2);assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_outbox WHERE state='leased'`),'2');
 });
 check('kill gate and credential fences still prevent jobs',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_delivery_control SET enabled=false`);assert.deepEqual(claim(),[]);owned(`UPDATE saas.google_merchant_delivery_control SET enabled=true;UPDATE saas.google_marketing_connections SET credential=NULL`);assert.deepEqual(claim(),[]);
 });
 check('generation, catalogue and expired-lease fences cannot advance the scheduled check',()=>{
  for(const mutation of ['generation=generation+1','lease_catalog_revision=lease_catalog_revision+1',"lease_until=clock_timestamp()-interval '1 second'"]){reset();seed();owned(`UPDATE saas.google_merchant_outbox SET next_status_check_at=clock_timestamp()-interval '1 second'`);const [job]=claim();const before=row();owned(`UPDATE saas.google_merchant_outbox SET ${mutation}`);assert.equal(finishResult(job,'approved').outcome,'stale');assert.equal(row().next_status_check_at,before.next_status_check_at);}
 });
 check('provider retry preserves the scheduled check instead of pretending a GET succeeded',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_outbox SET next_status_check_at=clock_timestamp()-interval '1 second'`);const [job]=claim();const before=row();assert.equal(scalar(`SELECT outcome FROM saas.google_merchant_defer('${STORE}','${VARIANT}',${job.generation},${job.connectionVersion},'${job.leaseId}',clock_timestamp(),'provider_limit',900)`),'retry');assert.equal(row().next_status_check_at,before.next_status_check_at);assert.ok(Date.parse(row().next_attempt_at)>Date.now()+14*60000);
 });
 check('repeated failed status checks retain exponential backoff and stop after eight attempts',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_outbox SET next_status_check_at=clock_timestamp()-interval '1 second'`);const deadline=row().next_status_check_at;
  for(let attempt=1;attempt<=8;attempt++){const [job]=claim();assert.ok(job);assert.equal(row().attempts,attempt,'a due status retry must preserve the previous attempt count');const outcome=scalar(`SELECT outcome FROM saas.google_merchant_defer('${STORE}','${VARIANT}',${job.generation},${job.connectionVersion},'${job.leaseId}',clock_timestamp(),'provider_unavailable',60)`);assert.equal(outcome,attempt===8?'failed':'retry');assert.equal(Number(scalar(`SELECT extract(epoch FROM next_attempt_at-updated_at) FROM saas.google_merchant_outbox`)),Math.max(60,Math.min(3600,30*2**attempt)));assert.equal(row().next_status_check_at,deadline);if(attempt<8)owned(`UPDATE saas.google_merchant_outbox SET next_attempt_at=clock_timestamp()`);}
  assert.equal(row().state,'failed');assert.deepEqual(claim(),[]);
 });
 check('withdrawal clears the private deadline without altering unrelated job contracts',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_outbox SET next_status_check_at=clock_timestamp()-interval '1 second'`);const [job]=claim();assert.equal(finishResult(job,'withdrawn').outcome,'finished');assert.equal(row().next_status_check_at,null);assert.deepEqual(authority(),beforeAuthority);sql(source(UP.replace('.up.','_assertions.')));
 });
 check('guarded down preserves live receipts, restores legacy scheduling, and supports up again',()=>{
  reset();seed();owned(`UPDATE saas.google_merchant_outbox SET next_status_check_at=clock_timestamp()-interval '1 second'`);const [job]=claim();assert.equal(finishResult(job,'approved').outcome,'finished');const receipt=row();
  owned(`GRANT EXECUTE ON FUNCTION ${signatures[0]} TO celebix_saas_app`);let failed=sql(source(DOWN),DB,true);assert.notEqual(failed.status,0);assert.match(failed.stderr,/MERCHANT236_ROLLBACK_AUTHORITY_DRIFT/);owned(`REVOKE EXECUTE ON FUNCTION ${signatures[0]} FROM celebix_saas_app`);
  sql(source(DOWN));assert.deepEqual(definitions(),beforeDefinitions);assert.equal(scalar(`SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name='google_merchant_outbox' AND column_name='next_status_check_at'`),'0');const after=row();for(const key of ['state','last_google_state','last_export_fingerprint','last_submitted_at','google_product_id','generation'])assert.equal(after[key],receipt[key]);assert.equal(after.next_action,'upsert');assert.equal(Date.parse(after.next_attempt_at),Date.parse(after.last_submitted_at)+25*86400000);sql(source(UP));sql(source(UP.replace('.up.','_assertions.')));
 });
 console.log(`PASS native Merchant 48h schedule: ${count} scenarios`);
}finally{command('pg_ctl',['-D',data,'stop','-m','immediate'],'',true);rmSync(root,{recursive:true,force:true});}
