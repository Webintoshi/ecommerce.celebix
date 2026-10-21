import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
// Disposable Unix-only cluster: no DSN, credentials, existing DB, or network provider.
const SQL=import.meta.dirname,BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202610210257_whatsapp_merchant_policy.up.sql',DOWN=UP.replace('.up.','.down.');
const root=mkdtempSync('/tmp/celebix-whatsapp-merchant-'),socket=path.join(root,'socket'),data=path.join(root,'data'),port=26000+Math.floor(Math.random()*10000),DB='whatsapp_merchant_fixture';
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
 sql(source('202610150236_google_merchant_48h_schedule.up.sql'));
 owned(`CREATE TABLE saas.merchant_admin_records(id uuid PRIMARY KEY,store_id uuid NOT NULL,record_kind text NOT NULL,config jsonb NOT NULL,status text NOT NULL,version bigint NOT NULL)`);
 // Native256 owns config validation and singleton authority; this fixture uses its storage shape.
 owned(functions('202607280056_catalog_product_onboarding.up.sql',['catalog_onboarding_json_exact'])+functions('202610030204_storefront_contact_widget.up.sql',['contact_widget_text_valid'])+functions('202610210256_whatsapp_ordering.up.sql',['whatsapp_order_config_valid']));
 const setting=(enabled=false,hidePrices=false,hideAddToCart=false,extra={})=>({schemaVersion:1,enabled,phone:'+905551234567',hidePrices,hideAddToCart,messageIntro:'Merhaba',...extra});
 const save=(config,store=STORE)=>owned(`INSERT INTO saas.merchant_admin_records VALUES('${store}','${store}','whatsapp_order_setting',${json(config)},'active',1) ON CONFLICT(id) DO UPDATE SET config=EXCLUDED.config,version=saas.merchant_admin_records.version+1`);
 const row=(variant=VARIANT)=>query(`SELECT to_jsonb(q) FROM saas.google_merchant_outbox q WHERE variant_id='${variant}'`);
 const seed=()=>owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${VARIANT}');UPDATE saas.google_merchant_outbox SET state='approved',last_google_state='approved',last_submission_connection_version=connection_version,last_export_fingerprint=md5((saas.google_merchant_projection(store_id,variant_id,clock_timestamp())->'offer')::text),google_product_id='tr~TR~'||variant_id::text,last_submitted_at=clock_timestamp()-interval '1 hour',next_status_check_at=clock_timestamp()+interval '36 hours',next_attempt_at=clock_timestamp()+interval '36 hours'`);
 // Batches enqueue after the claim's captured moment; their work is due on the next bounded tick.
 const nextJobs=()=>{const jobs=claim();return jobs.length?jobs:claim();};
 const read=job=>query(`SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.google_merchant_read('${job.storeId}','${job.variantId}',${job.generation},${job.connectionVersion},'${job.leaseId}',clock_timestamp())`);
 const reset=()=>owned(`DELETE FROM saas.merchant_admin_records;DELETE FROM saas.google_merchant_outbox;UPDATE saas.google_merchant_catalog_batches SET processed=true`);
 if(!process.argv.includes('--before-fix'))sql(source(UP));
 check('catalog-only policy removes offer projection before any enqueue or claim',()=>{
  save(setting(true,true,false));const p=projection();assert.equal(p.offer,null);assert.ok(p.issues.some(i=>i.code==='whatsapp_catalog_only'));
 });
 check('invalid or nonactive policy fails closed for Merchant export',()=>{
  save({...setting(),enabled:'invalid'});assert.equal(projection().offer,null);save(setting());owned(`UPDATE saas.merchant_admin_records SET status='draft'`);assert.equal(projection().offer,null);reset();
 });
 check('master off preserves normal export for all stored child switches',()=>{
  for(const hp of [false,true])for(const ha of [false,true]){save(setting(false,hp,ha));assert.ok(projection().offer);}
  save(setting(true,false,false));assert.ok(projection().offer);
 });
 check('a store policy transition queues only its own versioned reconciliation',()=>{
  reset();seed();const before=row();const revision=scalar(`SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id='${STORE}'`);save(setting(true,false,true));
  assert.equal(Number(scalar(`SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id='${STORE}'`)),Number(revision)+1);
  assert.equal(scalar(`SELECT include_fixed AND NOT processed FROM saas.google_merchant_catalog_batches WHERE store_id='${STORE}'`),'t');
  assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_catalog_batches WHERE store_id='${OTHER}'`),'0');
  const [job]=nextJobs();assert.equal(job.action,'delete');assert.equal(job.projection,null);assert.equal(job.variantId,VARIANT);assert.ok(job.generation>before.generation);
  assert.equal(finish(job,'excluded').outcome,'finished');assert.equal(row().google_product_id,null);assert.equal(row().last_export_fingerprint,null);
 });
 check('policy revision fences claimed upserts and late provider acknowledgements',()=>{
  reset();owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${VARIANT}')`);const [old]=nextJobs();assert.equal(old.action,'upsert');save(setting(true,true,false));
  assert.equal(read(old).outcome,'stale');assert.equal(finish(old).outcome,'stale');
  const [job]=nextJobs();assert.equal(job.action,'delete');assert.equal(job.projection,null);assert.equal(job.googleProductId,null,'unknown prior submission must still delete the stable product identity');
  assert.equal(finish(job,'excluded').outcome,'finished');
 });
 check('enqueue cannot create an upsert in catalog-only mode',()=>{
  reset();save(setting(true,false,true));owned(`SELECT saas.google_merchant_enqueue('${STORE}','${PRODUCT}','${VARIANT}')`);assert.equal(nextJobs()[0].action,'delete');
 });
 check('return to normal commerce republishes with the same stable offer ID',()=>{
  reset();seed();save(setting(true,true,false));const [remove]=nextJobs();finish(remove,'excluded');save(setting(false,true,false));const [restore]=nextJobs();assert.equal(restore.action,'upsert');assert.equal(restore.projection.offerId,VARIANT);assert.equal(restore.projection.itemGroupId,PRODUCT);assert.equal(finish(restore).outcome,'finished');assert.equal(row().google_product_id,'tr~TR~'+VARIANT);assert.equal(Number(scalar(`SELECT extract(epoch FROM next_status_check_at-last_submitted_at) FROM saas.google_merchant_outbox`)),172800);
 });
 check('phone, intro, no-op and equally restrictive edits preserve cadence and do not enqueue churn',()=>{
  reset();save(setting());owned(`UPDATE saas.google_merchant_catalog_batches SET processed=true`);seed();const before=row();
  save(setting(false,true,true,{messageIntro:'Yeni giriş',phone:'+905551234568'}));assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_catalog_batches WHERE NOT processed`),'0');assert.deepEqual(row(),before);assert.deepEqual(claim(),[]);
  save(setting(true,true,false));claim();owned(`UPDATE saas.google_merchant_catalog_batches SET processed=true`);const rev=scalar(`SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id='${STORE}'`);save(setting(true,false,true));assert.equal(scalar(`SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id='${STORE}'`),rev);assert.equal(scalar(`SELECT count(*) FROM saas.google_merchant_catalog_batches WHERE NOT processed`),'0');
 });
 check('reconciliation includes tracked removed variants and does not depend on their catalog row',()=>{
  reset();seed();owned(`DELETE FROM saas.pricing_variant_policy_state WHERE variant_id='${VARIANT}';DELETE FROM saas.pricing_variant_policy_versions WHERE variant_id='${VARIANT}';DELETE FROM saas.product_variants WHERE id='${VARIANT}'`);save(setting(true,true,false));const [job]=nextJobs();assert.equal(job.variantId,VARIANT);assert.equal(job.action,'delete');finish(job,'excluded');
  owned(`INSERT INTO saas.product_variants VALUES('${VARIANT}','${STORE}','${PRODUCT}','Standart','RING-4','970000004',100,'active','{"color":"Gold"}',clock_timestamp(),true)`);
 });
 check('effective policy for another store never restricts this host catalog',()=>{
  reset();seed();save(setting(true,true,true),OTHER);assert.ok(projection().offer);assert.deepEqual(claim(),[]);
 });
 check('guarded rollback refuses active restrictions',()=>{
  reset();save(setting(true,true,false));const failed=sql(source(DOWN),DB,true);assert.notEqual(failed.status,0);assert.match(failed.stderr,/MERCHANT257_ACTIVE_POLICY/);
 });
 check('rollback restores functions and leaves Merchant receipts intact',()=>{
  reset();seed();const before=row();sql(source(DOWN));assert.deepEqual(row(),before);sql(source(UP));assert.deepEqual(row(),before);
 });
 console.log(`PASS native WhatsApp Merchant policy: ${count} scenarios`);
}finally{command('pg_ctl',['-D',data,'stop','-m','immediate'],'',true);rmSync(root,{recursive:true,force:true});}
