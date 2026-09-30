import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// Native, Unix-socket-only disposable cluster. Never reads a DSN or an existing database.
const ROOT=path.resolve(import.meta.dirname,'../../..'), SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202609300183_seo_overview_findings.up.sql', DOWN=UP.replace('.up.','.down.');
const DB='seo_overview_findings_fixture', NOW='2026-09-29T12:00:00.000Z';
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

function read(action='overview',request={}) { return rpc(`saas.seo_admin_read(${A()},${lit(action)},${json(request)})`); }
function mutate(action,request,operation=randomUUID(),authority=A(),fingerprint=hash(JSON.stringify({action,request}))) {return rpc(`saas.seo_admin_mutate(${authority},'${operation}','${fingerprint}',${lit(action)},${json(request)})`);}
async function check(name,run){await run();console.log(`PASS ${++count} ${name}`);}
try {
  root=mkdtempSync('/tmp/celebix-merchant-content-');socket=path.join(root,'socket');data=path.join(root,'data');port=24000+Math.floor(Math.random()*10000);mkdirSync(socket,{mode:0o700});
  command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h '' -c track_functions=all`,'-l',path.join(root,'postgres.log'),'start']);
  sql(`CREATE DATABASE ${DB};`,'postgres');
  const files=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||[130,131,142,144,149,150,153,154,158,160,162,163,164,165,170,171,172,173,174,175,176,177,178,179,180,181,182].includes(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
  for(const file of files)apply(file);
  owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Content fixture','content-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${FOREIGN}','Foreign fixture','foreign-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test','content-owner','owner@example.test',true,'2026-01-01','2026-01-01'),('${id(20)}','https://identity.example.test','other-owner','other@example.test',true,'2026-01-01','2026-01-01');
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${id(21)}','${id(20)}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${id(70)}','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(71)}','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1)`);


const publicCall=(kind,rid)=>rpc(`saas.seo_public_get('${HOST}','${NOW}'::timestamptz,'${kind}','${rid}')`,'celebix_saas_host_resolver');
owner(`ALTER TABLE saas.products DISABLE TRIGGER seo_resource_notification;
 ALTER TABLE saas.product_variants DISABLE TRIGGER seo_resource_notification;
 ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
 SELECT ('b0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${STORE}','product-'||n,'Product '||n,'active','TRY','2026-01-01','2026-01-01' FROM generate_series(1,1700) n;
 INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
 SELECT ('c0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('b0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${STORE}','One',100,false,0,'active','2026-01-01','2026-01-01' FROM generate_series(1,1700) n;
 ALTER TABLE saas.catalog_product_profiles DISABLE TRIGGER seo_resource_notification;
 INSERT INTO saas.catalog_product_profiles(product_id,store_id,product_type,seo_title,seo_description,version,created_at,updated_at) SELECT id,store_id,'physical',title,CASE WHEN slug IN('product-1','product-2') THEN 'Shared description' ELSE 'Description '||slug END,1,'2026-01-01','2026-01-01' FROM saas.products WHERE store_id='${STORE}';
 ALTER TABLE saas.catalog_product_profiles ENABLE TRIGGER seo_resource_notification;
 ALTER TABLE saas.products ENABLE TRIGGER seo_resource_notification;
 ALTER TABLE saas.product_variants ENABLE TRIGGER seo_resource_notification;
 ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
 INSERT INTO saas.catalog_categories(id,store_id,name,slug,status,created_at,updated_at) VALUES('${id(10)}','${STORE}','CETAŞ','cetas','active','2026-01-01','2026-01-01');
 INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES('${id(1)}','${STORE}','page','Source','{"slug":"source","published":true}','active','2026-01-01','2026-01-01');`);
const snapshot=()=>query(`SELECT jsonb_build_object('products',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM saas.products p),'records',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM saas.merchant_admin_records r),'categories',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM saas.catalog_categories c),'options',(SELECT jsonb_agg(to_jsonb(o) ORDER BY resource_id) FROM saas.seo_resource_options o))`);

owner(`ALTER TABLE saas.catalog_product_profiles DISABLE TRIGGER seo_resource_notification;
 UPDATE saas.catalog_product_profiles SET seo_title=NULL,seo_description=NULL WHERE store_id='${STORE}';
 ALTER TABLE saas.catalog_product_profiles ENABLE TRIGGER seo_resource_notification;
 INSERT INTO saas.seo_resource_options(store_id,kind,resource_id,version,canonical_path,indexing,updated_at) VALUES('${STORE}','page','${id(1)}',1,'/pages/deleted-target','inherit','${NOW}');
 INSERT INTO saas.seo_links(id,store_id,version,source_kind,source_id,target_kind,target_id,anchor_text,enabled,updated_at) VALUES
 ('${id(101)}','${STORE}',1,'category','${id(10)}','page','${id(90)}','Missing target',true,'${NOW}'),
 ('${id(102)}','${STORE}',1,'page','${id(91)}','category','${id(10)}','Missing source',true,'${NOW}'),
 ('${id(103)}','${STORE}',1,'category','${id(10)}','page','${id(92)}','Disabled missing target',false,'${NOW}');
 INSERT INTO saas.seo_check_runs(id,store_id,total,checked,status,created_at,last_checked_at) VALUES('${id(110)}','${STORE}',1,1,'failed','${NOW}','${NOW}');
 INSERT INTO saas.seo_check_urls(id,run_id,store_id,hostname,path,kind,resource_id,status,error,checked_at) VALUES('${id(111)}','${id(110)}','${STORE}','${HOST}','/urun/product-1','product','b0000000-0000-4000-8000-000000000001','failed','transport_unavailable','${NOW}')`);
const fullSnapshot=()=>query(`SELECT jsonb_build_object('merchant',${json(snapshot())},'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM saas.seo_links l),'runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM saas.seo_check_runs r),'urls',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM saas.seo_check_urls u))`);
const saved=fullSnapshot();
sql('SELECT pg_stat_reset()');read();
const baselineProjectionCalls=Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`));
if(process.env.SEO_OVERVIEW_FINDINGS_SKIP_MIGRATION!=='1')apply(UP);
await check('over200 metadata warnings retain global, canonical, broken links and live failure findings at1700-resource scale',()=>{
 sql('SELECT pg_stat_reset()');const started=performance.now(),overview=read();assert.equal(overview.outcome,'found');
 const issues=overview.payload.issues;assert.equal(issues.length,200);
 assert.ok(issues.some(x=>x.code==='invalid_canonical'&&x.resourceId===id(1)),'invalid canonical must survive warning cap');
 assert.ok(issues.some(x=>x.code==='indexing_disabled'),'global indexing finding must survive warning cap');
 assert.equal(issues.filter(x=>x.code==='broken_link').length,2,'enabled missing source/target links only');
 assert.ok(issues.filter(x=>x.code==='broken_link').every(x=>x.fixHref==='/seo?tab=links'));
 const failure=issues.find(x=>x.code==='live_check_failed');assert.ok(failure,'empty-issues transport failure must be visible');
 assert.equal(failure.path,'/urun/product-1');assert.equal(failure.resourceId,'b0000000-0000-4000-8000-000000000001');assert.equal(failure.severity,'error');
 assert.ok(failure.fixHref.includes('resourceId='));assert.equal(failure.message.includes('transport_unavailable'),false,'merchant message must not expose internal error code');
 const firstMissing=issues.findIndex(x=>x.code==='missing_title'||x.code==='missing_description');assert.ok(firstMissing>0);
 assert.ok(issues.filter(x=>x.severity==='error').every(x=>issues.indexOf(x)<firstMissing));
 const elapsed=Math.round(performance.now()-started),calls=Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`));
 console.log(`TIMING prioritized-overview ${elapsed}ms product-projections=${calls}`);assert.ok(elapsed<5000);assert.ok(calls<=baselineProjectionCalls,`new findings must not add catalog projection passes: baseline${baselineProjectionCalls}, observed${calls}`);
 assert.deepEqual(fullSnapshot(),saved);apply(DOWN);assert.deepEqual(fullSnapshot(),saved);apply(UP);assert.deepEqual(fullSnapshot(),saved);
 assert.equal(read().payload.issues.filter(x=>x.code==='broken_link').length,2);
});
await check('orphan source and target links remain visible, tenant-owned cleanup keeps versions and operation recovery',()=>{
 const links=read('links').payload.items;assert.equal(links.length,3,'all orphan rows must be visible');
 const missingSource=links.find(x=>x.id===id(102)),missingTarget=links.find(x=>x.id===id(101));
 assert.equal(missingSource.sourcePath,'Kaynak içerik bulunamadı');assert.equal(missingTarget.targetPath,'Hedef içerik bulunamadı');
 const request=(link,change={})=>({id:link.id,expectedVersion:link.version,sourceKind:link.sourceKind,sourceId:link.sourceId,targetKind:link.targetKind,targetId:link.targetId,anchorText:link.anchorText,enabled:link.enabled,...change});
 owner(`INSERT INTO saas.seo_links(id,store_id,version,source_kind,source_id,target_kind,target_id,anchor_text,enabled,updated_at) VALUES('${id(120)}','${FOREIGN}',1,'category','${id(10)}','page','${id(1)}','Foreign link',true,'${NOW}');
 INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES('${id(93)}','${STORE}','page','Draft target','{"slug":"draft-target","published":false}','draft','${NOW}','${NOW}')`);
 const foreignOperation=randomUUID();assert.equal(mutate('link',{...request(missingTarget),id:id(120),remove:true},foreignOperation).outcome,'record_not_found');assert.equal(scalar(`SELECT version FROM saas.seo_links WHERE id='${id(120)}'`),'1');assert.equal(scalar(`SELECT count(*) FROM saas.seo_operations WHERE operation_id='${foreignOperation}'`),'0');
 assert.equal(mutate('link',request(missingSource,{expectedVersion:0,enabled:false})).outcome,'version_conflict');
 const disabledRequest=request(missingSource,{enabled:false}),disabledOperation=randomUUID(),disabled=mutate('link',disabledRequest,disabledOperation);assert.equal(disabled.outcome,'saved');assert.equal(disabled.payload.link.enabled,false);assert.equal(disabled.payload.link.version,2);
 assert.equal(mutate('link',disabledRequest,disabledOperation).outcome,'operation_replayed');assert.equal(mutate('link',disabledRequest).outcome,'version_conflict');
 assert.equal(mutate('link',request(disabled.payload.link,{enabled:true})).outcome,'record_not_found');
 assert.equal(mutate('link',request(disabled.payload.link,{anchorText:'Changed orphan text'})).outcome,'record_not_found','only cleanup may bypass publication validation');
 assert.equal(mutate('link',{...request(missingTarget),id:null,expectedVersion:null,enabled:false}).outcome,'record_not_found','new orphan links must never be created');
 assert.equal(mutate('link',{...request(missingTarget),id:null,expectedVersion:null,targetId:id(93)}).outcome,'record_not_found','draft target must never be enabled');
 const valid=mutate('link',{...request(missingTarget),id:null,expectedVersion:null,targetId:id(1)});assert.equal(valid.outcome,'saved','published same-store source and target still work');
 for(const link of [missingTarget,disabled.payload.link]){const operation=randomUUID(),removal=request(link,{remove:true});assert.equal(mutate('link',removal,operation).outcome,'saved');assert.equal(mutate('link',removal,operation).outcome,'operation_replayed');assert.equal(scalar(`SELECT count(*) FROM saas.seo_links WHERE id='${link.id}'`),'0');}
 assert.equal(read().payload.issues.filter(x=>x.code==='broken_link').length,0);
 const after=fullSnapshot();apply(DOWN);assert.deepEqual(fullSnapshot(),after);apply(UP);assert.deepEqual(fullSnapshot(),after);
});
console.log('PASS native SEO overview findings: '+count+' scenarios');
} finally {if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);if(root)rmSync(root,{recursive:true,force:true});}
