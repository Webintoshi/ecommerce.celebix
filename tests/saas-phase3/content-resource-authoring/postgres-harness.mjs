import {parseContentOutline} from '../../../packages/saas-contracts/src/content-resource-authoring/validation.ts';
import {PostgresContentResourceAuthoringRepository} from '../../../packages/saas-data/src/content-resource-authoring/repository.ts';
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
const UP='202609290175_content_resource_authoring.up.sql', DOWN=UP.replace('.up.','.down.');
const DB='content_resource_fixture';let NOW='2026-09-29T12:00:00.000Z';
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
async function check(name,run){NOW=new Date(Date.parse(NOW)+61000).toISOString();await run();console.log(`PASS ${++count} ${name}`);}
async function main(){
 try{
  root=mkdtempSync('/tmp/celebix-content-resource-');socket=path.join(root,'socket');data=path.join(root,'data');port=24000+Math.floor(Math.random()*10000);mkdirSync(socket,{mode:0o700});
  command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);
  sql(`CREATE DATABASE ${DB};`,'postgres');
  const files=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||[130,142,144,149,150,153,154,158,162,163,164,165,170,171,172,173,174].includes(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
  for(const file of files)apply(file);
  owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Content fixture','content-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${FOREIGN}','Foreign fixture','foreign-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test','content-owner','owner@example.test',true,'2026-01-01','2026-01-01'),('${id(20)}','https://identity.example.test','other-owner','other@example.test',true,'2026-01-01','2026-01-01');
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${id(21)}','${id(20)}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${id(70)}','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(71)}','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1)`);

  const CFG=id(999),fp='a'.repeat(64),source='b'.repeat(64),draftId=id(90),target={kind:'page',draftId,recordId:null,recordVersion:null};
  const sealed={algorithm:'A256GCM',ciphertext:'Y3JlZGVudGlhbA',iv:'MTIzNDU2Nzg5MDEy',keyId:'qa',tag:'MTIzNDU2Nzg5MDEyMzQ1Ng',version:1};
  assert.equal(rpc(`saas.toshi_provider_connect(${A()},'${randomUUID()}','${fp}','${CFG}','deepseek',${json(sealed)},'sha256:${fp}',1,'••••QA01','deepseek-flash','[{"id":"deepseek-flash","label":"Flash"}]'::jsonb,0)`).outcome,'connected');
  const existingProductOp=randomUUID();assert.equal(rpc(`saas.content_authoring_begin(${A()},'${existingProductOp}','${fp}','${draftId}',NULL,'${source}','${CFG}','deepseek','deepseek-flash',1,'v4')`).outcome,'pending');const productClaim=rpc(`saas.content_authoring_claim(${A()},'${existingProductOp}',1)`).payload;assert.equal(rpc(`saas.content_authoring_fail_v2(${A()},'${existingProductOp}','${productClaim.claimToken}',${productClaim.version},'invalid_output','dispatched','{"inputTokens":10,"outputTokens":2,"totalTokens":12}'::jsonb)`).outcome,'failed');const oldProductRow=query(`SELECT to_jsonb(o) FROM saas.content_authoring_operations o WHERE id='${existingProductOp}'`);
  const pins=()=>query(`SELECT jsonb_object_agg(oid::text,jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text,'owner',proowner::regrole::text)) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'content_authoring_%' AND proname NOT IN('content_authoring_begin_shared','content_authoring_shared_admission')`);
  const before=pins();if(existsSync(path.join(SQL,UP)))apply(UP);
  assert.notEqual(scalar("SELECT to_regprocedure('saas.content_resource_authoring_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)')::text"),'','resource RPC missing');
  const beginCall=(operation=randomUUID(),stage='outline',t=target,auth=A())=>`saas.content_resource_authoring_begin(${auth},'${operation}','${fp}','${source}',${json(t)},'${stage}','${CFG}','deepseek','deepseek-flash',1,'resource-v1')`;
  const begin=(operation=randomUUID(),stage='outline',t=target,auth=A())=>rpc(beginCall(operation,stage,t,auth));
  const claim=(g,auth=A())=>rpc(`saas.content_resource_authoring_claim(${auth},'${g.id}',${g.version})`);
  const fail=(g,usage=null,auth=A(),overrides={})=>rpc(`saas.content_resource_authoring_fail(${auth},'${g.id}',${lit(overrides.token===undefined?g.claimToken:overrides.token)}::uuid,${overrides.version??g.version},'${overrides.code??'invalid_output'}','${overrides.dispatch??g.dispatchState}',${usage===null?'NULL':json(usage)})`);
  const getGeneration=(operation,auth=A())=>rpc(`saas.content_resource_authoring_get(${auth},'${operation}')`);
  const outline={title:'Başlık',sections:[{heading:'Giriş',points:['Bilgi']}]};
  const output={sourceFingerprint:source,values:{body:'<p>Üretilen içerik</p>',seoTitle:'Başlık'},citations:[],suggestions:[]};
  const complete=(g,body=output,auth=A())=>rpc(`saas.content_resource_authoring_complete(${auth},'${g.id}','${g.claimToken}',${g.version},${g.stage==='outline'?json(outline):'NULL'},${g.stage==='draft'?json(body):'NULL'},NULL)`);
  const productCall=(operation=randomUUID(),auth=A())=>`saas.content_authoring_begin_shared(${auth},'${operation}','${fp}','${draftId}',NULL,'${source}','${CFG}','deepseek','deepseek-flash',1,'v4')`;
  await check('original Phase1 functions grants and known-usage row preserved byte-exact',()=>{assert.deepEqual(pins(),before);assert.deepEqual(query(`SELECT to_jsonb(o) FROM saas.content_authoring_operations o WHERE id='${existingProductOp}'`),oldProductRow);});
  await check('exact compact outline JSON byte boundary agrees with contract parser',()=>{
   const x={title:'T'.repeat(160),sections:Array.from({length:4},()=>({heading:'H'.repeat(200),points:Array(4).fill('P'.repeat(400))}))};
   for(const section of x.sections)for(let i=0;i<section.points.length&&Buffer.byteLength(JSON.stringify(x))<8192;i++)while(section.points[i].length<500&&Buffer.byteLength(JSON.stringify(x))<8192)section.points[i]+='x';
   assert.equal(Buffer.byteLength(JSON.stringify(x)),8192);assert.deepEqual(parseContentOutline(x),x);assert.equal(scalar(`SELECT saas.content_resource_outline_valid(${json(x)})`),'t');
  });
  await check('resource replay binds target, actor and stage without charging twice',()=>{const operation=randomUUID(),g=begin(operation);assert.equal(g.outcome,'pending');assert.equal(begin(operation).outcome,'existing-status');assert.equal(begin(operation,'draft').outcome,'operation_mismatch');assert.equal(getGeneration(operation,A(id(20),id(21))).outcome,'operation_not_found');assert.equal(fail(g.payload,null,A(),{code:'cancelled'}).outcome,'failed');});
  await check('outline and draft claimed invalid-output failures retain exact measured usage and terminal replay',()=>{for(const stage of ['outline','draft']){const g=claim(begin(randomUUID(),stage).payload).payload,measured={inputTokens:1440,outputTokens:354,totalTokens:1794};const failed=fail(g,measured);assert.equal(failed.outcome,'failed');assert.deepEqual(failed.payload.usage,measured);assert.deepEqual(fail(g,measured),failed);assert.equal(fail(g,null).outcome,'operation_mismatch');assert.equal(fail(g,{inputTokens:1,outputTokens:1,totalTokens:2}).outcome,'operation_mismatch');assert.equal(fail(g,measured,A(),{token:randomUUID()}).outcome,'version_conflict');}});
  await check('unknown usage and genuine zero remain distinct; wrong usage shape cannot mutate',()=>{for(const measured of [null,{inputTokens:0,outputTokens:0,totalTokens:0}]){const g=claim(begin().payload).payload;for(const bad of [{inputTokens:-1,outputTokens:1,totalTokens:0},{inputTokens:2147483647,outputTokens:1,totalTokens:2147483648},{inputTokens:'1',outputTokens:0,totalTokens:1},{inputTokens:0,outputTokens:0,totalTokens:0,extra:1}])assert.equal(fail(g,bad).outcome,'invalid_input');assert.equal(getGeneration(g.id).payload.status,'pending');assert.deepEqual(fail(g,measured).payload.usage,measured);}});
  await check('completed stages are mutually exclusive and source-bound',()=>{for(const stage of ['outline','draft']){const g=claim(begin(randomUUID(),stage).payload).payload;if(stage==='draft')assert.equal(complete(g,{...output,sourceFingerprint:'c'.repeat(64)}).outcome,'invalid_input');assert.equal(complete(g).outcome,'completed');assert.equal(getGeneration(g.id).payload.status,'completed');}});
  await check('content identifiers require current content record/version authority',()=>{const saved=save(request()).payload;for(const bad of [{...target,recordId:saved.id,recordVersion:saved.version+1},{...target,kind:'blog_post',recordId:saved.id,recordVersion:saved.version},{...target,recordId:randomUUID(),recordVersion:1}])assert.ok(['version_conflict','record_not_found'].includes(begin(randomUUID(),'draft',bad).outcome));});
  await check('product and content genuinely concurrent admission admits one active actor',async()=>{const clients=[new pg.Client({host:socket,port,user:'postgres',database:DB}),new pg.Client({host:socket,port,user:'postgres',database:DB})];try{await Promise.all(clients.map(c=>c.connect()));const calls=[productCall(),beginCall()];const outcomes=await Promise.all(clients.map(async(c,i)=>{await c.query('BEGIN');await c.query('SET LOCAL ROLE celebix_saas_app');const result=await c.query(`SELECT outcome FROM ${calls[i]}`);await c.query('COMMIT');return result.rows[0].outcome;}));assert.deepEqual(outcomes.sort(),['operation_busy','pending']);}finally{await Promise.all(clients.map(c=>c.end()));}});
  let applied,appliedGeneration;
  await check('draft generation binds once and normal save derives per-field AI origins atomically',()=>{
   const g=claim(begin(randomUUID(),'draft').payload).payload;assert.equal(complete(g).outcome,'completed');appliedGeneration=g;
   const req=request(null,output.values.body);req.values.seoTitle=output.values.seoTitle;req.origins={body:{state:'edited_ai',generationId:g.id},seoTitle:{state:'ai',generationId:g.id}};
   const saved=save(req);assert.equal(saved.outcome,'saved');applied=saved.payload;assert.equal(applied.origins.body.state,'ai');assert.equal(applied.origins.seoTitle.state,'ai');
   assert.equal(scalar(`SELECT bound_record_id FROM saas.content_resource_authoring_operations WHERE id='${g.id}'`),applied.id);
   const reused=save(req);assert.equal(reused.outcome,'invalid_input');
  });
  await check('manual edits retain lineage; explicit manual restore and reload preserve immutable history',()=>{
   const edited=request(applied,'<p>Edited by merchant</p>');edited.values.seoTitle=output.values.seoTitle;let saved=save(edited);assert.equal(saved.outcome,'saved');applied=saved.payload;assert.equal(applied.origins.body.state,'edited_ai');assert.equal(applied.origins.seoTitle.state,'ai');
   const restored=request(applied,'<p>Original manual text</p>');restored.origins={body:{state:'manual'}};restored.values.seoTitle=output.values.seoTitle;saved=save(restored);assert.equal(saved.outcome,'saved');applied=saved.payload;assert.equal(get(applied.id).payload.origins.body.state,'manual');
   assert.equal(scalar(`SELECT count(*) FROM saas.content_resource_origin_history WHERE record_id='${applied.id}' AND field='body'`),'3');
  });
  await check('cross-actor saves may retain persisted lineage but cannot import private generations',()=>{
   const retained=request(applied,applied.body);retained.values.seoTitle=output.values.seoTitle;const saved=save(retained,randomUUID(),A(id(20),id(21)));assert.equal(saved.outcome,'saved');applied=saved.payload;assert.equal(applied.origins.seoTitle.generationId,appliedGeneration.id);
   const g=claim(begin(randomUUID(),'draft').payload).payload;assert.equal(complete(g).outcome,'completed');const injected=request(applied,output.values.body);injected.origins={body:{state:'ai',generationId:g.id}};assert.equal(save(injected,randomUUID(),A(id(20),id(21))).outcome,'invalid_input');assert.equal(getGeneration(g.id,A(id(20),id(21))).outcome,'operation_not_found');
  });
  await check('existing record generation is version-fenced at claim and first application',()=>{
   const t={...target,recordId:applied.id,recordVersion:applied.version};const g=claim(begin(randomUUID(),'draft',t).payload).payload;assert.equal(complete(g).outcome,'completed');
   const edited=save(request(applied,applied.body));assert.equal(edited.outcome,'saved');applied=edited.payload;const stale=request(applied,output.values.body);stale.origins={body:{state:'ai',generationId:g.id}};assert.equal(save(stale).outcome,'invalid_input');
   const fresh={...t,recordVersion:applied.version};const pending=begin(randomUUID(),'draft',fresh).payload;applied=save(request(applied,applied.body)).payload;assert.equal(claim(pending).outcome,'version_conflict');assert.equal(fail(pending,null,A(),{code:'cancelled'}).outcome,'failed');
  });
  await check('failed origin insertion rolls back body version binding event and operation',()=>{
   const beforeDoc=get(applied.id).payload,beforeCount=scalar('SELECT count(*) FROM saas.merchant_admin_operations');const g=claim(begin(randomUUID(),'draft',{...target,recordId:applied.id,recordVersion:applied.version}).payload).payload;assert.equal(complete(g).outcome,'completed');
   owner("CREATE FUNCTION saas.fixture_resource_origin_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_origin_failure'; END $$;CREATE TRIGGER fixture_resource_origin_fail BEFORE INSERT ON saas.content_resource_origin_history FOR EACH ROW EXECUTE FUNCTION saas.fixture_resource_origin_fail()");
   const req=request(applied,output.values.body);req.origins={body:{state:'ai',generationId:g.id}};assert.throws(()=>save(req),/fixture_origin_failure/);const newGeneration=claim(begin(randomUUID(),'draft').payload).payload;assert.equal(complete(newGeneration).outcome,'completed');const createReq=request(null,output.values.body);createReq.origins={body:{state:'ai',generationId:newGeneration.id}};const recordsBefore=scalar('SELECT count(*) FROM saas.merchant_admin_records');assert.throws(()=>save(createReq),/fixture_origin_failure/);assert.equal(scalar(`SELECT bound_record_id IS NULL FROM saas.content_resource_authoring_operations WHERE id='${newGeneration.id}'`),'t');assert.equal(scalar('SELECT count(*) FROM saas.merchant_admin_records'),recordsBefore);owner('DROP TRIGGER fixture_resource_origin_fail ON saas.content_resource_origin_history;DROP FUNCTION saas.fixture_resource_origin_fail()');assert.deepEqual(get(applied.id).payload,beforeDoc);assert.equal(scalar('SELECT count(*) FROM saas.merchant_admin_operations'),beforeCount);
  });
  await check('usage and terminal state roll back atomically on injected failure',()=>{
   const g=claim(begin().payload).payload;owner("CREATE FUNCTION saas.fixture_resource_usage_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.usage IS NOT NULL THEN RAISE EXCEPTION 'fixture_usage_failure';END IF;RETURN NEW;END $$;CREATE TRIGGER fixture_resource_usage_fail BEFORE UPDATE ON saas.content_resource_authoring_operations FOR EACH ROW EXECUTE FUNCTION saas.fixture_resource_usage_fail()");
   assert.throws(()=>fail(g,{inputTokens:1,outputTokens:1,totalTokens:2}),/fixture_usage_failure/);owner('DROP TRIGGER fixture_resource_usage_fail ON saas.content_resource_authoring_operations;DROP FUNCTION saas.fixture_resource_usage_fail()');const still=getGeneration(g.id).payload;assert.equal(still.status,'pending');assert.equal(still.version,g.version);assert.equal(still.usage,null);assert.equal(fail(g,null).outcome,'failed');
  });
  await check('current membership and plan authority precede replay and failure observations',()=>{
   const g=claim(begin().payload).payload;owner(`UPDATE saas.memberships SET status='revoked' WHERE id='${MEMBERSHIP}'`);assert.equal(getGeneration(g.id).outcome,'membership_denied');assert.equal(fail(g,{inputTokens:1,outputTokens:1,totalTokens:2}).outcome,'membership_denied');owner(`UPDATE saas.memberships SET status='active' WHERE id='${MEMBERSHIP}'`);
   owner(`UPDATE saas.subscriptions SET status='inactive' WHERE store_id='${STORE}'`);assert.notEqual(getGeneration(g.id).outcome,'found');owner(`UPDATE saas.subscriptions SET status='active' WHERE store_id='${STORE}'`);assert.equal(fail(g,null).outcome,'failed');
  });
  await check('shared six per minute counts both domains and replay never adds a charge',()=>{
   const operations=[];for(let i=0;i<6;i++){const operation=randomUUID();operations.push(operation);if(i%2===0){const result=rpc(productCall(operation));assert.equal(result.outcome,'pending');assert.equal(rpc(productCall(operation)).outcome,'existing-status');assert.equal(rpc(`saas.content_authoring_fail(${A()},'${operation}',NULL,1,'cancelled','not_dispatched')`).outcome,'failed');}else{const result=begin(operation);assert.equal(result.outcome,'pending');assert.equal(begin(operation).outcome,'existing-status');assert.equal(fail(result.payload,null,A(),{code:'cancelled'}).outcome,'failed');}}
   assert.equal(begin().outcome,'rate_limited');assert.equal(rpc(productCall()).outcome,'rate_limited');assert.equal(scalar(`SELECT (SELECT count(*) FROM saas.content_authoring_operations WHERE id=ANY(ARRAY[${operations.map(lit).join(',')}]::uuid[]))+(SELECT count(*) FROM saas.content_resource_authoring_operations WHERE id=ANY(ARRAY[${operations.map(lit).join(',')}]::uuid[]))`),'6');
  });
  await check('shared configured daily allowance includes uncertain dispatch and UTC reset',()=>{
   const g=claim(begin().payload).payload;assert.equal(fail(g,null,A(),{code:'provider_timeout',dispatch:'unknown'}).outcome,'failed');const n=Number(scalar(`SELECT (SELECT count(*) FROM saas.content_authoring_operations WHERE store_id='${STORE}')+(SELECT count(*) FROM saas.content_resource_authoring_operations WHERE store_id='${STORE}')`));assert.equal(rpc(`saas.content_authoring_set_daily_limit(${A()},${n})`).outcome,'updated');assert.equal(begin().outcome,'quota_exceeded');assert.equal(rpc(productCall()).outcome,'quota_exceeded');assert.equal(begin(g.id).outcome,'existing-status');
   NOW=new Date(Date.parse(NOW)+86400000).toISOString();const next=begin();assert.equal(next.outcome,'pending');assert.equal(fail(next.payload,null,A(),{code:'cancelled'}).outcome,'failed');assert.equal(rpc(`saas.content_authoring_set_daily_limit(${A()},100)`).outcome,'updated');
  });
  await check('expired dispatched generation stays unknown and cannot receive a replacement claim',()=>{
   const g=claim(begin().payload).payload;NOW=new Date(Date.parse(NOW)+61000).toISOString();const expired=getGeneration(g.id);assert.equal(expired.payload.status,'unknown');assert.equal(claim(g).outcome,'version_conflict');assert.equal(begin(g.id).outcome,'existing-status');assert.equal(getGeneration(g.id).payload.claimToken,g.claimToken);
  });
  await check('raw tables helpers and immutable history cannot bypass authority',()=>{
   for(const role of ['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'])for(const table of ['content_resource_authoring_operations','content_resource_origin_history'])for(const statement of [`SELECT * FROM saas.${table}`,`INSERT INTO saas.${table} DEFAULT VALUES`,`DELETE FROM saas.${table} WHERE false`]){const denied=sql(`SET ROLE ${role};${statement}`,DB,true);assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/);}
   for(const fn of [`saas.content_authoring_shared_admission('${STORE}','${PRINCIPAL}','${NOW}')`,`saas.content_resource_authoring_transition(${A()},'get','${appliedGeneration.id}',NULL,NULL,'{}'::jsonb)`])assert.match(sql(`SET ROLE celebix_saas_app;SELECT * FROM ${fn}`,DB,true).stderr,/permission denied/);
   assert.match(sql(`SET ROLE celebix_saas_owner;UPDATE saas.content_resource_origin_history SET origin='manual' WHERE record_id='${applied.id}'`,DB,true).stderr,/content_resource_history_immutable/);
  });
  await check('generic metadata and archive retain history and immutable exact saved snapshots',()=>{
   let current=get(applied.id).payload;const result=generic({record:current.id,version:current.version,name:'Legacy metadata edit',config:{slug:current.slug,locale:current.locale,body:'',published:false}});assert.equal(result.outcome,'saved');current=get(current.id).payload;assert.equal(current.origins.seoTitle.generationId,appliedGeneration.id);
   assert.equal(rpc(`saas.merchant_admin_archive(${A()},'${randomUUID()}','${fp}','${current.id}',${current.version})`).outcome,'archived');assert.equal(get(current.id).payload.status,'archived');assert.equal(begin(randomUUID(),'draft',{...target,recordId:current.id,recordVersion:current.version+1}).outcome,'invalid_transition');
   assert.equal(scalar(`SELECT count(*) FROM saas.content_resource_origin_history WHERE record_id='${current.id}' AND record_version=${current.version+1}`),'2');
  });
  await check('real committed begin with lost acknowledgement is observable once and never retried',async()=>{
   const pool=new pg.Pool({host:socket,port,user:'postgres',database:DB,max:2}),operation=randomUUID();let lost=true,beginCalls=0;
   const wrapped={async connect(){const client=await pool.connect();return {async query(text,values){if(text.includes('saas.content_resource_authoring_begin'))beginCalls++;const result=await client.query(text,values);if(text==='COMMIT'&&lost){lost=false;throw Error('synthetic_lost_ack');}return result;},release(destroy){client.release(destroy);}};}};
   const tenantContext={schemaVersion:1,requestId:'native-content-resource',principal:{id:PRINCIPAL,issuer:'https://identity.example.test',subject:'content-owner'},store:{id:STORE,slug:'content-fixture',status:'active'},membership:{id:MEMBERSHIP,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:PLAN,planCode:'free_starter',version:1,status:'active',features:['catalog'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr'};
   try{const repo=new PostgresContentResourceAuthoringRepository({pool:wrapped,role:'celebix_saas_app',timeouts:{poolCheckoutMs:1000,statementMs:1000,lockMs:500,idleTransactionMs:2000},audit(){}});await assert.rejects(repo.beginGeneration({tenantContext,now:new Date(NOW),operationId:operation,requestFingerprint:fp,sourceFingerprint:source,target,stage:'outline',providerBinding:{configId:CFG,provider:'deepseek',model:'deepseek-flash',credentialVersion:1,promptVersion:'resource-v1'}}),{code:'commit_unknown'});assert.equal(beginCalls,1);const observed=await repo.getGeneration({tenantContext,now:new Date(NOW),operationId:operation});assert.equal(observed.status,'pending');assert.equal(fail(observed,null,A(),{code:'cancelled'}).outcome,'failed');}finally{await pool.end();}
  });
  await check('content authority rejects actual product IDs and malformed target JSON without reservation',()=>{
   const product=randomUUID(),ca=A().replace(`,1,'${NOW}'`,`,1,100,'${NOW}'`);const created=rpc(`saas.catalog_create_product(${ca},'${randomUUID()}','${fp}','${product}','${randomUUID()}','resource-authority-product','Product',NULL,'draft','TRY','Standart',NULL,NULL,10000,NULL,NULL,false,0,'{}'::jsonb)`);assert.equal(created.outcome,'created');
   assert.equal(begin(randomUUID(),'draft',{...target,recordId:product,recordVersion:1}).outcome,'record_not_found');
   const beforeN=scalar('SELECT count(*) FROM saas.content_resource_authoring_operations');for(const t of [null,[],{}, {...target,recordVersion:1},{...target,recordId:product},{...target,kind:'product'},{...target,extra:1},{...target,draftId:null}])assert.equal(begin(randomUUID(),'outline',t).outcome,'invalid_input');assert.equal(scalar('SELECT count(*) FROM saas.content_resource_authoring_operations'),beforeN);
  });
  await check('analyst cashier and wrong-store authority cannot observe or reserve operations',()=>{
   for(const role of ['analyst','cashier']){owner(`UPDATE saas.memberships SET role='${role}' WHERE id='${id(21)}'`);assert.equal(begin(randomUUID(),'outline',target,A(id(20),id(21))).outcome,'membership_denied');assert.equal(getGeneration(appliedGeneration.id,A(id(20),id(21))).outcome,'membership_denied');}owner(`UPDATE saas.memberships SET role='store_owner' WHERE id='${id(21)}'`);assert.notEqual(getGeneration(appliedGeneration.id,A(PRINCIPAL,MEMBERSHIP,FOREIGN)).outcome,'found');
  });
  await check('claim revalidates provider revocation and credential version before dispatch',()=>{
   const pending=begin().payload;owner(`UPDATE saas.toshi_provider_configs SET status='revoked',revoked_at='${NOW}',is_default=false WHERE id='${CFG}'`);assert.equal(claim(pending).outcome,'connection_revoked');owner(`UPDATE saas.toshi_provider_configs SET status='active',revoked_at=NULL,is_default=true,credential_version=2 WHERE id='${CFG}'`);assert.equal(claim(pending).outcome,'credential_invalid');owner(`UPDATE saas.toshi_provider_configs SET credential_version=1 WHERE id='${CFG}'`);const claimed=claim(pending).payload;assert.equal(claim(claimed).outcome,'dispatch_already_claimed');assert.equal(fail(claimed,null,A(),{version:1}).outcome,'version_conflict');assert.equal(fail(claimed,null).outcome,'failed');
  });
  await check('all remaining metadata origins are hashed and generic name edits retain edited lineage',()=>{
   const g=claim(begin(randomUUID(),'draft').payload).payload;const body={...output,values:{name:'Generated heading',excerpt:'Generated excerpt',seoDescription:'Generated SEO summary'}};assert.equal(complete(g,body).outcome,'completed');const req=request();req.values={...req.values,...body.values,slug:'metadata-origins'};req.origins=Object.fromEntries(Object.keys(body.values).map(field=>[field,{state:'ai',generationId:g.id}]));const result=save(req);assert.equal(result.outcome,'saved');const d=result.payload;for(const field of Object.keys(body.values))assert.equal(d.origins[field].state,'ai');
   assert.equal(generic({record:d.id,version:d.version,name:'Changed generic heading',config:{slug:d.slug,locale:d.locale,body:'',published:false}}).outcome,'saved');const changed=get(d.id).payload;assert.equal(changed.origins.name.state,'edited_ai');assert.equal(changed.origins.excerpt.state,'ai');assert.equal(changed.origins.seoDescription.state,'ai');
   assert.match(sql(`SET ROLE celebix_saas_owner;UPDATE saas.content_resource_authoring_operations SET bound_record_id='${applied.id}' WHERE id='${g.id}'`,DB,true).stderr,/content_resource_binding_immutable/);
  });
  await check('populated downgrade preserves all audit bytes and shared product admission; up restores resource writer',()=>{
   const rows=()=>query(`SELECT jsonb_build_object('operations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM saas.content_resource_authoring_operations o),'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM saas.content_resource_origin_history h),'versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY record_id,version) FROM saas.merchant_content_versions v))`);const beforeRows=rows();apply(DOWN);assert.equal(begin().outcome,'unavailable');assert.equal(claim(appliedGeneration).outcome,'unavailable');assert.deepEqual(rows(),beforeRows);assert.equal(getGeneration(appliedGeneration.id).payload.status,'completed');apply(UP);assert.deepEqual(rows(),beforeRows);assert.deepEqual(pins(),before);assert.deepEqual(query(`SELECT to_jsonb(o) FROM saas.content_authoring_operations o WHERE id='${existingProductOp}'`),oldProductRow);const created=begin();assert.equal(created.outcome,'pending');assert.equal(fail(created.payload,null,A(),{code:'cancelled'}).outcome,'failed');
  });
  await check('absent setting enforces exactly100 combined UTC-day attempts',()=>{
   owner(`DELETE FROM saas.content_authoring_settings WHERE store_id='${STORE}'`);
   const used=()=>Number(scalar(`SELECT count(*) FROM (SELECT created_at FROM saas.content_authoring_operations WHERE store_id='${STORE}' UNION ALL SELECT created_at FROM saas.content_resource_authoring_operations WHERE store_id='${STORE}') q WHERE created_at>=date_trunc('day','${NOW}'::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`));
   for(let n=used();n<100;n++){NOW=new Date(Date.parse(NOW)+61000).toISOString();if(n%2===0){const op=randomUUID();assert.equal(rpc(productCall(op)).outcome,'pending');assert.equal(rpc(`saas.content_authoring_fail(${A()},'${op}',NULL,1,'cancelled','not_dispatched')`).outcome,'failed');}else{const g=begin();assert.equal(g.outcome,'pending');assert.equal(fail(g.payload,null,A(),{code:'cancelled'}).outcome,'failed');}}
   NOW=new Date(Date.parse(NOW)+61000).toISOString();assert.equal(used(),100);assert.equal(begin().outcome,'quota_exceeded');assert.equal(rpc(productCall()).outcome,'quota_exceeded');
  });
  console.log(`PASS native content resource: ${count} scenarios`);
 }finally{if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);if(root)rmSync(root,{recursive:true,force:true});}
}
await main();
