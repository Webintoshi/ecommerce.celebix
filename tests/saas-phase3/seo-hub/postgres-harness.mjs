import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {PostgresSeoRepository,PostgresPublicSeoRepository,PostgresSeoWorkerRepository} from '../../../packages/saas-data/src/seo/repository.ts';
// Native, Unix-socket-only disposable cluster. Never reads a DSN or an existing database.
const ROOT=path.resolve(import.meta.dirname,'../../..'), SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202609300180_seo_hub.up.sql', DOWN=UP.replace('.up.','.down.');
const DB='seo_hub_fixture', NOW='2026-09-29T12:00:00.000Z';
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
  command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);
  sql(`CREATE DATABASE ${DB};`,'postgres');
  const files=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||[130,131,142,144,149,150,153,154,158,160,162,163,164,165,170,171,172,173,174,175,176,177,178,179].includes(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
  for(const file of files)apply(file);
  owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Content fixture','content-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${FOREIGN}','Foreign fixture','foreign-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test','content-owner','owner@example.test',true,'2026-01-01','2026-01-01'),('${id(20)}','https://identity.example.test','other-owner','other@example.test',true,'2026-01-01','2026-01-01');
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${id(21)}','${id(20)}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${id(70)}','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(71)}','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1)`);

const publicCall=(name,extra='',host=HOST)=>rpc(`saas.${name}('${host}','${NOW}'::timestamptz${extra})`,'celebix_saas_host_resolver');
const claim=(when=NOW)=>rpc(`saas.seo_worker_claim('${when}'::timestamptz,25,'test-worker')`,'celebix_saas_workflow');
const resources=()=>read('resources',{kind:null,query:null,missing:false,cursor:null,limit:100}).payload.items;
const getResource=(kind,resourceId)=>resources().find(r=>r.kind===kind&&r.id===resourceId);
const saveRequest=(kind,resourceId)=>{const r=getResource(kind,resourceId);return{kind,id:resourceId,expectedVersion:r.version,expectedSeoVersion:r.seoVersion,title:'Saved SEO '+kind,description:'Saved description',canonicalPath:null,indexing:'inherit'};};
const longBody='<p>'+'ğ'.repeat(39996)+'x</p>';assert.equal(Buffer.byteLength(longBody),80000);
const settingsRequest={expectedVersion:0,metaTitle:'Store title',metaDescription:'Store description',allowIndex:true,socialTitle:null,socialDescription:null,socialAssetId:null,googleVerification:'google_token',bingVerification:'bing_token',indexNowEnabled:true};
owner(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
 ('${id(1)}','${STORE}','page','About','{"slug":"about","locale":"tr","published":true,"body":"<p>Legacy body</p>","unrelated":"preserve"}','active',1,'2026-01-01','2026-01-01'),
 ('${id(2)}','${STORE}','blog_post','Draft','{"slug":"draft","published":false,"body":"Secret draft"}','draft',1,'2026-01-01','2026-01-01'),
 ('${id(3)}','${STORE}','blog_post','News','{"slug":"news","locale":"tr","published":true}','active',1,'2026-01-01','2026-01-01'),
 ('${id(4)}','${FOREIGN}','page','Foreign','{"slug":"foreign","published":true}','active',1,'2026-01-01','2026-01-01'),
 ('${id(5)}','${STORE}','seo_control','Legacy SEO','{"allowIndex":true,"metaTitle":"Retained legacy"}','active',1,'2026-01-01','2026-01-01');
 INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description) VALUES('${STORE}','${id(3)}',1,${lit(longBody)},'normalized_html','{"body":{"state":"manual"}}','Native excerpt','Original title','Original description');
 INSERT INTO saas.catalog_categories(id,store_id,name,slug,status,created_at,updated_at) VALUES('${id(10)}','${STORE}','Jewelry','jewelry','active','2026-01-01','2026-01-01');
 INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,created_at,updated_at) VALUES('${id(11)}','${STORE}','ring','Ring','Native description','active','TRY','2026-01-01','2026-01-01');
 ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
 INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${id(12)}','${id(11)}','${STORE}','One',100,false,0,'active','2026-01-01','2026-01-01');
 ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;`);
owner(`INSERT INTO saas.catalog_product_profiles(product_id,store_id,product_type,seo_title,seo_description,version,created_at,updated_at) VALUES('${id(11)}','${STORE}','physical','Native product title',NULL,1,'2026-01-01','2026-01-01');
 INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES
 ('${id(40)}','${STORE}','seo_product_entry','Legacy product',${json({resourceId:id(11),metaTitle:'Legacy product title',metaDescription:'Legacy product description',canonicalPath:'/urun/ring'})},'active','2026-01-01','2026-01-01'),
 ('${id(41)}','${STORE}','seo_page_entry','Legacy page',${json({resourceId:id(1),metaTitle:'Legacy about title'})},'active','2026-01-01','2026-01-01'),
 ('${id(42)}','${STORE}','seo_content_entry','Legacy article',${json({resourceId:id(3),metaTitle:'Legacy article title',metaDescription:'Original description',canonicalPath:'/blog/news',indexing:'noindex'})},'active','2026-01-01','2026-01-01'),
 ('${id(43)}','${STORE}','seo_internal_link','Legacy related',${json({sourcePath:'/blog/news',targetPath:'/kategori/jewelry',anchorText:'Legacy jewelry link',enabled:true})},'active','2026-01-01','2026-01-01'),
 ('${id(44)}','${STORE}','seo_page_entry','Legacy draft',${json({resourceId:id(1),metaTitle:'Inactive legacy'})},'draft','2026-01-01','2026-01-01'),
 ('${id(45)}','${STORE}','seo_page_entry','Active referring to draft',${json({resourceId:id(2),metaTitle:'Never apply to draft'})},'active','2026-01-01','2026-01-01'),
 ('${id(46)}','${STORE}','seo_internal_link','Foreign link',${json({sourcePath:'/pages/about',targetPath:'/pages/foreign',anchorText:'Forbidden',enabled:true})},'active','2026-01-01','2026-01-01');`);
const legacyBefore=query(`SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM saas.merchant_admin_records r WHERE record_kind LIKE 'seo_%' OR r.id='${id(2)}'`);
const bodyBefore=query(`SELECT jsonb_build_object('body',body,'format',body_format,'origins',origins,'excerpt',excerpt) FROM saas.merchant_content_bodies WHERE record_id='${id(3)}'`);
apply(UP);
await check('migration fills empty native metadata, retains native overrides/full legacy rows/drafts and binds real links',()=>{
 assert.deepEqual(query(`SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM saas.merchant_admin_records r WHERE record_kind LIKE 'seo_%' OR r.id='${id(2)}'`),legacyBefore);
 assert.deepEqual(query(`SELECT jsonb_build_object('body',body,'format',body_format,'origins',origins,'excerpt',excerpt) FROM saas.merchant_content_bodies WHERE record_id='${id(3)}'`),bodyBefore);
 const product=getResource('product',id(11));assert.equal(product.title,'Native product title');assert.equal(product.description,'Legacy product description');assert.equal(product.canonicalPath,'/urun/ring');
 assert.equal(getResource('page',id(1)).title,'Legacy about title');const blog=getResource('blog',id(3));assert.equal(blog.title,'Original title');assert.equal(blog.indexing,'noindex');assert.equal(blog.canonicalPath,'/blog/news');
 assert.equal(getResource('blog',id(2)).title,null);assert.equal(read('links').payload.items.find(x=>x.id===id(43)).anchorText,'Legacy jewelry link');assert.equal(read('links').payload.items.some(x=>x.id===id(46)),false);
 assert.ok(read().payload.issues.some(x=>x.code==='legacy_seo_conflict'));assert.equal(scalar(`SELECT count(*) FROM saas.seo_legacy_reconciliation`),'6');
});
await check('unified real resources retain native drafts, settings and store boundary',()=>{
 assert.equal(read().outcome,'found');assert.equal(resources().length,5);assert.equal(resources().some(x=>x.id===id(4)),false);
 assert.equal(read('settings').payload.metaTitle,'Retained legacy');assert.equal(read('settings').payload.version,0);
 assert.equal(publicCall('seo_public_get',`,'blog','${id(2)}'`).outcome,'not_found');
 assert.equal(publicCall('seo_public_get',`,'page','${id(4)}'`).outcome,'not_found');
 assert.equal(publicCall('seo_public_get',`,'category','${id(10)}'`).payload.resource.path,'/kategori/jewelry');
 assert.equal(read('resources',{kind:'page',query:'About',missing:true,cursor:null,limit:1}).payload.total,1);
});
await check('membership, role, store and current plan revoke writes and replay before observation',()=>{
 assert.equal(rpc(`saas.seo_admin_overview(${A(id(20),MEMBERSHIP)})`).outcome,'membership_denied');
 assert.equal(rpc(`saas.seo_admin_overview(${A(PRINCIPAL,MEMBERSHIP,FOREIGN)})`).outcome,'membership_denied');
 owner(`UPDATE saas.memberships SET role='analyst' WHERE id='${MEMBERSHIP}'`);assert.equal(mutate('settings',settingsRequest).outcome,'membership_denied');owner(`UPDATE saas.memberships SET role='store_owner' WHERE id='${MEMBERSHIP}'`);
 owner(`UPDATE saas.subscriptions SET status='inactive' WHERE store_id='${STORE}'`);assert.equal(read().outcome,'feature_not_enabled');owner(`UPDATE saas.subscriptions SET status='active' WHERE store_id='${STORE}'`);
});
let settingsOperation=randomUUID();
await check('settings compare-and-swap, persisted IndexNow key, exact replay and mismatch',()=>{
 const saved=mutate('settings',settingsRequest,settingsOperation);assert.equal(saved.outcome,'saved');assert.equal(saved.payload.settings.version,1);
 const replay=mutate('settings',settingsRequest,settingsOperation);assert.equal(replay.outcome,'operation_replayed');assert.deepEqual(replay.payload,saved.payload);
 assert.equal(mutate('settings',{...settingsRequest,metaTitle:'Changed'},settingsOperation).outcome,'operation_mismatch');
 assert.equal(mutate('settings',settingsRequest).outcome,'version_conflict');
 const key=publicCall('seo_public_key').payload.key;assert.match(key,/^[a-f0-9]{32}$/);assert.equal(publicCall('seo_public_key').payload.key,key);
 const foreignAsset={...settingsRequest,expectedVersion:1,socialAssetId:id(99)};assert.equal(mutate('settings',foreignAsset).outcome,'record_not_found');
 owner(`UPDATE saas.memberships SET status='revoked' WHERE id='${MEMBERSHIP}'`);assert.equal(mutate('settings',settingsRequest,settingsOperation).outcome,'membership_denied');owner(`UPDATE saas.memberships SET status='active' WHERE id='${MEMBERSHIP}'`);
});
await check('native title metadata preserves long body, origin, other configs and exact history',()=>{
 for(const [kind,rid] of [['product',id(11)],['category',id(10)],['page',id(1)],['blog',id(3)]]){
  const req=saveRequest(kind,rid),operation=randomUUID(),saved=mutate('resource',req,operation);assert.equal(saved.outcome,'saved');assert.equal(saved.payload.resource.version,req.expectedVersion+1);assert.equal(saved.payload.resource.seoVersion,req.expectedSeoVersion+1);assert.equal(saved.payload.resource.title,req.title);
  assert.deepEqual(mutate('resource',req,operation).payload,saved.payload);assert.equal(mutate('resource',req).outcome,'version_conflict');
  assert.equal(publicCall('seo_public_get',`, '${kind}','${rid}'`).payload.resource.title,req.title);
 }
 assert.equal(scalar(`SELECT body FROM saas.merchant_content_bodies WHERE record_id='${id(3)}'`),longBody);assert.deepEqual(query(`SELECT origins->'body' FROM saas.merchant_content_bodies WHERE record_id='${id(3)}'`),{state:'manual'});
 assert.equal(scalar(`SELECT config->>'unrelated' FROM saas.merchant_admin_records WHERE id='${id(1)}'`),'preserve');assert.equal(scalar(`SELECT body FROM saas.merchant_content_bodies WHERE record_id='${id(1)}'`),'<p>Legacy body</p>');
 assert.ok(Number(scalar(`SELECT count(*) FROM saas.merchant_content_versions WHERE store_id='${STORE}'`))>=2);
 const draft=saveRequest('blog',id(2));assert.equal(mutate('resource',draft).outcome,'saved');assert.equal(publicCall('seo_public_get',`,'blog','${id(2)}'`).outcome,'not_found');
 for(const unsafe of ['/account','//other.test','/custom','/pages/%2e%2e'])assert.equal(mutate('resource',{...saveRequest('page',id(1)),canonicalPath:unsafe}).outcome,'invalid_input');
 for(const unsafe of ['/pages/missing-page','/pages/foreign','/blog/draft']){const before=getResource('page',id(1)),operation=randomUUID(),notificationCount=read('notifications').payload.items.length;assert.equal(mutate('resource',{...saveRequest('page',id(1)),canonicalPath:unsafe},operation).outcome,'invalid_input');assert.deepEqual(getResource('page',id(1)),before);assert.equal(read('notifications').payload.items.length,notificationCount);assert.equal(scalar(`SELECT count(*) FROM saas.seo_operations WHERE operation_id='${operation}'`),'0');}

 assert.equal(mutate('resource',{...saveRequest('page',id(1)),id:id(4)}).outcome,'record_not_found');
});
await check('existing category authority bridges both editors and preserves long legacy descriptions and drafts',()=>{
 const category=getResource('category',id(10)),record=query(`SELECT to_jsonb(r) FROM saas.merchant_admin_records r WHERE store_id='${STORE}' AND record_kind='seo_category_entry' AND status='active' AND config->>'resourceId'='${id(10)}'`);
 assert.equal(record.config.metaTitle,category.title);const legacyDescription='a'.repeat(4000),config={...record.config,metaTitle:'Existing category editor',metaDescription:legacyDescription};
 const result=rpc(`saas.merchant_admin_save(${A()},'${randomUUID()}','${hash('legacycategory')}','${record.id}',${record.version},'seo_category_entry',${lit(record.name)},${json(config)},'active')`);assert.equal(result.outcome,'saved');
 const updated=getResource('category',id(10));assert.equal(updated.version,category.version+1);assert.equal(updated.title,'Existing category editor');assert.equal(updated.description,legacyDescription);
 const request={...saveRequest('category',id(10)),description:legacyDescription};assert.equal(mutate('resource',request).outcome,'saved');assert.equal(scalar(`SELECT config->>'metaDescription' FROM saas.merchant_admin_records WHERE id='${record.id}'`),legacyDescription);
 owner(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES('${id(31)}','${STORE}','seo_category_entry','Legacy draft',${json({resourceId:id(10),metaTitle:'Draft must stay draft'})},'draft','${NOW}','${NOW}')`);
 assert.equal(getResource('category',id(10)).title,request.title);assert.equal(scalar(`SELECT status FROM saas.merchant_admin_records WHERE id='${id(31)}'`),'draft');
});
await check('public links only show live same-store targets and protect link versions',()=>{
 const req={id:null,expectedVersion:null,sourceKind:'page',sourceId:id(1),targetKind:'category',targetId:id(10),anchorText:'View jewelry',enabled:true},result=mutate('link',req);assert.equal(result.outcome,'saved');const link=result.payload.link;
 assert.deepEqual(publicCall('seo_public_get',`,'page','${id(1)}'`).payload.links,[{anchorText:'View jewelry',path:'/kategori/jewelry'}]);
 assert.equal(mutate('link',{...req,targetKind:'page',targetId:id(4)}).outcome,'record_not_found');
 assert.equal(mutate('link',{...req,id:link.id,expectedVersion:0}).outcome,'version_conflict');
 const disabled=mutate('link',{...req,id:link.id,expectedVersion:1,enabled:false});assert.equal(disabled.outcome,'saved');assert.deepEqual(publicCall('seo_public_get',`,'page','${id(1)}'`).payload.links,[]);
 assert.equal(mutate('link',{...req,id:link.id,expectedVersion:2,remove:true}).payload.link,null);
});
await check('sitemap actual SQL emits home catalog categories and honors canonical/noindex',()=>{
 const req=saveRequest('page',id(1));assert.equal(mutate('resource',{...req,canonicalPath:'/blog/news'}).outcome,'saved');
 let paths=publicCall('public_content_sitemap_page',",'content',0").payload.items.map(x=>x.path);
 for(const p of ['/','/urunler','/kategori/jewelry','/blog/news','/blog/news'])assert.ok(paths.includes(p),p);assert.equal(paths.includes('/pages/about'),false);assert.equal(paths.includes('/blog/draft'),false);
 assert.equal(mutate('resource',{...saveRequest('category',id(10)),indexing:'noindex'}).outcome,'saved');paths=publicCall('public_content_sitemap_page',",'content',0").payload.items.map(x=>x.path);assert.equal(paths.includes('/kategori/jewelry'),false);
 assert.equal(mutate('resource',{...saveRequest('category',id(10)),indexing:'inherit'}).outcome,'saved');
});
await check('manual notification all-or-nothing, rejects drafts/foreign IDs and replays',()=>{
 owner(`DELETE FROM saas.seo_notifications WHERE store_id='${STORE}'`);
 const req={resources:[{kind:'page',id:id(1)},{kind:'category',id:id(10)}]},op=randomUUID();assert.equal(mutate('notify',req,op).payload.queued,2);assert.equal(mutate('notify',req,op).outcome,'operation_replayed');assert.equal(read('notifications').payload.items.length,2);
 for(const bad of [{resources:[{kind:'blog',id:id(2)}]},{resources:[{kind:'page',id:id(4)}]},{resources:[{kind:'product',id:id(11)},{kind:'page',id:id(4)}]}])assert.equal(mutate('notify',bad).outcome,'record_not_found');assert.equal(read('notifications').payload.items.length,2);
 const before=read('notifications').payload.items.length;sql(`BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT * FROM saas.seo_admin_mutate(${A()},'${randomUUID()}','${hash('rollback')}','notify',${json({resources:[{kind:'product',id:id(11)}]})});ROLLBACK;`);assert.equal(read('notifications').payload.items.length,before);
});
await check('automatic transactional publication, slug changes, delete and rollback retain OLD paths',()=>{
 owner(`DELETE FROM saas.seo_notifications WHERE store_id='${STORE}';UPDATE saas.merchant_admin_records SET config=config||'{"slug":"new-about"}'::jsonb,version=version+1,updated_at='${NOW}' WHERE id='${id(1)}'`);
 const paths=read('notifications').payload.items.map(x=>x.path);assert.ok(paths.includes('/pages/about'));assert.ok(paths.includes('/blog/news'));
 owner(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES('${id(30)}','${STORE}','page','Delete me','{"slug":"delete-me","published":true}','active','${NOW}','${NOW}');DELETE FROM saas.seo_notifications WHERE store_id='${STORE}';DELETE FROM saas.merchant_admin_records WHERE id='${id(30)}'`);assert.ok(read('notifications').payload.items.some(x=>x.path==='/pages/delete-me'));
 const before=read('notifications').payload.items.length;sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.products SET slug='rolled-back-ring',version=version+1,updated_at='${NOW}' WHERE id='${id(11)}';ROLLBACK;`);assert.equal(read('notifications').payload.items.length,before);assert.equal(getResource('product',id(11)).path,'/urun/ring');
 owner(`DELETE FROM saas.seo_notifications WHERE store_id='${STORE}';UPDATE saas.merchant_admin_records SET name='Draft changed',version=version+1,updated_at='${NOW}' WHERE id='${id(2)}'`);assert.equal(read('notifications').payload.items.length,0);
});
await check('workflow claim bounded leases, stale finish fencing, retry and received states',()=>{
 mutate('notify',{resources:[{kind:'product',id:id(11)}]});const first=claim().payload;assert.equal(first.notifications.length,1);assert.ok(first.notifications.length+first.checks.length<=25);const n=first.notifications[0];assert.equal(claim().payload.notifications.length,0);
 const finish=(lease,status='received',next=null,when=NOW)=>rpc(`saas.seo_worker_finish_notification('${n.id}','${lease}','${when}',${json({status,httpStatus:200,error:null,nextAttemptAt:next})})`,'celebix_saas_workflow');
 assert.equal(finish(randomUUID()).outcome,'version_conflict');assert.equal(finish(n.leaseId,'verification_pending','2026-09-29T12:01:00Z').outcome,'finished');assert.equal(read('notifications').payload.items[0].status,'verification_pending');
 const second=claim('2026-09-29T12:01:01Z').payload.notifications[0];assert.equal(second.attempts,2);assert.equal(finish(n.leaseId).outcome,'version_conflict');assert.equal(finish(second.leaseId,'received',null,'2026-09-29T12:01:01Z').outcome,'finished');assert.equal(read('notifications').payload.items[0].status,'received');
});
await check('worker and public key fail closed for revoked, nonprimary and temporary hosts',()=>{
 mutate('notify',{resources:[{kind:'product',id:id(11)}]});
 owner(`UPDATE saas.store_domains SET is_primary=false,version=version+1,updated_at='${NOW}' WHERE store_id='${STORE}'`);assert.equal(claim().payload.notifications.length,0);assert.equal(publicCall('seo_public_key').outcome,'not_found');assert.equal(read('settings').payload.eligible,false);owner(`UPDATE saas.store_domains SET is_primary=true,version=version+1,updated_at='${NOW}' WHERE store_id='${STORE}'`);
 assert.equal(read('notifications').payload.items.some(x=>x.status==='failed'&&x.error==='host_ineligible'),true);
});
await check('unverified and platform hosts deny keys and notification leases; retry limit is bounded',()=>{
 const temp='content-fixture.platform.example.test';owner(`INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(32)}','${STORE}','${temp}','platform_subdomain','active',false,'2026-01-01','2026-01-01','2026-01-01',1)`);
 assert.equal(publicCall('seo_public_key','',temp).outcome,'not_found');assert.equal(publicCall('seo_public_settings','',temp).payload.eligible,false);
 mutate('notify',{resources:[{kind:'product',id:id(11)}]});owner(`UPDATE saas.store_domains SET verified_at='2026-09-30',version=version+1,updated_at='${NOW}' WHERE hostname='${HOST}'`);assert.equal(publicCall('seo_public_key').outcome,'not_found');assert.equal(claim().payload.notifications.length,0);owner(`UPDATE saas.store_domains SET verified_at='2026-01-01',version=version+1,updated_at='${NOW}' WHERE hostname='${HOST}'`);
 mutate('notify',{resources:[{kind:'product',id:id(11)}]});let t=new Date(NOW),last;
 for(let attempt=1;attempt<=5;attempt++){const claimed=claim(t.toISOString()).payload.notifications;assert.equal(claimed.length,1);const n=claimed[0];assert.equal(n.attempts,attempt);const next=new Date(t.getTime()+1000).toISOString();assert.equal(rpc(`saas.seo_worker_finish_notification('${n.id}','${n.leaseId}','${t.toISOString()}',${json({status:'retrying',httpStatus:503,error:'provider_retry',nextAttemptAt:next})})`,'celebix_saas_workflow').outcome,'finished');last=n;t=new Date(t.getTime()+2000);}
 const exhausted=read('notifications').payload.items.find(x=>x.id===last.id);assert.equal(exhausted.status,'failed');assert.equal(exhausted.error,'retry_limit');assert.equal(claim(t.toISOString()).payload.notifications.length,0);
});
await check('durable checks are independent batches and final findings count only leased resource',()=>{
 owner(`DELETE FROM saas.seo_notifications WHERE store_id='${STORE}'`);const op=randomUUID(),start=mutate('check',{},op);assert.equal(start.outcome,'saved');assert.equal(start.payload.total,6);assert.equal(mutate('check',{},op).outcome,'operation_replayed');assert.equal(mutate('check',{}).payload.total,start.payload.total);
 const batch=claim().payload.checks;assert.equal(batch.length,6);assert.equal(claim().payload.checks.length,0);for(const u of batch){const result={issues:[],error:null};assert.equal(rpc(`saas.seo_worker_finish_check('${u.id}','${randomUUID()}','${NOW}',${json(result)})`,'celebix_saas_workflow').outcome,'version_conflict');assert.equal(rpc(`saas.seo_worker_finish_check('${u.id}','${u.leaseId}','${NOW}',${json(result)})`,'celebix_saas_workflow').outcome,'finished');}
 const overview=read().payload;assert.equal(overview.check.status,'completed');assert.equal(overview.check.checked,6);
});
await check('real repositories enforce adapter shapes and exact mutation replay end to end',async()=>{
 const pool=new pg.Pool({host:socket,port,user:'postgres',database:DB,max:2}),timeouts={poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:5000};
 const tenantContext={schemaVersion:1,requestId:'fixture',principal:{id:PRINCIPAL,issuer:'https://identity.example.test',subject:'content-owner'},store:{id:STORE,slug:'content-fixture',status:'active'},membership:{id:MEMBERSHIP,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:PLAN,planCode:'free_starter',version:1,status:'active',features:['catalog'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr'};
 try {const repo=new PostgresSeoRepository({pool,role:'celebix_saas_app',timeouts,audit(){}}),pub=new PostgresPublicSeoRepository({pool,role:'celebix_saas_host_resolver',timeouts}),worker=new PostgresSeoWorkerRepository({pool,role:'celebix_saas_workflow',timeouts}),auth={tenantContext,now:new Date(NOW)};
 const r=(await repo.resources({...auth,kind:'product'})).items[0],request={kind:r.kind,id:r.id,expectedVersion:r.version,expectedSeoVersion:r.seoVersion,title:'Repository title',description:null,canonicalPath:null,indexing:'inherit'},operationId=randomUUID();const result=await repo.saveResource({...auth,operationId,request});assert.equal(result.replayed,false);assert.equal((await repo.saveResource({...auth,operationId,request})).replayed,true);assert.equal((await pub.get({hostname:HOST,now:new Date(NOW),kind:'product',id:r.id})).resource.title,'Repository title');assert.equal((await pub.settings({hostname:HOST,now:new Date(NOW)})).eligible,true);assert.match((await pub.key({hostname:HOST,now:new Date(NOW)})).key,/^[a-f0-9]{32}$/);assert.equal((await worker.claim({now:new Date(NOW),limit:25,workerId:'repo-worker'})).notifications.length,1);
 }finally{await pool.end();}
});
await check('app host and workflow roles cannot query raw tables or call other role entrypoints',()=>{
 for(const role of ['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'])for(const table of ['seo_settings','seo_resource_options','seo_links','seo_operations','seo_notifications','seo_check_urls'])assert.notEqual(sql(`SET ROLE ${role};SELECT * FROM saas.${table}`,DB,true).status,0);
 for(const [role,call] of [['celebix_saas_host_resolver',`saas.seo_admin_overview(${A()})`],['celebix_saas_app',`saas.seo_worker_claim('${NOW}',25,'bad')`],['celebix_saas_workflow',`saas.seo_public_key('${HOST}','${NOW}')`]])assert.notEqual(sql(`SET ROLE ${role};SELECT * FROM ${call}`,DB,true).status,0);
});
await check('populated down/up retains metadata links operations notifications and native content',()=>{
 const before=query(`SELECT jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(pr) ORDER BY product_id) FROM saas.catalog_product_profiles pr),'settings',(SELECT jsonb_agg(to_jsonb(s)) FROM saas.seo_settings s),'options',(SELECT jsonb_agg(to_jsonb(s) ORDER BY resource_id) FROM saas.seo_resource_options s),'body',(SELECT jsonb_agg(to_jsonb(b) ORDER BY record_id) FROM saas.merchant_content_bodies b),'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM saas.seo_notifications n))`);apply(DOWN);assert.equal(scalar("SELECT to_regprocedure('saas.seo_admin_overview(uuid,uuid,uuid,uuid,text,bigint,timestamptz)') IS NULL"),'t');apply(UP);const after=query(`SELECT jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(pr) ORDER BY product_id) FROM saas.catalog_product_profiles pr),'settings',(SELECT jsonb_agg(to_jsonb(s)) FROM saas.seo_settings s),'options',(SELECT jsonb_agg(to_jsonb(s) ORDER BY resource_id) FROM saas.seo_resource_options s),'body',(SELECT jsonb_agg(to_jsonb(b) ORDER BY record_id) FROM saas.merchant_content_bodies b),'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM saas.seo_notifications n))`);assert.deepEqual(after,before);
});

console.log('PASS native SEO hub: '+count+' scenarios');
} finally {if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);if(root)rmSync(root,{recursive:true,force:true});}
