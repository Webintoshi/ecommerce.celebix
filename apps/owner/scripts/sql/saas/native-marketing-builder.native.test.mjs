import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// Socket-only PostgreSQL. Native functions and the existing recovery implementation
// execute unchanged; kernel authority/price collaborators use deterministic fixtures.
const SQL=import.meta.dirname,BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202610180252_native_marketing.up.sql',DOWN=UP.replace('.up.','.down.');
const root=mkdtempSync('/tmp/celebix-native-marketing-'),socket=path.join(root,'socket'),data=path.join(root,'data'),port=26000+Math.floor(Math.random()*10000),DB='native254_fixture';
mkdirSync(socket,{mode:0o700});
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1),B=id(2),P=id(3),M=id(4),PLAN=id(5),PRODUCT=id(6),VARIANT=id(7),CART=id(8),ABANDONED=id(9),EPISODE=id(10),LEASE=id(11),OTHERPRODUCT=id(12),OTHERVARIANT=id(13);
const NOW='2026-10-18T12:00:00.000Z',LATER='2026-10-18T12:02:00.000Z';
const source=file=>readFileSync(path.join(SQL,file),'utf8');
function command(name,args,input='',allow=false){const x=spawnSync(path.join(BIN,name),args,{input,encoding:'utf8',timeout:60000,env:{...process.env,LC_ALL:'C',LANG:'C'},maxBuffer:16*1024*1024});if(x.error)throw x.error;if(!allow&&x.status!==0)throw Error(x.stderr);return x;}
const sql=(text,allow=false,db=DB)=>command('psql',['-h',socket,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],text,allow);
const scalar=text=>sql(text).stdout.trim(),query=text=>JSON.parse(scalar(text));
const owned=text=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${text};COMMIT;`);
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const authority=(store=A,at=NOW)=>`'${store}','${P}','${M}','${PLAN}','pilot',1,'${at}'`;
const rpc=(expression,role='celebix_saas_app')=>query(`BEGIN;SET LOCAL ROLE ${role};SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`);
const admin=(action,value={},operation=100,store=A,at=NOW)=>rpc(`saas.native_marketing_command(${authority(store,at)},'${action}',${literal(['overview','products','preview'].includes(action)?value:{operationId:id(operation),fingerprint:operation.toString(16).padStart(64,'0'),value})})`);
let leaseCounter=1000;const leases=new Map();const leaseOf=delivery=>leases.get(delivery)??LEASE;
const claim=(time=NOW,stores=`ARRAY['${A}','${B}']::uuid[]`,testOnly=false)=>{const lease=id(++leaseCounter);const result=rpc(`saas.native_marketing_work_claim('worker','${time}','${time}'::timestamptz+interval '5 minutes',20,'${lease}',${stores},${testOnly})`,'celebix_saas_workflow');for(const item of result.result?.items??[])leases.set(item.deliveryId,lease);return result;};
const authorize=(delivery,time=NOW)=>rpc(`saas.native_marketing_work_authorize('${delivery}','${leaseOf(delivery)}','worker','${time}')`,'celebix_saas_workflow');
const finish=(delivery,kind='accepted',value='message-1',time=NOW)=>rpc(`saas.native_marketing_work_finish('${delivery}','${leaseOf(delivery)}','worker','${time}','${kind}','${value}',NULL)`,'celebix_saas_workflow');
const seal=(delivery,token='a',recovery=null,time=NOW)=>rpc(`saas.native_marketing_work_seal('${delivery}','${leaseOf(delivery)}','worker','${time}','native_01',decode(repeat('ab',40),'hex'),repeat('c',64),repeat('${token}',64),${recovery?`repeat('${recovery}',64)`:'NULL'},'${time}','${time}'::timestamptz+interval '24 hours')`,'celebix_saas_workflow');
function extracted(name){const m=source('202609030124_commerce_analytics_cart_recovery.up.sql').match(new RegExp(`CREATE FUNCTION saas\\.${name}\\([\\s\\S]*?\\$function\\$;`));assert.ok(m,name);return m[0];}
function recoveryTable(){const m=source('202609030124_commerce_analytics_cart_recovery.up.sql').match(/CREATE TABLE saas\.abandoned_cart_recovery_tokens \([\s\S]*?\n\);/);assert.ok(m);return m[0];}
function seedCart(n,{last='2026-10-16T10:00Z',consent=true,checkout=false,paid=false,empty=false}={}){const cart=id(n),source=id(n+1),email=`customer${n}@example.test`;owned(`INSERT INTO saas.storefront_carts VALUES('${source}','${A}','active',1,'2027-01-01','${last}','${last}');INSERT INTO saas.abandoned_carts(id,store_id,source_cart_id,status,lifecycle_status,customer_email,customer_name,last_activity_at,created_at,updated_at,currency,total_cents) VALUES('${cart}','${A}','${source}','active','active','${email}','Customer','${last}','${last}','${last}','TRY',1000);INSERT INTO saas.email_marketing_proven_audience VALUES('${A}','${email}','${consent?'grant':'deny'}',${consent?"'2026-01-01'":"NULL"},${consent?"'v1'":"NULL"},NULL,NULL,'2026-01-01',1);${empty?'':`INSERT INTO saas.storefront_cart_items VALUES('${A}','${source}','${PRODUCT}','${VARIANT}',1,0,1000,'${last}','${last}');INSERT INTO saas.abandoned_cart_items VALUES('${A}','${cart}','${PRODUCT}','${VARIANT}','First',1,1000);`}${checkout?`INSERT INTO saas.storefront_checkout_start_snapshots VALUES('${A}','${source}','2026-10-18T11:45Z');`:''}${paid?`INSERT INTO saas.orders VALUES('${id(n+2)}','${A}','${email}','completed','2026-10-18T11:30Z','2026-10-18T11:30Z',1000);`:''}`);return{cart,source,email};}
let count=0;const check=(name,run)=>{run();console.log(`PASS ${++count} ${name}`);};
try{
 command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8','--no-sync']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);sql(`CREATE DATABASE ${DB}`,false,'postgres');
 sql(`CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS;CREATE ROLE celebix_saas_app NOLOGIN;CREATE ROLE celebix_saas_workflow NOLOGIN;CREATE ROLE celebix_saas_host_resolver NOLOGIN;CREATE ROLE celebix_saas_identity NOLOGIN;CREATE ROLE celebix_saas_bootstrap NOLOGIN;CREATE ROLE celebix_saas_observability NOLOGIN;CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;GRANT USAGE ON SCHEMA saas TO PUBLIC;SET ROLE celebix_saas_owner;
 CREATE TABLE saas.stores(id uuid PRIMARY KEY,name text,status text);
 CREATE TABLE saas.principals(id uuid PRIMARY KEY);
 CREATE TABLE saas.memberships(id uuid PRIMARY KEY,store_id uuid,UNIQUE(store_id,id));
 CREATE TABLE saas.products(id uuid PRIMARY KEY,store_id uuid,title text,slug text,status text,currency text,UNIQUE(store_id,id));
 CREATE TABLE saas.product_variants(id uuid PRIMARY KEY,store_id uuid,product_id uuid,status text,stock_tracking boolean,stock_quantity bigint,price_cents bigint,UNIQUE(store_id,id));
 CREATE TABLE saas.store_domains(id uuid PRIMARY KEY,store_id uuid,hostname text,status text,is_primary boolean,updated_at timestamptz);
 CREATE TABLE saas.storefront_designs(store_id uuid PRIMARY KEY,published_config jsonb,published_version bigint DEFAULT 1);
 CREATE TABLE saas.storefront_design_media(id uuid,store_id uuid,status text,public_url text);
 CREATE TABLE saas.merchant_admin_records(id uuid,store_id uuid,record_kind text,status text,config jsonb,updated_at timestamptz);
 CREATE TABLE saas.storefront_assets(id uuid,store_id uuid,public_url text,status text,asset_kind text,object_key text,media_type text);
 CREATE TABLE saas.store_commerce_analytics_settings(store_id uuid,recovery_link_hours integer);
 CREATE TABLE saas.product_media(id uuid,store_id uuid,product_id uuid,status text,public_url text,sort_order integer);
 CREATE TABLE saas.abandoned_carts(id uuid PRIMARY KEY,store_id uuid,source_cart_id uuid,status text,lifecycle_status text,recovered_order_id uuid,customer_email text,customer_name text,last_activity_at timestamptz,abandoned_at timestamptz,candidate_at timestamptz,recovered_at timestamptz,archived_at timestamptz,created_at timestamptz,updated_at timestamptz,version bigint DEFAULT 1,currency text,total_cents bigint,public_cart_digest text,first_touch_source text,first_touch_medium text,first_touch_campaign text,last_touch_source text,last_touch_medium text,last_touch_campaign text,device_group text,UNIQUE(store_id,id));
 CREATE TABLE saas.abandoned_cart_items(store_id uuid,cart_id uuid,product_id uuid,variant_id uuid,product_name text,quantity integer,line_total_cents bigint);
 CREATE TABLE saas.abandoned_cart_episodes(id uuid PRIMARY KEY,store_id uuid,cart_id uuid,episode_number integer,candidate_at timestamptz,abandoned_at timestamptz,resumed_at timestamptz,recovered_at timestamptz,closed_at timestamptz,linked_order_id uuid,currency text,value_minor bigint,first_touch jsonb,last_touch jsonb,created_at timestamptz,updated_at timestamptz,UNIQUE(store_id,id));
 CREATE TABLE saas.abandoned_cart_episode_items(store_id uuid,episode_id uuid,product_id uuid,variant_id uuid,category_id uuid,brand_id uuid,product_name text,quantity integer,line_total_minor bigint,created_at timestamptz);
 CREATE TABLE saas.storefront_carts(id uuid PRIMARY KEY,store_id uuid,status text,version bigint,expires_at timestamptz,created_at timestamptz,updated_at timestamptz,UNIQUE(store_id,id));
 CREATE TABLE saas.storefront_cart_items(store_id uuid,cart_id uuid,product_id uuid,variant_id uuid,quantity integer,position integer,unit_price_cents bigint,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE saas.storefront_checkout_start_snapshots(store_id uuid,cart_id uuid,started_at timestamptz);
 CREATE TABLE saas.storefront_cart_credentials(store_id uuid,cart_id uuid,key_id text,credential_digest text,expires_at timestamptz);
 CREATE TABLE saas.storefront_cart_attribution(store_id uuid,cart_id uuid,first_touch_source text,first_touch_medium text,first_touch_campaign text,last_touch_source text,last_touch_medium text,last_touch_campaign text,referrer_host text,landing_path_group text,device_group text,anonymous_session_ref text,created_at timestamptz,updated_at timestamptz,UNIQUE(store_id,cart_id));
 CREATE TABLE saas.catalog_product_categories(store_id uuid,product_id uuid,category_id uuid,position integer);CREATE TABLE saas.catalog_categories(store_id uuid,id uuid,status text,depth integer);CREATE TABLE saas.catalog_admin_resource_products(store_id uuid,product_id uuid,resource_id uuid,position integer);CREATE TABLE saas.catalog_admin_resources(store_id uuid,id uuid,resource_kind text,status text);
 CREATE TABLE saas.orders(id uuid PRIMARY KEY,store_id uuid,customer_email text,payment_status text,created_at timestamptz,updated_at timestamptz,total_cents bigint);
 CREATE TABLE saas.email_marketing_proven_audience(store_id uuid,email text,kind text,consented_at timestamptz,evidence_version text,first_name text,last_name text,effective_at timestamptz,sequence bigint);
 CREATE FUNCTION saas.catalog_admin_timestamp(timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT to_char($1 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$$;
 CREATE FUNCTION saas.campaign_starter_exact_keys(jsonb,text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT jsonb_typeof($1)='object' AND(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys($1) k)=(SELECT array_agg(k ORDER BY k) FROM unnest($2) k)$$;
 CREATE FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) RETURNS text LANGUAGE sql AS $$SELECT CASE WHEN $2='${P}' AND EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=$1 AND id=$3) THEN NULL ELSE 'membership_denied' END$$;
 CREATE FUNCTION saas.commercial_current_plan(uuid) RETURNS uuid LANGUAGE sql AS $$SELECT '${PLAN}'::uuid$$;
 CREATE FUNCTION saas.commercial_plan_has_capability(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT $1='${PLAN}' AND $2='email_marketing'$$;
 CREATE FUNCTION saas.public_storefront_asset(uuid,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('url',public_url) FROM saas.storefront_assets WHERE store_id=$1 AND id=($3->>'assetId')::uuid AND asset_kind=$2 AND status='active'$$;
 CREATE FUNCTION saas.storefront_design_public_media(uuid,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('url',public_url) FROM saas.storefront_design_media WHERE store_id=$1 AND id=($2->>'mediaId')::uuid AND status='active'$$;
 CREATE FUNCTION saas.commerce_analytics_settings_for_store(uuid,timestamptz) RETURNS saas.store_commerce_analytics_settings LANGUAGE sql AS $$SELECT $1,168$$;
 CREATE FUNCTION saas.public_storefront_authorized(uuid,text,timestamptz) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM saas.store_domains d JOIN saas.stores s ON s.id=d.store_id WHERE d.store_id=$1 AND d.hostname=$2 AND d.status='active' AND s.status='active')$$;
 CREATE FUNCTION saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text) RETURNS TABLE(outcome text,price_cents bigint) LANGUAGE sql AS $$SELECT 'found',v.price_cents FROM saas.product_variants v WHERE v.store_id=$1 AND v.id=$2 AND v.price_cents IS NOT NULL$$;
 CREATE FUNCTION saas.storefront_available_stock(uuid,uuid,timestamptz,uuid) RETURNS bigint LANGUAGE sql AS $$SELECT stock_quantity FROM saas.product_variants WHERE store_id=$1 AND id=$2$$;
 CREATE FUNCTION saas.email_marketing_append_event(uuid,text,text,text,text,text,timestamptz,timestamptz,text) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN INSERT INTO saas.email_marketing_proven_audience VALUES($1,$2,$3,$8,$9,NULL,NULL,$7,999);RETURN 999;END$$;
 CREATE FUNCTION saas.commerce_analytics_enqueue_cart_event(uuid,uuid,uuid,text,text,text,bigint,timestamptz) RETURNS void LANGUAGE sql AS $$SELECT$$;
 CREATE FUNCTION saas.storefront_cart_projection(uuid,uuid,timestamptz) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('id',$2,'storeId',$1)$$;
 ${recoveryTable()}
 ${extracted('public_cart_recovery_restore')}
 ${extracted('sync_commerce_cart_conversion_state')}
 CREATE TRIGGER sync_conversion BEFORE INSERT OR UPDATE OF recovered_order_id ON saas.abandoned_carts FOR EACH ROW EXECUTE FUNCTION saas.sync_commerce_cart_conversion_state();
 ${extracted('sync_commerce_analytics_paid_recovery')}
 CREATE TRIGGER sync_payment AFTER INSERT OR UPDATE OF payment_status ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.sync_commerce_analytics_paid_recovery();
 INSERT INTO saas.stores VALUES('${A}','Alpha','active'),('${B}','Beta','active');INSERT INTO saas.principals VALUES('${P}');INSERT INTO saas.memberships VALUES('${M}','${A}');
 INSERT INTO saas.products VALUES('${PRODUCT}','${A}','First','first','active','TRY'),('${OTHERPRODUCT}','${B}','Other','other','active','TRY');INSERT INTO saas.product_variants VALUES('${VARIANT}','${A}','${PRODUCT}','active',true,20,1000),('${OTHERVARIANT}','${B}','${OTHERPRODUCT}','active',true,20,2000);
 INSERT INTO saas.store_domains VALUES('${id(21)}','${A}','alpha.example.test','active',true,'2026-01-01'),('${id(22)}','${B}','beta.example.test','active',true,'2026-01-01');
 INSERT INTO saas.email_marketing_proven_audience VALUES('${A}','ada@example.test','grant','2026-01-01','v1','Ada',NULL,'2026-01-01',1),('${B}','ada@example.test','grant','2026-01-01','v1','Ada',NULL,'2026-01-01',1),('${A}','denied@example.test','deny',NULL,NULL,NULL,NULL,'2026-02-01',2);
 RESET ROLE;`);
 const previousRecovery=scalar("SELECT pg_get_functiondef('saas.public_cart_recovery_restore(text,timestamptz,text,uuid,text,text,timestamptz)'::regprocedure)");
 sql(source(UP));sql(source(UP.replace('.up.','_assertions.')));

 owned(`CREATE TABLE saas.store_required_pages(store_id uuid,page_key text,record_id uuid,locale text);
 CREATE FUNCTION saas.public_required_page_get(text,timestamptz,text,text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql AS $$SELECT 'not_found',NULL::jsonb$$;
 CREATE FUNCTION saas.required_page_content_path(uuid,uuid,text) RETURNS text LANGUAGE sql AS $$SELECT '/pages/contact'$$;
 CREATE FUNCTION saas.public_content_locale_config(uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"defaultLocale":"tr"}'::jsonb$$;`);
 sql(source('202610180253_native_marketing_support_link.up.sql'));
 const legacy={subject:'Builder',heading:'Hello',body:'Details',buttonLabel:'Shop',buttonPath:'/products'};
 const doc={...legacy,schemaVersion:2,blocks:[{id:id(50),type:'heading',text:'Hello',align:'left',color:'#292524',size:'medium'},{id:id(51),type:'image',assetId:id(52),alt:'',linkPath:''},{id:id(53),type:'products',productIds:[PRODUCT],columns:2}]};
 const imageUrl=`https://media.saas-staging.celebix.site/stores/${A}/storefront/hero/${id(52)}.webp`;
 owned(`INSERT INTO saas.storefront_assets VALUES('${id(52)}','${A}','${imageUrl}','active','hero','stores/${A}/storefront/hero/${id(52)}.webp','image/webp')`);
 const oldProjection=query(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_projection(saas.native_marketing_branding('${A}','${NOW}'),${literal({...legacy,id:'offer',version:1})},'[]','ada@example.test','Ada',false,false)`);
 if(process.argv.includes('--direct'))sql(source('202610180254_native_marketing_builder.up.sql'));
 else if(!process.argv.includes('--baseline')){
  const output=path.join(root,'native254-stage.sql'),runtime='1'.repeat(40),build=()=>spawnSync(process.execPath,[path.join(SQL,'build-native254-stage.mjs'),output,runtime],{encoding:'utf8'});
  check('stage assembly uses source only and refuses replacing an existing intent',()=>{const r=build();assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).databaseConnections,0);assert.notEqual(build().status,0);});
  owned(`DO $fill$ DECLARE n integer;BEGIN SELECT 1916-count(*) INTO n FROM pg_proc WHERE pronamespace='saas'::regnamespace;FOR i IN 1..n LOOP EXECUTE format('CREATE FUNCTION saas.native254_fixture_%s() RETURNS integer LANGUAGE sql AS %L',i,'SELECT '||i);END LOOP;END $fill$`);
  const before=scalar(`SELECT jsonb_agg(jsonb_build_array(p.oid,to_jsonb(p),pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE pronamespace='saas'::regnamespace`);
  const tables=query(`SELECT jsonb_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='saas'::regnamespace AND relkind='r'`),rows=()=>tables.map(t=>[t,scalar(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') FROM saas.${t} r`)]),beforeRows=rows();
  const fixtureFingerprint=scalar("SET search_path=pg_catalog;SELECT encode(sha256(convert_to(string_agg(p.oid::regprocedure::text||':'||pg_get_functiondef(p.oid)||':'||coalesce(p.proacl::text,'')||':'||p.proowner::text,E'\\n' ORDER BY p.oid::regprocedure::text),'UTF8')),'hex') FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
  const stage=readFileSync(output,'utf8'),adapted="SET celebix.deployment_tier='isolated_staging';SET celebix.native254_readers_ready='owner_net_site';\n"+stage.replace("current_database()<>'celebix_saas_staging_auth01'",`current_database()<>'${DB}'`).replaceAll('6abef1d6d3b8ba24bb7f1b3a9a4b53e2fbdcfd5535930a00ff1ef6059a0b147b',fixtureFingerprint);
  const checkRollback=(text,pattern)=>{const r=sql(text,true);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);assert.equal(scalar(`SELECT jsonb_agg(jsonb_build_array(p.oid,to_jsonb(p),pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE pronamespace='saas'::regnamespace`),before);assert.deepEqual(rows(),beforeRows);};
  const inject=statement=>adapted.replace('-- native254 reviewed source ends',statement+'\n-- native254 reviewed source ends');
  check('root-only database identity and owner-reader acknowledgement fail closed',()=>{checkRollback(stage,/NATIVE254_DATABASE_AUTHORITY/);checkRollback(adapted.replace("SET celebix.native254_readers_ready='owner_net_site';",""),/NATIVE254_OWNER_READERS_NOT_ACKNOWLEDGED/);});
  check('root baseline fingerprint rejects any preexisting function change',()=>{owned('ALTER FUNCTION saas.native254_fixture_1() IMMUTABLE;');const r=sql(adapted,true);assert.match(r.stderr,/NATIVE254_BASELINE1916_FINGERPRINT/);owned('ALTER FUNCTION saas.native254_fixture_1() VOLATILE;');});
  check('atomic stage rejects unrelated function metadata and target authority changes',()=>{checkRollback(inject('ALTER FUNCTION saas.native254_fixture_1() IMMUTABLE;'),/NATIVE254_OTHER1912_FUNCTIONS_CHANGED/);checkRollback(inject('ALTER FUNCTION saas.native_marketing_content_valid(jsonb) COST 101;'),/NATIVE254_TARGET_AUTHORITY_CHANGED/);checkRollback(inject('GRANT EXECUTE ON FUNCTION saas.native_marketing_builder_block_images(uuid,jsonb) TO celebix_saas_app;'),/NATIVE254_EXPECTED_FUNCTION_DRIFT/);});
  check('atomic stage rejects schema edits, table writes and truncation and restores every row',()=>{checkRollback(inject('ALTER TABLE saas.stores ADD COLUMN unauthorized text;'),/NATIVE254_SCHEMA_CHANGED/);checkRollback(inject(`UPDATE saas.stores SET name='Unauthorized' WHERE id='${A}';`),/NATIVE254_DATA_WRITE_DETECTED/);checkRollback(inject('TRUNCATE saas.storefront_assets;'),/NATIVE254_SCHEMA_CHANGED/);});
  check('atomic stage changes exactly four bodies, adds six owner-private helpers and preserves schema/data',()=>{const r=query(adapted);assert.equal(r.functionsChanged,4);assert.equal(r.privateHelpersAdded,6);assert.equal(r.otherFunctionsPreserved,1912);assert.equal(r.dataWrites,0);assert.deepEqual(rows(),beforeRows);assert.equal(scalar(`SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace`),'1922');});
  check('guarded empty rollback requires opt in and restores the four predecessor functions exactly',()=>{const down=source('202610180254_native_marketing_builder.down.sql');assert.match(sql(down,true).stderr,/NATIVE254_DOWN_REQUIRES_EXPLICIT_OPERATOR/);sql("SET celebix.allow_native254_down='on';\n"+down);assert.equal(scalar(`SELECT jsonb_agg(jsonb_build_array(p.oid,to_jsonb(p),pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE pronamespace='saas'::regnamespace`),before);assert.deepEqual(rows(),beforeRows);sql(adapted);});
  check('private helpers have no app, workflow or public execution grant',()=>{for(const role of ['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'])assert.equal(scalar(`SELECT has_function_privilege('${role}','saas.native_marketing_builder_block_images(uuid,jsonb)','EXECUTE')`),'f');});
 }

 check('strict V2 validates all block forms and rejects unknown document/block keys',()=>{
  assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_content_valid(${literal(doc)})`),'t');
  for(const invalid of [{...doc,remoteUrl:'https://evil.test'}, {...doc,blocks:[{...doc.blocks[0],html:'<x>'}]}, {...doc,blocks:[]}, {...doc,blocks:[doc.blocks[0],doc.blocks[0]]}, {...doc,blocks:[{...doc.blocks[1],assetId:''}]}, {...doc,blocks:[{...doc.blocks[0],color:'red'}]}, {...doc,blocks:[{...doc.blocks[0],text:'  '}]}, {...doc,blocks:[{id:id(70),type:'button',label:'Go',path:'//evil.test',color:'#112233',align:'left'}]}, {...doc,blocks:[{id:id(70),type:'text',text:'ö'.repeat(7000),color:'#112233',align:'left'}]}]) assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_content_valid(${literal(invalid)})`),'f');
 });
 check('all nine block types validate, null enums/unsafe paths/oversized documents reject, products aggregate in first order',()=>{
  const variants=[{type:'text',text:'Line\nDetails',align:'center',color:'#123456'},{type:'image_text',assetId:id(52),alt:'',heading:'Hello',text:'Detail',buttonLabel:'Shop',buttonPath:'/products?offer=1#new',imagePosition:'right'},{type:'button',label:'Shop',path:'/products',align:'right',color:'#123456'},{type:'banner',heading:'Hello',text:'Details',backgroundColor:'#123456',textColor:'#ffffff'},{type:'divider',color:'#123456'},{type:'spacer',height:24}].map((b,i)=>({...b,id:id(70+i)}));
  const full={...doc,blocks:[...doc.blocks,...variants]};assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_content_valid(${literal(full)})`),'t');
  const repeated={...doc,blocks:[doc.blocks[2],{...doc.blocks[2],id:id(90),productIds:[PRODUCT,id(91)]}]};assert.deepEqual(query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(saas.native_marketing_builder_product_ids(${literal(repeated)}))`),[PRODUCT,id(91)]);
  for(const block of [{...doc.blocks[0],align:null},{...doc.blocks[0],size:null},{...variants[1],imagePosition:null},{...variants[2],path:'/a%2fb'},{...variants[2],path:'/a%5cb'},{...variants[2],path:'/a%0ab'},{...variants[2],path:'/a\u0085b'},{...variants[2],label:'bad\u0085'},{...doc.blocks[0],text:'😀'.repeat(81)},{...doc.blocks[0],text:'\u00a0'}])assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_content_valid(${literal({...doc,blocks:[block]})})`),'f');
  const huge={...doc,blocks:Array.from({length:4},(_,i)=>({...variants[0],id:id(100+i),text:'ö'.repeat(2000)}))};assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_content_valid(${literal(huge)})`),'f');
  assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_builder_json_bytes(${literal(full)})`),String(Buffer.byteLength(JSON.stringify(full))));
  const twenty={...doc,blocks:Array.from({length:20},(_,i)=>({...variants.at(-1),id:id(100+i)}))};assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_content_valid(${literal(twenty)})`),'t');assert.equal(scalar(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_content_valid(${literal({...twenty,blocks:[...twenty.blocks,{...variants.at(-1),id:id(150)}]})})`),'f');
 });
 check('V2 preview resolves active same-store media and canonical product data',()=>{const p=admin('preview',{templateId:'offer',content:doc,productIds:[PRODUCT]});assert.equal(p.outcome,'found');assert.deepEqual(p.result.blockImages,[{assetId:id(52),url:imageUrl}]);assert.equal(p.result.items[0].productName,'First');assert.deepEqual(p.result.template.blocks,doc.blocks);});
 check('SQL rejects aggregate product mismatch, unknown products, V2 cart and client image URLs',()=>{
  for(const value of [{templateId:'offer',content:doc,productIds:[]},{templateId:'offer',content:doc,productIds:[OTHERPRODUCT]},{templateId:'cart',content:doc,productIds:[PRODUCT]},{templateId:'offer',content:{...doc,blocks:[{...doc.blocks[1],url:imageUrl}]},productIds:[]}]) assert.equal(admin('preview',value).outcome,'invalid_input');
  assert.equal(admin('template',{expectedVersion:1,template:{...doc,id:'cart',version:1}},500).outcome,'invalid_input');
  const foreign={...doc,blocks:[{...doc.blocks[2],productIds:[OTHERPRODUCT]}]};assert.equal(admin('preview',{templateId:'offer',content:foreign,productIds:[OTHERPRODUCT]}).outcome,'product_unavailable');assert.equal(admin('template',{expectedVersion:1,template:{...foreign,id:'welcome',version:1}},599).outcome,'product_unavailable');
 });
 check('wrong-store, inactive and malformed media fail closed without rewriting published design',()=>{
  const before=scalar("SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') FROM saas.storefront_designs d");
  for(const change of [`store_id='${B}'`,`status='archived'`,`public_url='https://evil.test/x.webp'`,`public_url='https://evil.test/stores/${A}/storefront/hero/${id(52)}.webp'`,`asset_kind='logo'`]){owned(`UPDATE saas.storefront_assets SET ${change} WHERE id='${id(52)}'`);assert.equal(admin('preview',{templateId:'offer',content:doc,productIds:[PRODUCT]}).outcome,'image_unavailable');owned(`UPDATE saas.storefront_assets SET store_id='${A}',status='active',asset_kind='hero',public_url='${imageUrl}' WHERE id='${id(52)}'`);}
  assert.equal(scalar("SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') FROM saas.storefront_designs d"),before);
 });
 check('V1 projection remains structurally and byte equivalent with no blockImages key',()=>{const p=query(`SET ROLE celebix_saas_owner;SELECT saas.native_marketing_projection(saas.native_marketing_branding('${A}','${NOW}'),${literal({...legacy,id:'offer',version:1})},'[]','ada@example.test','Ada',false,false)`);assert.deepEqual(p,oldProjection);assert.equal('blockImages' in p,false);});
 check('V2 saved template is versioned and implicit content still enforces exact aggregate',()=>{assert.equal(admin('template',{expectedVersion:1,template:{...doc,id:'offer',version:1}},501).outcome,'saved');assert.equal(admin('preview',{templateId:'offer',productIds:[]}).outcome,'invalid_input');assert.equal(admin('preview',{templateId:'offer',productIds:[PRODUCT]}).outcome,'found');});
 check('V2 sealed retry rechecks asset state and preserves all frozen bytes and token fields',()=>{
  const input={templateId:'offer',name:'Builder queue',content:doc,productIds:[PRODUCT]};assert.equal(admin('queue',input,502).outcome,'saved');assert.equal(admin('queue',input,502).outcome,'operation_replayed');
  const d=claim().result.items[0].deliveryId;assert.equal(seal(d).outcome,'sealed');assert.equal(finish(d,'uncertain','network_timeout').outcome,'finished');
  const frozen=scalar(`SELECT jsonb_build_array(projection,sealed_request,seal_key_id,request_digest,unsubscribe_token_digest,first_attempt_at,idempotency_expires_at) FROM saas.native_marketing_deliveries WHERE id='${d}'`);
  assert.equal(claim(LATER).result.items[0].deliveryId,d);owned(`UPDATE saas.storefront_assets SET status='archived' WHERE id='${id(52)}'`);assert.equal(authorize(d,LATER).outcome,'suppressed');
  assert.equal(scalar(`SELECT jsonb_build_array(projection,sealed_request,seal_key_id,request_digest,unsubscribe_token_digest,first_attempt_at,idempotency_expires_at) FROM saas.native_marketing_deliveries WHERE id='${d}'`),frozen);owned(`UPDATE saas.storefront_assets SET status='active' WHERE id='${id(52)}'`);
 });
 check('rollback refuses V2 persisted documents without rewriting any data',()=>{const r=sql("SET celebix.allow_native254_down='on';\n"+source('202610180254_native_marketing_builder.down.sql'),true);assert.match(r.stderr,/NATIVE254_DOWN_V2_DATA_PRESENT/);});
 if(process.argv.includes('--emit-catalog')){
 const names=['native_marketing_content_valid','native_marketing_projection','native_marketing_command','native_marketing_work_authorize'];
 const catalog=query(`SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'security',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND (p.proname IN(${names.map(x=>"'"+x+"'").join(',')}) OR p.proname LIKE 'native_marketing_builder_%')`);
 writeFileSync(path.resolve(SQL,'../../../../../.tmp/email-builder-20261018/native254-functions.json'),JSON.stringify(catalog,null,2)+'\n');
 }
 console.log(`Native254 PostgreSQL checks: ${count}; external connections: 0`);
}finally{command('pg_ctl',['-D',data,'stop','-m','immediate'],'',true);rmSync(root,{recursive:true,force:true});}
