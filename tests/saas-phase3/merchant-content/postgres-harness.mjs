import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {acceptedMerchantContentHrefs,rejectedMerchantContentHrefs} from '../../../packages/saas-contracts/src/merchant-content/href-vectors.fixture.ts';
import {parseSaveMerchantContentRequest} from '../../../packages/saas-contracts/src/merchant-content/validation.ts';
import {normalizeMerchantContentBody} from '../../../packages/platform-config/src/merchant-content-body.ts';
import {parseMerchantAdminRecord} from '../../../packages/saas-contracts/src/merchant-admin/validation.ts';
import {parseMerchantContentDocument} from '../../../packages/saas-contracts/src/merchant-content/validation.ts';
import {PostgresMerchantContentRepository} from '../../../packages/saas-data/src/merchant-content/repository.ts';

// Native, Unix-socket-only disposable cluster. Never reads a DSN or an existing database.
const ROOT=path.resolve(import.meta.dirname,'../../..'), SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202609290174_merchant_content_bodies.up.sql', DOWN=UP.replace('.up.','.down.');
const DB='merchant_content_fixture', NOW='2026-09-29T12:00:00.000Z';
const STORE='10000000-0000-4000-8000-000000000174', FOREIGN='10000000-0000-4000-8000-000000000175';
const PRINCIPAL='20000000-0000-4000-8000-000000000174', MEMBERSHIP='30000000-0000-4000-8000-000000000174';
const PLAN='00000000-0000-4000-8000-000000000001', HOST='content-fixture.example.test';
const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash=value=>createHash('sha256').update(value).digest('hex');
const lit=value=>value===null?'NULL':`'${String(value).replaceAll("'","''")}'`;
const json=value=>`${lit(JSON.stringify(value))}::jsonb`;
const A=(principal=PRINCIPAL,membership=MEMBERSHIP,store=STORE)=>`${lit(store)}::uuid,${lit(principal)}::uuid,${lit(membership)}::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
let root, socket, data, port, count=0;
function command(name,args,input='',allowFailure=false){const result=spawnSync(path.join(BIN,name),args,{cwd:ROOT,input,encoding:'utf8',timeout:120000,env:{...process.env,LC_ALL:'C',LANG:'C'},maxBuffer:64*1024*1024});if(result.error)throw result.error;if(!allowFailure&&result.status!==0)throw Error(`${name}: ${result.stderr}`);return result;}
function sql(source,db=DB,allowFailure=false){return command('psql',['-h',socket,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],source,allowFailure);}
const scalar=source=>sql(source).stdout.trim();
const query=source=>JSON.parse(scalar(source));
const owner=source=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${source};COMMIT;`);
function apply(file){sql(readFileSync(path.join(SQL,file),'utf8'));}
function rpc(call,role='celebix_saas_app'){return query(`BEGIN;SET LOCAL ROLE ${role};SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='2s';SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM ${call};COMMIT;`);}
function generic({record=id(1),version=null,config={slug:'legacy-page',locale:'tr',body:'Short legacy',published:false},operation=randomUUID(),name='Legacy',kind='page',status='draft',authority=A()}={}){return rpc(`saas.merchant_admin_save(${authority},'${operation}','${hash(operation)}','${record}',${version??'NULL'},'${kind}',${lit(name)},${json(config)},'${status}')`);}
function request(document=null,body='<p>Typed body</p>'){return {draftId:id(90),recordId:document?.id??null,expectedVersion:document?.version??null,expectedBodyDigest:document?.bodyDigest??null,kind:'page',bodyAction:'replace',values:{name:'Typed page',slug:'typed-page',locale:'tr',body,excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft'},origins:{}};}
function save(value,operation=randomUUID(),authority=A(),fingerprint=hash(JSON.stringify(value))){return rpc(`saas.merchant_content_save(${authority},'${operation}','${fingerprint}',${json(value)})`);}
function get(record,authority=A(),kind='page'){const result=rpc(`saas.merchant_content_get(${authority},'${kind}','${record}')`);if(result.outcome==='found')parseMerchantContentDocument(result.payload);return result;}
const recover=(operation,fingerprint,authority=A())=>rpc(`saas.merchant_content_recover_operation(${authority},'${operation}','${fingerprint}')`);
async function check(name,run){await run();console.log(`PASS ${++count} ${name}`);}
async function main(){
 try{
  root=mkdtempSync('/tmp/celebix-merchant-content-');socket=path.join(root,'socket');data=path.join(root,'data');port=24000+Math.floor(Math.random()*10000);mkdirSync(socket,{mode:0o700});
  command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);
  sql(`CREATE DATABASE ${DB};`,'postgres');
  const files=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||[130,142,144,149,150,153,154,158,162,163,164,165,170,171,172,173].includes(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
  for(const file of files)apply(file);
  owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Content fixture','content-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${FOREIGN}','Foreign fixture','foreign-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test','content-owner','owner@example.test',true,'2026-01-01','2026-01-01'),('${id(20)}','https://identity.example.test','other-owner','other@example.test',true,'2026-01-01','2026-01-01');
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${id(21)}','${id(20)}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${id(70)}','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(71)}','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1)`);
  assert.equal(generic().outcome,'saved','real current074 generic writer prerequisites');
  assert.equal(generic({record:id(2),config:{}}).outcome,'saved');
  for(const n of [3,4])assert.equal(generic({record:id(n),config:{slug:'historic-duplicate',locale:'tr',body:'Historic '+n,published:true},status:'active'}).outcome,'saved');
  assert.equal(generic({record:id(5),config:{published:true}}).outcome,'saved');
  assert.equal(generic({record:id(6),kind:'general_setting',config:{storeDisplayName:'Unrelated'}}).outcome,'saved');
  for(const n of [7,8])assert.equal(generic({record:id(n),config:{slug:'default-locale-duplicate',body:'Default locale',published:true},status:'active'}).outcome,'saved');
  const originalEvent=query(`SELECT summary FROM saas.merchant_admin_events WHERE record_id='${id(1)}' ORDER BY occurred_at LIMIT 1`);
  const frozen=query(`SELECT jsonb_object_agg(oid::text,jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text,'owner',proowner::regrole::text)) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND (proname LIKE 'content_authoring_%' OR proname LIKE 'catalog_%_with_origins' OR proname='public_starter_product_detail_v2')`);
  const functionPins=()=>query(`SELECT jsonb_object_agg(oid::text,encode(sha256(convert_to(pg_get_functiondef(oid)||coalesce(proacl::text,'')||proowner::regrole::text,'UTF8')),'hex')) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND prokind='f' AND proname NOT IN('merchant_admin_save','merchant_admin_archive','public_content_page_get')`);
  const originalFunctionPins=functionPins();
  const originalAcls=query(`SELECT jsonb_object_agg(proname,proacl::text) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('merchant_admin_save','merchant_admin_archive','public_content_page_get')`);
  if(existsSync(path.join(SQL,UP)))apply(UP);
  assert.notEqual(scalar("SELECT to_regprocedure('saas.merchant_content_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb)')::text"),'','typed save RPC must exist');
  await check('all unrelated function definitions owners and ACLs plus wrapped public grants remain exact',()=>{
   console.log(`PRESERVED unrelatedFunctions=${Object.keys(originalFunctionPins).length}; publicACLs=3`);const after=functionPins();for(const [oid,pin] of Object.entries(originalFunctionPins))assert.equal(after[oid],pin,`preserved functionOID ${oid}`);
   assert.deepEqual(query(`SELECT jsonb_object_agg(proname,proacl::text) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('merchant_admin_save','merchant_admin_archive','public_content_page_get')`),originalAcls);
   for(const table of ['merchant_content_bodies','merchant_content_versions'])assert.equal(scalar(`SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='saas.${table}'::regclass`),'t');
  });
  await check('SQL body grammar matches normalized positive and negative public contracts',()=>{
   const positive=['','<p>Türkçe &amp; 😀<br />satır</p>','<h2>A</h2><h3>B</h3><h4>C</h4>','<ul><li><p>Item</p></li></ul>','<table><tbody><tr><th>Başlık</th><td><p>Body</p></td></tr></tbody></table>','<p><a href="https://example.test/path?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">Link</a></p>','<p>a</p>'.repeat(10000),'<blockquote>'.repeat(64)+'x'+'</blockquote>'.repeat(64)];
   for(const body of positive)assert.equal(scalar(`SELECT saas.merchant_content_html_valid(${lit(body)})`),'t');
   for(const body of ['plain','<script>x</script>','<p onclick="x">x</p>','<p><div>x</div></p>','<table><td>x</td></table>','<p><a href="javascript:alert(1)">x</a></p>','<p>&nbsp;</p>','<p>'+String.fromCharCode(1)+'</p>','<blockquote>'.repeat(65)+'x'+'</blockquote>'.repeat(65)])assert.equal(scalar(`SELECT saas.merchant_content_html_valid(${lit(body)})`),'f');
  });
  await check('all shared href vectors have identical normalizer, strict contract and native SQL results',()=>{
   for(const [href,expected] of [...acceptedMerchantContentHrefs.map(x=>[x,true]),...rejectedMerchantContentHrefs.map(x=>[x,false])]){
    const escaped=href.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    let normalized=false;try{normalizeMerchantContentBody(`<p><a href="${escaped}">Link</a></p>`);normalized=true;}catch{}
    const html=`<p><a href="${escaped}"${/^https?:/i.test(href)?' target="_blank" rel="noopener noreferrer nofollow"':''}>Link</a></p>`;
    let parsed=false;try{parseSaveMerchantContentRequest(request(null,html));parsed=true;}catch{}
    const database=scalar(`SELECT saas.merchant_content_html_valid(${lit(html)})`)==='t';
    assert.deepEqual([normalized,parsed,database],[expected,expected,expected],JSON.stringify(href));
   }
   for(const space of ['\u00a0','\u1680','\u2000','\u2028','\u202f','\u205f','\u3000','\ufeff']){const html=`<ul>${space}<li>Item</li>${space}</ul>`;assert.equal(normalizeMerchantContentBody(html),html);assert.equal(scalar(`SELECT saas.merchant_content_html_valid(${lit(html)})`),'t');}
  });
  await check('raw JSON nulls and wrong primitive types are rejected before any mutation',()=>{for(const change of [{draftId:null},{draftId:42},{recordId:null,expectedVersion:1},{kind:null},{bodyAction:null}])assert.equal(save({...request(),...change}).outcome,'invalid_input');});
  await check('legacy exact body and missing metadata fallback do not mutate generic records',()=>{const d=get(id(1)).payload;assert.equal(d.body,'Short legacy');assert.equal(d.bodyFormat,'legacy');assert.equal(get(id(5)).payload.published,false);const blank=get(id(2)).payload;assert.equal(blank.slug,id(2));assert.equal(blank.locale,'tr');assert.equal(blank.published,false);assert.deepEqual(query(`SELECT config FROM saas.merchant_admin_records WHERE id='${id(2)}'`),{});});
  const body='<p>'+'ğ'.repeat(39996)+'x</p>';assert.equal(Buffer.byteLength(body),80000);
  let first,doc,operation=randomUUID(),input=request(null,body),fingerprint=hash(JSON.stringify(input));
  await check('80000-byte body atomic save/get with compact generic ledger and immutable exact replay',()=>{first=save(input,operation);assert.equal(first.outcome,'saved');doc=first.payload;assert.equal(doc.body,body);assert.deepEqual(get(doc.id).payload,doc);assert.deepEqual(recover(operation,fingerprint).payload,doc);assert.equal(recover(operation,fingerprint,A(id(20),id(21))).outcome,'operation_mismatch');assert.equal(save({...input,values:{...input.values,name:'Changed'}},operation).outcome,'operation_mismatch');assert.equal(scalar('SELECT max(pg_column_size(summary))<=16384 FROM saas.merchant_admin_events'),'t');assert.equal(scalar('SELECT max(pg_column_size(result_payload))<=32768 FROM saas.merchant_admin_operations'),'t');});
  await check('canonical LF body capacity and over-limit rejection are independent of JSON escaping',()=>{const x=request(null,'<pre>'+'\n'.repeat(79989)+'</pre>');x.values.slug='line-breaks';assert.equal(save(x).outcome,'saved');x.values.body+='a';assert.equal(save(x).outcome,'invalid_input');});
  await check('missing legacy locale uses the same route identity as explicit store locale',()=>{const x=request();x.values.slug='default-locale-duplicate';x.values.published=true;x.values.status='active';assert.equal(save(x).outcome,'version_conflict');const existing=get(id(7)).payload;const migrated=request(existing,'<p>Preserved route</p>');migrated.values.slug=existing.slug;migrated.values.published=true;migrated.values.status='active';assert.equal(save(migrated).outcome,'saved');});
  await check('version and body digest conflicts cannot mutate authoritative content',()=>{const stale=request(doc);stale.expectedVersion++;assert.equal(save(stale).outcome,'version_conflict');stale.expectedVersion=doc.version;stale.expectedBodyDigest='sha256:'+'0'.repeat(64);assert.equal(save(stale).outcome,'version_conflict');assert.deepEqual(get(doc.id).payload,doc);});
  await check('actual generic echo save preserves long body and absent projection empty default',()=>{const result=generic({record:doc.id,version:doc.version,name:'Metadata only',config:{slug:'typed-page',locale:'tr',body:'',published:false}});assert.equal(result.outcome,'saved');doc=get(doc.id).payload;assert.equal(doc.body,body);assert.equal(doc.name,'Metadata only');assert.equal(Object.hasOwn(query(`SELECT config FROM saas.merchant_admin_records WHERE id='${doc.id}'`),'body'),false);});
  await check('legacy short-body echo and omitted key cannot overwrite migrated body',()=>{let legacy=get(id(1)).payload;const x=request(legacy,body);x.values.slug='legacy-page';assert.equal(save(x).outcome,'saved');legacy=get(id(1)).payload;const echo=generic({record:legacy.id,version:legacy.version,config:{slug:'legacy-page',locale:'tr',body:'Short legacy',published:false}});assert.equal(echo.outcome,'saved');legacy=get(id(1)).payload;assert.equal(legacy.body,body);assert.equal(generic({record:legacy.id,version:legacy.version,config:{slug:'legacy-page',locale:'tr',published:false}}).outcome,'saved');legacy=get(id(1)).payload;assert.equal(legacy.body,body);assert.equal(query(`SELECT config FROM saas.merchant_admin_records WHERE id='${legacy.id}'`).body,'Short legacy');for(const bad of ['',null,'Different'])assert.equal(generic({record:legacy.id,version:legacy.version,config:{body:bad}}).outcome,'invalid_input');assert.deepEqual(query(`SELECT summary FROM saas.merchant_admin_events WHERE record_id='${id(1)}' AND summary->>'version'='1'`),originalEvent);});
  await check('typed explicit clear stays empty despite later inert legacy echo',()=>{const legacy=get(id(1)).payload;const x=request(legacy,'');x.values.slug='legacy-page';assert.equal(save(x).outcome,'saved');let cleared=get(id(1)).payload;assert.equal(cleared.body,'');assert.equal(generic({record:cleared.id,version:cleared.version,config:{body:'Short legacy'}}).outcome,'saved');assert.equal(get(cleared.id).payload.body,'');});
  await check('preserve requires exact bytes and matching origins',()=>{const x=request(doc,doc.body);x.bodyAction='preserve';x.values.body+='x';assert.equal(save(x).outcome,'invalid_input');x.values.body=doc.body;x.origins={body:{state:'manual'}};assert.equal(save(x).outcome,'invalid_input');});
  await check('malformed origin primitives and metadata cannot reach controlled writer state',()=>{for(const origins of [{body:0},{body:null},{body:{state:'manual',extra:true}},{body:{state:'ai',generationId:null}},{body:{state:'edited_ai',generationId:'invalid'}}])assert.equal(save({...request(),origins}).outcome,'invalid_input');});
  await check('AI claims unavailable until controlled content lineage integration',()=>{const x=request();x.origins={body:{state:'ai',generationId:id(99)}};assert.equal(save(x).outcome,'unavailable');});
  await check('typed metadata keeps exact legacy generic GET roundtrip while multiline/control metadata rejects',()=>{
   const x=request();x.kind='blog_post';x.values.slug='metadata-excerpt';x.values.excerpt='Plain typed excerpt';const result=save(x);assert.equal(result.outcome,'saved');const legacy=rpc(`saas.merchant_admin_get_record(${A()},'blog_post','${result.payload.id}')`);assert.equal(legacy.outcome,'found');parseMerchantAdminRecord(legacy.payload);assert.equal(get(result.payload.id,A(),'blog_post').payload.excerpt,x.values.excerpt);
   for(const field of ['name','excerpt','seoTitle','seoDescription'])for(const bad of ['First\nSecond','First\rSecond','First\tSecond','\u00a0leading','trailing\ufeff']){const invalid=request();invalid.values[field]=bad;assert.throws(()=>parseSaveMerchantContentRequest(invalid));assert.equal(save(invalid).outcome,'invalid_input');}
  });
  await check('sidecar generic metadata keeps literal text readable and rejects incompatible routes before any write',()=>{
   const x=request();x.kind='blog_post';x.values.slug='generic-compat';x.values.excerpt='Initial excerpt';
   const saved=save(x);assert.equal(saved.outcome,'saved');
   const id=saved.payload.id;
   const accepted=generic({record:id,version:1,kind:'blog_post',name:'<b>Heading</b>',config:{slug:'generic-compat',locale:'tr',excerpt:'<b>Excerpt</b>',published:false}});
   assert.equal(accepted.outcome,'saved');
   const current=get(id,A(),'blog_post').payload;
   assert.equal(current.name,'<b>Heading</b>');assert.equal(current.excerpt,'<b>Excerpt</b>');
   const history=rpc(`saas.merchant_content_versions(${A()},'blog_post','${id}',10,NULL)`);
   assert.equal(history.outcome,'listed');assert.equal(history.payload.items[0].values.name,current.name);assert.equal(history.payload.items[0].values.excerpt,current.excerpt);
   const state=()=>query(`SELECT jsonb_build_object('record',(SELECT to_jsonb(r) FROM saas.merchant_admin_records r WHERE id='${id}'),'body',(SELECT to_jsonb(b) FROM saas.merchant_content_bodies b WHERE record_id='${id}'),'versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY version) FROM saas.merchant_content_versions v WHERE record_id='${id}'),'events',(SELECT count(*) FROM saas.merchant_admin_events WHERE record_id='${id}'),'operations',(SELECT count(*) FROM saas.merchant_admin_operations WHERE store_id='${STORE}'))`);
   for(const [config,status] of [
    [{slug:'Bad Slug',locale:'tr',published:false},'draft'],
    [{slug:23,locale:'tr',published:false},'draft'],
    [{slug:'generic-compat',locale:'bad_locale',published:false},'draft'],
    [{slug:'generic-compat',locale:23,published:false},'draft'],
    [{slug:'generic-compat',locale:'tr',published:'true'},'draft'],
    [{locale:'tr',published:true},'active'],
    [{slug:'generic-compat',locale:'tr',published:true},'draft'],
    [{slug:'generic-compat',locale:'tr',excerpt:23,published:false},'draft'],
    [{slug:'generic-compat',locale:'tr',excerpt:'First\nSecond',published:false},'draft'],
   ]){
    const before=state();
    assert.equal(generic({record:id,version:current.version,kind:'blog_post',name:'Generic edit',config,status}).outcome,'invalid_input',JSON.stringify(config));
    assert.deepEqual(state(),before,JSON.stringify(config));
    assert.deepEqual(get(id,A(),'blog_post').payload,current);
   }
  });
  await check('body/history/event/operation failures roll back every save side effect',()=>{
   const snapshot=()=>query(`SELECT jsonb_build_object('records',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM saas.merchant_admin_records x),'bodies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY record_id) FROM saas.merchant_content_bodies x),'versions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY record_id,version) FROM saas.merchant_content_versions x),'events',(SELECT count(*) FROM saas.merchant_admin_events),'operations',(SELECT count(*) FROM saas.merchant_admin_operations))`);
   for(const table of ['merchant_content_bodies','merchant_content_versions','merchant_admin_events','merchant_admin_operations']){const before=snapshot();owner(`CREATE FUNCTION saas.fixture_fail_content() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'FIXTURE_ROLLBACK'; END $f$;CREATE TRIGGER fixture_fail BEFORE INSERT OR UPDATE ON saas.${table} FOR EACH ROW EXECUTE FUNCTION saas.fixture_fail_content()`);const x=request(doc,body);assert.throws(()=>save(x),/FIXTURE_ROLLBACK/);owner(`DROP TRIGGER fixture_fail ON saas.${table};DROP FUNCTION saas.fixture_fail_content()`);assert.deepEqual(snapshot(),before);}
  });
  await check('editor manages and archives while analyst/cashier cannot write or recover',()=>{for(const role of ['editor','analyst','cashier']){owner(`UPDATE saas.memberships SET role='${role}' WHERE id='${MEMBERSHIP}'`);const x=request();x.values.slug='role-'+role;const saved=save(x);assert.equal(saved.outcome,role==='editor'?'saved':'membership_denied');if(role==='editor')assert.equal(rpc(`saas.merchant_admin_archive(${A()},'${randomUUID()}','${hash('editor-archive')}','${saved.payload.id}',1)`).outcome,'archived');if(role!=='editor')assert.equal(recover(operation,fingerprint).outcome,'membership_denied');}owner(`UPDATE saas.memberships SET role='store_owner' WHERE id='${MEMBERSHIP}'`);assert.equal(get(doc.id,A(PRINCIPAL,MEMBERSHIP,FOREIGN)).outcome,'membership_denied');});
  await check('current plan revocation fences saved operation recovery',()=>{owner(`UPDATE saas.subscriptions SET status='inactive' WHERE store_id='${STORE}'`);assert.equal(recover(operation,fingerprint).outcome,'durable_authority_invalid');owner(`UPDATE saas.subscriptions SET status='active' WHERE store_id='${STORE}'`);});
  await check('current membership revocation denies replay and recovery before operation observation',()=>{owner(`UPDATE saas.memberships SET status='revoked' WHERE id='${MEMBERSHIP}'`);assert.equal(recover(operation,fingerprint).outcome,'membership_denied');assert.equal(save(input,operation).outcome,'membership_denied');owner(`UPDATE saas.memberships SET status='active' WHERE id='${MEMBERSHIP}'`);});
  await check('raw app writes and reads cannot bypass controlled functions',()=>{
   for(const role of ['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'])for(const table of ['merchant_content_bodies','merchant_content_versions'])for(const statement of [`SELECT * FROM saas.${table}`,`INSERT INTO saas.${table} DEFAULT VALUES`,`UPDATE saas.${table} SET version=version WHERE false`,`DELETE FROM saas.${table} WHERE false`]){const denied=sql(`SET ROLE ${role};${statement}`,DB,true);assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/,`${role} ${statement}`);}
   for(const call of [`saas.merchant_content_document('${STORE}','${doc.id}')`,`saas.merchant_content_snapshot('${STORE}','${doc.id}','${randomUUID()}','${PRINCIPAL}','typed')`,`saas.merchant_admin_save_before_content_bodies(${A()},'${randomUUID()}','${hash('bypass')}',NULL,NULL,'page','Bypass','{}'::jsonb,'draft')`,`saas.merchant_admin_archive_before_content_bodies(${A()},'${randomUUID()}','${hash('bypass archive')}','${doc.id}',${doc.version})`]){const denied=sql(`SET ROLE celebix_saas_app;SELECT * FROM ${call}`,DB,true);assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/);}
  });
  await check('public V1 keeps five-key DTO and authoritative empty/long body',()=>{const x=request(doc,body);x.values.published=true;x.values.status='active';assert.equal(save(x).outcome,'saved');doc=get(doc.id).payload;const publicResult=rpc(`saas.public_content_page_get('${HOST}','${NOW}','typed-page')`,'celebix_saas_host_resolver');assert.equal(publicResult.payload.body,body);assert.deepEqual(Object.keys(publicResult.payload).sort(),['body','id','slug','title','updatedAt']);});
  await check('recovery returns original immutable version after later publish and archive',()=>{const result=rpc(`saas.merchant_admin_archive(${A()},'${randomUUID()}','${hash('archive')}','${doc.id}',${doc.version})`);assert.equal(result.outcome,'archived');assert.equal(get(doc.id).payload.status,'archived');assert.deepEqual(recover(operation,fingerprint).payload,first.payload);assert.equal(rpc(`saas.public_content_page_get('${HOST}','${NOW}','typed-page')`,'celebix_saas_host_resolver').outcome,'not_found');});
  await check('historical duplicate published routes keep unchanged identity; new collisions fail',()=>{
   assert.equal(generic({record:id(3),version:1,config:{slug:'historic-duplicate',locale:'tr',body:'Updated legacy',published:true},status:'active'}).outcome,'saved');
   assert.equal(rpc(`saas.public_content_page_get('${HOST}','${NOW}','historic-duplicate')`,'celebix_saas_host_resolver').payload.id,id(4));
   const x=request();x.values.slug='historic-duplicate';x.values.published=true;x.values.status='active';assert.equal(save(x).outcome,'version_conflict');
  });
  await check('legacy non-sidecar and unrelated controlled writes preserve existing outcomes',()=>{
   assert.equal(generic({record:id(2),version:1,config:{body:'Still ordinary'}}).outcome,'saved');assert.equal(get(id(2)).payload.body,'Still ordinary');
   assert.equal(generic({record:id(6),version:1,kind:'general_setting',config:{storeDisplayName:'Unrelated update'}}).outcome,'saved');
  });
  await check('real repository recovers an uncertain committed save after a peer edit and archive',async()=>{
   const pool=new pg.Pool({host:socket,port,user:'postgres',database:DB,max:2});let firstDocument,mutations=0,lost=false;
   const controlledPool={async connect(){const client=await pool.connect();return {async query(text,values){const result=await client.query(text,values);if(text.includes('FROM saas.merchant_content_save')){mutations++;firstDocument=result.rows[0].result_payload;}if(text==='COMMIT'&&!lost&&firstDocument){lost=true;let current=get(firstDocument.id).payload;const edit=request(current,'<p>Later body</p>');edit.values.slug='uncertain-commit';edit.values.status='active';edit.values.published=true;assert.equal(save(edit).outcome,'saved');current=get(current.id).payload;assert.equal(rpc(`saas.merchant_admin_archive(${A()},'${randomUUID()}','${hash('uncertain-archive')}','${current.id}',${current.version})`).outcome,'archived');throw Error('FIXTURE_COMMIT_ACK_LOST');}return result;},release(destroy){client.release(destroy);}}}};
   const tenantContext={schemaVersion:1,requestId:'fixture',principal:{id:PRINCIPAL,issuer:'https://identity.example.test',subject:'content-owner'},store:{id:STORE,slug:'content-fixture',status:'active'},membership:{id:MEMBERSHIP,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:PLAN,planCode:'free_starter',version:1,status:'active',features:['catalog'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr'};
   try{const repo=new PostgresMerchantContentRepository({pool:controlledPool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:5000},audit(){}});const x=request();x.values.slug='uncertain-commit';const result=await repo.save({tenantContext,now:new Date(NOW),operationId:randomUUID(),request:x});assert.equal(result.replayed,true);assert.deepEqual(result.document,firstDocument);assert.equal(result.document.version,1);assert.equal(get(result.document.id).payload.status,'archived');assert.equal(mutations,1);const history=await repo.listVersions({tenantContext,now:new Date(NOW),kind:'page',recordId:result.document.id,limit:50});assert.deepEqual(history.map(v=>v.version),[3,2,1]);}finally{await pool.end();}
  });
  await check('typed versions include exact original legacy saved-event bodies',()=>{const result=rpc(`saas.merchant_content_versions(${A()},'page','${id(1)}',50,NULL)`);assert.equal(result.outcome,'listed');const items=result.payload.items;assert.ok(items.length>=5);assert.equal(items.at(-1).version,1);assert.equal(items.at(-1).values.body,'Short legacy');assert.equal(items[0].values.body,'');const page=rpc(`saas.merchant_content_versions(${A()},'page','${id(1)}',1,${items[0].version})`).payload.items;assert.equal(page.length,1);assert.equal(page[0].version,items[1].version);});
  await check('legacy archive reconstructs exact predecessor and missing history is explicit',()=>{
   assert.equal(rpc(`saas.merchant_admin_archive(${A()},'${randomUUID()}','${hash('legacy-archive')}','${id(2)}',2)`).outcome,'archived');
   const history=rpc(`saas.merchant_content_versions(${A()},'page','${id(2)}',50,NULL)`);assert.equal(history.outcome,'listed');assert.deepEqual(history.payload.items.map(v=>[v.version,v.status,v.values.body]),[[3,'archived','Still ordinary'],[2,'draft','Still ordinary'],[1,'draft','']]);
   owner(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('${id(80)}','${STORE}','page','Historical seed','{}','draft',1,'${NOW}','${NOW}')`);
   assert.equal(rpc(`saas.merchant_admin_archive(${A()},'${randomUUID()}','${hash('missing-history')}','${id(80)}',1)`).outcome,'archived');
   assert.equal(rpc(`saas.merchant_content_versions(${A()},'page','${id(80)}',50,NULL)`).outcome,'history_unavailable');
  });
  await check('genuine concurrent same-route publication admits only one document',async()=>{
   const clients=[new pg.Client({host:socket,port,user:'postgres',database:DB}),new pg.Client({host:socket,port,user:'postgres',database:DB})];
   try{await Promise.all(clients.map(c=>c.connect()));const results=await Promise.all(clients.map(async(c,i)=>{await c.query('BEGIN');await c.query('SET LOCAL ROLE celebix_saas_app');const x=request();x.values.slug='concurrent-public';x.values.published=true;x.values.status='active';const res=await c.query(`SELECT outcome,result_payload FROM saas.merchant_content_save(${A()},'${randomUUID()}','${hash('race'+i)}',${json(x)})`);await c.query('COMMIT');return res.rows[0].outcome;}));assert.deepEqual(results.sort(),['saved','version_conflict']);}finally{await Promise.all(clients.map(c=>c.end()));}
  });
  await check('genuine concurrent generic metadata versus typed replacement serializes one CAS winner',async()=>{
   const initial=save({...request(),values:{...request().values,slug:'cas-race'}}).payload;
   const clients=[new pg.Client({host:socket,port,user:'postgres',database:DB}),new pg.Client({host:socket,port,user:'postgres',database:DB})];
   try{await Promise.all(clients.map(c=>c.connect()));const x=request(initial,'<p>Replacement</p>');x.values.slug='cas-race';const calls=[`saas.merchant_content_save(${A()},'${randomUUID()}','${hash('typed-cas')}',${json(x)})`,`saas.merchant_admin_save(${A()},'${randomUUID()}','${hash('generic-cas')}','${initial.id}',1,'page','Metadata',${json({slug:'cas-race',locale:'tr',body:'',published:false})},'draft')`];const results=await Promise.all(clients.map(async(c,i)=>{await c.query('BEGIN');await c.query('SET LOCAL ROLE celebix_saas_app');const res=await c.query(`SELECT outcome FROM ${calls[i]}`);await c.query('COMMIT');return res.rows[0].outcome;}));assert.deepEqual(results.sort(),['saved','version_conflict']);const current=get(initial.id).payload;assert.equal(current.version,2);assert.ok(['<p>Typed body</p>','<p>Replacement</p>'].includes(current.body));}finally{await Promise.all(clients.map(c=>c.end()));}
  });
  await check('populated down/up preserves body, firewall, history and frozen product functions',()=>{const before=query('SELECT jsonb_agg(to_jsonb(v) ORDER BY record_id,version) FROM saas.merchant_content_versions v');apply(DOWN);assert.equal(get(doc.id).payload.body,body);const downLegacy=get(id(1)).payload;assert.equal(generic({record:downLegacy.id,version:downLegacy.version,config:{body:'Unseen overwrite'}}).outcome,'invalid_input');assert.equal(save(request()).outcome,'unavailable');apply(UP);assert.deepEqual(query('SELECT jsonb_agg(to_jsonb(v) ORDER BY record_id,version) FROM saas.merchant_content_versions v'),before);assert.deepEqual(query(`SELECT jsonb_object_agg(oid::text,jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text,'owner',proowner::regrole::text)) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND (proname LIKE 'content_authoring_%' OR proname LIKE 'catalog_%_with_origins' OR proname='public_starter_product_detail_v2')`),frozen);});
  console.log(`PASS native merchant content: ${count} scenarios`);
 }finally{if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);if(root)rmSync(root,{recursive:true,force:true});}
}
await main();
