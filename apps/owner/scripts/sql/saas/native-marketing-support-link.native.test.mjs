import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Executes the real native252 branding and canonical required-page SQL on a
// disposable socket-only PostgreSQL. Only unrelated media/host authorization
// collaborators are deterministic fixtures; no external connection is used.
const SQL=import.meta.dirname;
const BASE=process.env.CELEBIX_NATIVE253_BASE_SQL??SQL;
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202610180253_native_marketing_support_link.up.sql';
const DOWN=UP.replace('.up.','.down.');
const root=mkdtempSync('/tmp/celebix-native253-'),socket=path.join(root,'socket'),data=path.join(root,'data');
const port=26000+Math.floor(Math.random()*10000),DB='native253_fixture';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const RA='10000000-0000-4000-8000-000000000003',RB='10000000-0000-4000-8000-000000000004';
const NOW='2026-10-18T12:00:00Z';
mkdirSync(socket,{mode:0o700});
function command(name,args,input='',allow=false){const r=spawnSync(path.join(BIN,name),args,{input,encoding:'utf8',timeout:60000,env:{...process.env,LC_ALL:'C',LANG:'C'},maxBuffer:16*1024*1024});if(r.error)throw r.error;if(!allow&&r.status!==0)throw Error(r.stderr);return r;}
const sql=(input,allow=false,db=DB)=>command('psql',['-h',socket,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],input,allow);
const scalar=input=>sql(input).stdout.trim();
const query=input=>JSON.parse(scalar(input));
const source=file=>readFileSync(path.join(BASE,file),'utf8');
const owned=input=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${input};COMMIT;`);
const brand=(store=A)=>query(`SET ROLE celebix_saas_owner;SELECT jsonb_build_object('value',saas.native_marketing_branding('${store}','${NOW}'))`).value;
function extract(file,name,tag='$f$'){
 const text=source(file),start=text.indexOf(`CREATE FUNCTION saas.${name}(`)>=0?text.indexOf(`CREATE FUNCTION saas.${name}(`):text.indexOf(`CREATE OR REPLACE FUNCTION saas.${name}(`);
 assert.ok(start>=0,name);const open=text.indexOf(tag,start),end=text.indexOf(tag+';',open+tag.length);assert.ok(end>open,name);return text.slice(start,end+tag.length+1);
}
const targetIdentity="saas.native_marketing_branding(uuid,timestamp with time zone)";
const definition=()=>scalar(`SELECT pg_get_functiondef('${targetIdentity}'::regprocedure)`);
const hash=()=>scalar(`SELECT encode(sha256(convert_to(pg_get_functiondef('${targetIdentity}'::regprocedure),'UTF8')),'hex')`);
let checks=0;function check(name,run){run();console.log(`PASS ${++checks} ${name}`);}
try{
 command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8','--no-sync']);
 command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);
 sql(`CREATE DATABASE ${DB}`,false,'postgres');
 const required='202610040213_required_store_pages.up.sql';
 const projectionSource=source(required),projectionStart=projectionSource.indexOf('$next_2$')+8;
 const projectionBody=projectionSource.slice(projectionStart,projectionSource.indexOf('$next_2$',projectionStart));
 sql(`CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS;CREATE ROLE celebix_saas_app NOLOGIN;CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;GRANT USAGE ON SCHEMA saas TO PUBLIC;SET ROLE celebix_saas_owner;
 CREATE TABLE saas.stores(id uuid PRIMARY KEY,name text,status text);
 CREATE TABLE saas.store_domains(id uuid PRIMARY KEY,store_id uuid,hostname text,status text,is_primary boolean,updated_at timestamptz,verified_at timestamptz);
 CREATE TABLE saas.storefront_designs(store_id uuid PRIMARY KEY,published_config jsonb,published_version bigint DEFAULT 1);
 CREATE TABLE saas.merchant_admin_records(id uuid,store_id uuid,record_kind text,name text,status text,config jsonb,updated_at timestamptz,PRIMARY KEY(store_id,id));
 CREATE TABLE saas.merchant_content_bodies(store_id uuid,record_id uuid,body text,body_format text,excerpt text,seo_title text,seo_description text);
 CREATE TABLE saas.store_required_pages(store_id uuid,page_key text,record_id uuid,slug text,locale text,PRIMARY KEY(store_id,page_key),FOREIGN KEY(store_id,record_id) REFERENCES saas.merchant_admin_records(store_id,id));
 CREATE FUNCTION saas.public_storefront_authorized(uuid,text,timestamptz) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM saas.store_domains d JOIN saas.stores s ON s.id=d.store_id WHERE d.store_id=$1 AND d.hostname=$2 AND d.status='active' AND d.verified_at<=$3 AND s.status='active')$$;
 CREATE FUNCTION saas.storefront_design_public_media(uuid,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT NULL::jsonb$$;
 CREATE FUNCTION saas.public_storefront_asset(uuid,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT NULL::jsonb$$;
 CREATE FUNCTION saas.merchant_admin_timestamp(timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT $1::text$$;
 ${extract('202609290174_merchant_content_bodies.up.sql','merchant_content_locale_config')}
 ${extract('202609290177_public_merchant_content.up.sql','public_content_locale_config')}
 ${extract('202607310071_storefront_policy_search.up.sql','store_policy_hostname_valid','$function$')}
 ${extract('202607310071_storefront_policy_search.up.sql','store_policy_public_store','$function$')}
 ${extract(required,'required_page_content_locale')}
 ${extract(required,'required_page_content_path')}
 CREATE FUNCTION saas.public_content_projection(p_store_id uuid,p_record_id uuid,p_default_locale text,p_include_body boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$${projectionBody}$f$;
 ${extract(required,'public_required_page_get')}
 ${extract('202610180252_native_marketing.up.sql','native_marketing_branding')}
 REVOKE ALL ON FUNCTION saas.native_marketing_branding(uuid,timestamptz) FROM PUBLIC;
 INSERT INTO saas.stores VALUES('${A}','Alpha','active'),('${B}','Beta','active');
 INSERT INTO saas.store_domains VALUES('${RA}','${A}','alpha.example.test','active',true,'2026-01-01','2026-01-01'),('${RB}','${B}','beta.example.test','active',true,'2026-01-01','2026-01-01');
 INSERT INTO saas.merchant_admin_records VALUES('${RA}','${A}','page','Contact','active','{"slug":"bize-ulasin","locale":"tr","published":true}','2026-01-01'),('${RB}','${B}','page','Contact','active','{"slug":"talk-to-beta","locale":"tr","published":true}','2026-01-01');
 INSERT INTO saas.store_required_pages VALUES('${A}','contact','${RA}','bize-ulasin','tr'),('${B}','contact','${RB}','talk-to-beta','tr');RESET ROLE;`);
 const oldDefinition=definition(),oldHash=hash(),oldBrand=brand();
 assert.equal(oldHash,'896b99da7714273aed3298cfc043d2af8f9a19ef47bd9168de1955c702b30f37');
 if(!process.argv.includes('--baseline'))sql(readFileSync(path.join(SQL,UP),'utf8'));
 check('published adopted contact slug produces the canonical pages link',()=>assert.equal(brand().supportUrl,'https://alpha.example.test/pages/bize-ulasin'));
 check('other tenant contact mapping never supplies the current store link',()=>assert.equal(brand(B).supportUrl,'https://beta.example.test/pages/talk-to-beta'));
 check('contact slug changes follow the canonical record path',()=>{owned(`UPDATE saas.merchant_admin_records SET config=jsonb_set(config,'{slug}','"reach-us-now"') WHERE store_id='${A}' AND id='${RA}'`);assert.equal(brand().supportUrl,'https://alpha.example.test/pages/reach-us-now');});
 check('unpublished contact falls back to canonical store origin',()=>{owned(`UPDATE saas.merchant_admin_records SET config=jsonb_set(config,'{published}','false') WHERE store_id='${A}' AND id='${RA}'`);assert.equal(brand().supportUrl,'https://alpha.example.test');});
 check('draft contact falls back and never borrows another tenant page',()=>{owned(`UPDATE saas.merchant_admin_records SET status='draft',config=jsonb_set(config,'{published}','true') WHERE store_id='${A}' AND id='${RA}'`);assert.equal(brand().supportUrl,'https://alpha.example.test');});
 check('missing required contact mapping falls back to canonical store origin',()=>{owned(`DELETE FROM saas.store_required_pages WHERE store_id='${A}'`);assert.equal(brand().supportUrl,'https://alpha.example.test');});
 check('nondefault enabled contact locale uses the canonical lang query',()=>{owned(`UPDATE saas.merchant_admin_records SET status='active',config='{"slug":"reach-us-now","locale":"en","published":true}' WHERE store_id='${A}' AND id='${RA}';INSERT INTO saas.store_required_pages VALUES('${A}','contact','${RA}','reach-us-now','en');INSERT INTO saas.merchant_admin_records VALUES('10000000-0000-4000-8000-000000000005','${A}','language_setting','Languages','active','{"defaultLocale":"tr","enabledLocales":["tr","en"]}','2026-01-01')`);assert.equal(brand().supportUrl,'https://alpha.example.test/pages/reach-us-now?lang=en');});
 check('disabled contact locale falls back to store origin',()=>{owned(`UPDATE saas.merchant_admin_records SET config='{"defaultLocale":"tr","enabledLocales":["tr"]}' WHERE store_id='${A}' AND record_kind='language_setting'`);assert.equal(brand().supportUrl,'https://alpha.example.test');});
 check('other branding fields retain the native252 projection',()=>{const {supportUrl,...after}=brand(),{supportUrl:ignored,...before}=oldBrand;assert.deepEqual(after,before);});
 check('unpublished or inactive canonical host remains unavailable',()=>{owned(`UPDATE saas.store_domains SET status='pending' WHERE store_id='${B}'`);assert.equal(brand(B),null);owned(`UPDATE saas.store_domains SET status='active' WHERE store_id='${B}'`);});
 if(process.argv.includes('--emit-definition')){
  const output=process.env.CELEBIX_NATIVE253_REPORT_DIRECTORY??path.resolve(SQL,'../../../../../');mkdirSync(output,{recursive:true});
  writeFileSync(path.join(output,'branding253-definition.sql'),definition()+'\n',{mode:0o600});
  writeFileSync(path.join(output,'branding253-hash.json'),JSON.stringify({oldHash,newHash:hash(),checksPassed:checks,externalConnections:0},null,2)+'\n',{mode:0o600});
 }
 if(existsSync(path.join(SQL,DOWN))){
  check('down requires explicit operator opt in',()=>{const r=sql(readFileSync(path.join(SQL,DOWN),'utf8'),true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_DOWN_REQUIRES_EXPLICIT_OPERATOR/);});
  check('down restores exact native252 function definition and authority',()=>{sql("SET celebix.allow_native253_down='on';\n"+readFileSync(path.join(SQL,DOWN),'utf8'));assert.equal(definition(),oldDefinition);assert.equal(hash(),oldHash);});
  check('down refuses replay rather than silently changing unknown source',()=>{const r=sql("SET celebix.allow_native253_down='on';\n"+readFileSync(path.join(SQL,DOWN),'utf8'),true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_SOURCE_DRIFT/);});
 }
 if(existsSync(path.join(SQL,'build-native253-stage.mjs'))){
  const output=path.join(root,'stage.sql');
  const build=()=>spawnSync(process.execPath,[path.join(SQL,'build-native253-stage.mjs'),output],{encoding:'utf8'});
  check('stage assembly is source only and refuses an existing output intent',()=>{const first=build();assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(first.stdout).databaseConnections,0);assert.notEqual(build().status,0);});
  // The actual routing collaborators above remain real SQL. Fill the remaining
  // catalog with inert sentinel functions to exercise exact1916/other1915 guards
  // without pretending this fixture contains the entire production kernel.
  owned(`DO $fill$ DECLARE n integer;BEGIN SELECT 1916-count(*) INTO n FROM pg_proc WHERE pronamespace='saas'::regnamespace;FOR i IN 1..n LOOP EXECUTE format('CREATE FUNCTION saas.native253_fixture_%s() RETURNS integer LANGUAGE sql AS %L',i,'SELECT '||i);END LOOP;END $fill$`);
  const productionStage=readFileSync(output,'utf8');
  // Only the production database identity is adapted for this isolated fixture.
  // Function count, source hashes, authority/schema/data guards remain unchanged.
  const adapted="SET celebix.deployment_tier='isolated_staging';\n"+productionStage.replace("current_database()<>'celebix_saas_staging_auth01'",`current_database()<>'${DB}'`);
  const tableNames=query(`SELECT jsonb_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='saas'::regnamespace AND relkind='r'`);
  const rows=()=>tableNames.map(name=>[name,scalar(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM saas.${name} t`)]);
  const originalRows=rows();
  check('unadapted root database authority rejects the disposable database',()=>{const r=sql(productionStage,true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_DATABASE_AUTHORITY/);assert.equal(hash(),oldHash);});
  const injected=statement=>adapted.replace('-- native253 reviewed source ends',statement+'\n-- native253 reviewed source ends');
  check('atomic apply rejects any of the other1915 function authority changes',()=>{const r=sql(injected('ALTER FUNCTION saas.native253_fixture_1() IMMUTABLE;'),true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_OTHER1915_FUNCTIONS_CHANGED/);assert.equal(hash(),oldHash);});
  check('atomic apply rejects unrelated schema edits and rolls back the correction',()=>{const r=sql(injected('ALTER TABLE saas.stores ADD COLUMN unauthorized text;'),true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_SCHEMA_CHANGED/);assert.equal(hash(),oldHash);});
  check('atomic apply rejects existing data updates and rolls back every row',()=>{const r=sql(injected(`UPDATE saas.stores SET name='unauthorized' WHERE id='${A}';`),true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_DATA_WRITE_DETECTED/);assert.deepEqual(rows(),originalRows);assert.equal(hash(),oldHash);});
  check('atomic apply rejects truncate through relation identity preservation',()=>{const r=sql(injected('TRUNCATE saas.stores;'),true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_SCHEMA_CHANGED/);assert.deepEqual(rows(),originalRows);assert.equal(hash(),oldHash);});
  check('root atomic apply changes one function and preserves1915 authorities plus all fixture rows',()=>{const receipt=query(adapted);assert.equal(receipt.kind,'native253StageAcknowledgement');assert.equal(receipt.otherFunctionsPreserved,1915);assert.equal(receipt.dataWrites,0);assert.equal(hash(),'686c8b97440f8272daa8e0336571bf8f9cc2a5ac2bea026c51b98c73735c6803');assert.deepEqual(rows(),originalRows);});
  check('root atomic apply refuses automatic replay',()=>{const r=sql(adapted,true);assert.notEqual(r.status,0);assert.match(r.stderr,/NATIVE253_SOURCE_DRIFT/);});
 }
 console.log(`Native253 PostgreSQL checks: ${checks}; external connections: 0`);
}finally{command('pg_ctl',['-D',data,'stop','-m','immediate'],'',true);rmSync(root,{recursive:true,force:true});}
