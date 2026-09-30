import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// Native, Unix-socket-only disposable cluster. Never reads a DSN or an existing database.
const ROOT=path.resolve(import.meta.dirname,'../../..'), SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202609300181_seo_indexable_canonicals.up.sql', DOWN=UP.replace('.up.','.down.');
const DB='seo_indexable_canonicals_fixture', NOW='2026-09-29T12:00:00.000Z';
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
  const files=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||[130,131,142,144,149,150,153,154,158,160,162,163,164,165,170,171,172,173,174,175,176,177,178,179,180].includes(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
  for(const file of files)apply(file);
  owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Content fixture','content-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${FOREIGN}','Foreign fixture','foreign-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test','content-owner','owner@example.test',true,'2026-01-01','2026-01-01'),('${id(20)}','https://identity.example.test','other-owner','other@example.test',true,'2026-01-01','2026-01-01');
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${id(21)}','${id(20)}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${id(70)}','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(71)}','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1)`);


const publicCall=(name,extra='')=>rpc(`saas.${name}('${HOST}','${NOW}'::timestamptz${extra})`,'celebix_saas_host_resolver');
const resources=()=>read('resources',{kind:null,query:null,missing:false,cursor:null,limit:100}).payload.items;
const resource=(kind,rid)=>resources().find(r=>r.kind===kind&&r.id===rid);
const request=(kind,rid,change={})=>{const r=resource(kind,rid);return{kind,id:rid,expectedVersion:r.version,expectedSeoVersion:r.seoVersion,title:r.title,description:r.description,canonicalPath:r.canonicalPath,indexing:r.indexing,...change};};
const body='<p>Keep all content</p>';
owner(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES
 ('${id(1)}','${STORE}','page','Source','{"slug":"source","published":true}','active','2026-01-01','2026-01-01'),
 ('${id(2)}','${STORE}','page','Target','{"slug":"target","published":true}','active','2026-01-01','2026-01-01'),
 ('${id(3)}','${STORE}','blog_post','Blog target','{"slug":"blog-target","published":true}','active','2026-01-01','2026-01-01'),
 ('${id(4)}','${STORE}','seo_control','SEO','{"allowIndex":true}','active','2026-01-01','2026-01-01');
 INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins) VALUES('${STORE}','${id(1)}',1,${lit(body)},'normalized_html','{"body":{"state":"manual"}}');
 INSERT INTO saas.catalog_categories(id,store_id,name,slug,status,created_at,updated_at) VALUES('${id(10)}','${STORE}','Category','category','active','2026-01-01','2026-01-01');
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${id(11)}','${STORE}','product','Product','active','TRY','2026-01-01','2026-01-01');
 ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
 INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${id(12)}','${id(11)}','${STORE}','One',100,false,0,'active','2026-01-01','2026-01-01');
 ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;`);
const targets=[['page',id(2),'/pages/target'],['blog',id(3),'/blog/blog-target'],['category',id(10),'/kategori/category'],['product',id(11),'/urun/product']];
for(const [kind,rid] of targets)assert.equal(mutate('resource',request(kind,rid,{indexing:'noindex'})).outcome,'saved');
const beforeMigration=query(`SELECT jsonb_build_object('records',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM saas.merchant_admin_records r WHERE store_id='${STORE}'),'bodies',(SELECT jsonb_agg(to_jsonb(b) ORDER BY record_id) FROM saas.merchant_content_bodies b WHERE store_id='${STORE}'),'options',(SELECT jsonb_agg(to_jsonb(o) ORDER BY kind,resource_id) FROM saas.seo_resource_options o WHERE store_id='${STORE}'),'products',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM saas.products p WHERE store_id='${STORE}'),'categories',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM saas.catalog_categories c WHERE store_id='${STORE}') )`);
if(process.env.SEO_INDEXABLE_CANONICALS_SKIP_MIGRATION!=='1')apply(UP);
await check('other noindex targets reject canonical saves before any mutation for every resource kind',()=>{
 const before=resource('page',id(1)),operationCount=scalar(`SELECT count(*) FROM saas.seo_operations`);
 for(const [kind,rid,path] of targets){const operation=randomUUID(),result=mutate('resource',request('page',id(1),{canonicalPath:path}),operation);assert.equal(result.outcome,'invalid_input',kind);assert.deepEqual(resource('page',id(1)),before);assert.equal(scalar(`SELECT count(*) FROM saas.seo_operations WHERE operation_id='${operation}'`),'0');}
 assert.equal(scalar(`SELECT count(*) FROM saas.seo_operations`),operationCount);
 assert.deepEqual(query(`SELECT jsonb_build_object('records',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM saas.merchant_admin_records r WHERE store_id='${STORE}'),'bodies',(SELECT jsonb_agg(to_jsonb(b) ORDER BY record_id) FROM saas.merchant_content_bodies b WHERE store_id='${STORE}'),'options',(SELECT jsonb_agg(to_jsonb(o) ORDER BY kind,resource_id) FROM saas.seo_resource_options o WHERE store_id='${STORE}'),'products',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM saas.products p WHERE store_id='${STORE}'),'categories',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM saas.catalog_categories c WHERE store_id='${STORE}') )`),beforeMigration);
});
await check('each noindex resource may retain its own native canonical',()=>{
 for(const [kind,rid,path] of targets){const saved=mutate('resource',request(kind,rid,{canonicalPath:path}));assert.equal(saved.outcome,'saved',kind);assert.equal(saved.payload.resource.effectiveCanonicalPath,path);assert.equal(saved.payload.resource.allowIndex,false);}
});
await check('turning an existing canonical target noindex falls back publicly, sitemap omits target and overview flags choice',()=>{
 assert.equal(mutate('resource',request('page',id(2),{indexing:'inherit'})).outcome,'saved');
 assert.equal(mutate('resource',request('page',id(1),{canonicalPath:'/pages/target'})).outcome,'saved');
 assert.equal(publicCall('seo_public_get',`,'page','${id(1)}'`).payload.resource.effectiveCanonicalPath,'/pages/target');
 assert.equal(mutate('resource',request('page',id(2),{indexing:'noindex'})).outcome,'saved');
 const source=publicCall('seo_public_get',`,'page','${id(1)}'`).payload.resource;assert.equal(source.canonicalPath,'/pages/target');assert.equal(source.effectiveCanonicalPath,'/pages/source');assert.equal(source.allowIndex,true);
 const content=publicCall('public_content_sitemap_page',",'content',0").payload.items.map(x=>x.path);assert.ok(content.includes('/pages/source'));for(const path of ['/pages/target','/blog/blog-target','/kategori/category'])assert.equal(content.includes(path),false,path);
 assert.equal(publicCall('public_content_sitemap_page',",'products',0").outcome,'not_found');
 assert.ok(read().payload.issues.some(x=>x.code==='invalid_canonical'&&x.resourceId===id(1)));
 assert.equal(scalar(`SELECT body FROM saas.merchant_content_bodies WHERE record_id='${id(1)}'`),body);
});
await check('private helper authority stays closed and down/up preserves saved options exactly',()=>{
 for(const role of ['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow'])assert.notEqual(sql(`SET ROLE ${role};SELECT saas.seo_canonical_owned('${STORE}','${NOW}','/pages/target','page','${id(1)}')`,DB,true).status,0);
 const snapshot=query(`SELECT jsonb_agg(to_jsonb(o) ORDER BY kind,resource_id) FROM saas.seo_resource_options o`);
 apply(DOWN);assert.equal(publicCall('seo_public_get',`,'page','${id(1)}'`).payload.resource.effectiveCanonicalPath,'/pages/target');apply(UP);
 assert.equal(publicCall('seo_public_get',`,'page','${id(1)}'`).payload.resource.effectiveCanonicalPath,'/pages/source');assert.deepEqual(query(`SELECT jsonb_agg(to_jsonb(o) ORDER BY kind,resource_id) FROM saas.seo_resource_options o`),snapshot);
});
console.log('PASS native SEO indexable canonicals: '+count+' scenarios');
} finally {if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);if(root)rmSync(root,{recursive:true,force:true});}
