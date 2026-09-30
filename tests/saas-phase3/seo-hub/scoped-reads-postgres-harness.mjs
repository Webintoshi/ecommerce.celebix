import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// Native, Unix-socket-only disposable cluster. Never reads a DSN or an existing database.
const ROOT=path.resolve(import.meta.dirname,'../../..'), SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202609300182_seo_scoped_reads.up.sql', DOWN=UP.replace('.up.','.down.');
const DB='seo_scoped_reads_fixture', NOW='2026-09-29T12:00:00.000Z';
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
  const files=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||[130,131,142,144,149,150,153,154,158,160,162,163,164,165,170,171,172,173,174,175,176,177,178,179,180,181].includes(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
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
const before=snapshot();
if(process.env.SEO_SCOPED_READS_SKIP_MIGRATION!=='1')apply(UP);
await check('public category read evaluates no unrelated product projections at store scale',()=>{
 sql('SELECT pg_stat_reset()');
 const started=performance.now(),result=publicCall('category',id(10));assert.equal(result.outcome,'found');
 const calls=Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`));
 console.log(`TIMING category-get ${Math.round(performance.now()-started)}ms product-projections=${calls}`);
 assert.equal(calls,0,'single category lookup must not project any of1700 unrelated products');
 assert.deepEqual(snapshot(),before,'migration and reads never mutate merchant data');
});
await check('single product read evaluates only selected product and retains tenant host isolation',()=>{
 sql('SELECT pg_stat_reset()');const started=performance.now();
 assert.equal(publicCall('product','b0000000-0000-4000-8000-000000000001').outcome,'found');
 const calls=Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`));
 console.log(`TIMING product-get ${Math.round(performance.now()-started)}ms product-projections=${calls}`);assert.ok(calls>=1&&calls<=2,`expected1 selected product projection, observed${calls}`);
 assert.equal(rpc(`saas.seo_public_get('foreign-fixture.example.test','${NOW}'::timestamptz,'category','${id(10)}')`,'celebix_saas_host_resolver').outcome,'not_found');
});
await check('category save and clear both metadata fields restores exact nullable fallback',()=>{
 const initial=publicCall('category',id(10)).payload.resource;
 const request={kind:'category',id:id(10),expectedVersion:initial.version,expectedSeoVersion:initial.seoVersion,title:'CETAŞ Altın Takı Koleksiyonu',description:null,canonicalPath:null,indexing:'inherit'};
 sql('SELECT pg_stat_reset()');const saved=mutate('resource',request);assert.equal(saved.outcome,'saved');
 const clear={...request,expectedVersion:saved.payload.resource.version,expectedSeoVersion:saved.payload.resource.seoVersion,title:null,description:null};
 const cleared=mutate('resource',clear);assert.equal(cleared.outcome,'saved');
 assert.equal(cleared.payload.resource.title,null);assert.equal(cleared.payload.resource.description,null);assert.equal(cleared.payload.resource.effectiveTitle,'CETAŞ');
 assert.equal(publicCall('category',id(10)).payload.resource.effectiveTitle,'CETAŞ');
 assert.equal(Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`)),0);
});
await check('overview projects each product once and remains under application timeout',()=>{
 sql('SELECT pg_stat_reset()');const started=performance.now(),overview=read();assert.equal(overview.outcome,'found');assert.equal(overview.payload.totalResources,1702);
 assert.equal(overview.payload.issues.filter(x=>x.code==='duplicate_description').length,2);
 assert.ok(overview.payload.issues.filter(x=>x.code==='duplicate_description').every(x=>x.kind==='product'&&x.fixHref.includes('resourceId=')));
 assert.equal(overview.payload.issues.some(x=>x.code==='duplicate_description'&&x.kind!=='product'),false,'empty fallback descriptions are not duplicate warnings');
 const calls=Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`));
 console.log(`TIMING overview ${Math.round(performance.now()-started)}ms product-projections=${calls}`);assert.equal(calls,1700,'overview must reuse a single resource materialization');
});
await check('check start snapshots publication once; leased single-resource read and finish stay scoped',()=>{
 sql('SELECT pg_stat_reset()');const started=performance.now(),run=mutate('check',{});assert.equal(run.outcome,'saved');assert.equal(run.payload.total,1704);
 assert.equal(Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`)),1700);
 console.log(`TIMING check-start ${Math.round(performance.now()-started)}ms`);
 const claimed=rpc(`saas.seo_worker_claim('${NOW}',25,'scoped-fixture')`,'celebix_saas_workflow');assert.equal(claimed.outcome,'claimed');
 const item=claimed.payload.checks.find(x=>x.kind==='category');assert.ok(item);
 sql('SELECT pg_stat_reset()');assert.equal(publicCall(item.kind,item.resourceId).outcome,'found');
 const finished=rpc(`saas.seo_worker_finish_check('${item.id}','${item.leaseId}','${NOW}',${json({error:null,issues:[]})})`,'celebix_saas_workflow');assert.equal(finished.outcome,'finished');
 assert.equal(Number(scalar(`SELECT coalesce(sum(calls),0) FROM pg_stat_user_functions WHERE funcname='public_effective_product_projection'`)),0);
});
await check('down/up retains merchant and SEO metadata; scoped helper remains private',()=>{
 const saved=snapshot();apply(DOWN);assert.deepEqual(snapshot(),saved);apply(UP);assert.deepEqual(snapshot(),saved);
 for(const role of ['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow'])assert.notEqual(sql(`SET ROLE ${role};SELECT * FROM saas.seo_resource_rows_scoped('${STORE}','${NOW}','category','${id(10)}')`,DB,true).status,0);
 assert.equal(publicCall('category',id(10)).payload.resource.effectiveTitle,'CETAŞ');
});
console.log('PASS native SEO scoped reads: '+count+' scenarios');
} finally {if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);if(root)rmSync(root,{recursive:true,force:true});}
