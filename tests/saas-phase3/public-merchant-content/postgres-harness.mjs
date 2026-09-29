import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {PostgresPublicStorefrontContentRepository} from '../../../packages/saas-data/src/storefront-content/repository.ts';
import {renderSitemapPage} from '../../../apps/storefront-shared/lib/sitemap.ts';
import {buildPublicBlogPage,publicContentSeo} from '../../../apps/storefront-shared/lib/blog-page.ts';
import {buildPublicContentPageV2} from '../../../apps/storefront-shared/lib/content-page.ts';
import {PUBLIC_CONTENT_READINESS_SQL} from '../../../apps/storefront-shared/lib/content-readiness.ts';

// Disposable PostgreSQL 16, isolated Unix socket, no external DSN.
const ROOT=path.resolve(import.meta.dirname,'../../..'),SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const UP='202609290177_public_merchant_content.up.sql',DOWN=UP.replace('.up.','.down.');
const DB='public_merchant_content_fixture',NOW='2026-09-29T12:00:00.000Z';
const STORE='10000000-0000-4000-8000-000000000174',FOREIGN='10000000-0000-4000-8000-000000000175';
const HOST='content-fixture.example.test',OTHER_HOST='other-fixture.example.test';
const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const lit=value=>`'${String(value).replaceAll("'","''")}'`;
const json=value=>`${lit(JSON.stringify(value))}::jsonb`;
let root,socket,data,port,count=0;
function command(name,args,input='',allowFailure=false){const result=spawnSync(path.join(BIN,name),args,{cwd:ROOT,input,encoding:'utf8',timeout:120000,env:{...process.env,LC_ALL:'C',LANG:'C'},maxBuffer:64*1024*1024});if(result.error)throw result.error;if(!allowFailure&&result.status!==0)throw Error(`${name}: ${result.stderr}`);return result;}
function sql(source,db=DB,allowFailure=false){return command('psql',['-h',socket,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],source,allowFailure);}
const scalar=source=>sql(source).stdout.trim();
const query=source=>JSON.parse(scalar(source));
const owner=source=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${source};COMMIT;`);
function apply(file){sql(readFileSync(path.join(SQL,file),'utf8'));}
function rpc(call,hostRole='celebix_saas_host_resolver'){return query(`BEGIN;SET LOCAL ROLE ${hostRole};SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM ${call};COMMIT;`);}
const publicCall=(name,host=HOST,extra='')=>rpc(`saas.${name}(${lit(host)},${lit(NOW)}::timestamptz${extra})`);
function seedRecord(n,store,kind,slug,locale,status='active',published=true,when='2026-09-29T08:00:00.000Z',title=`Title ${n}`,body=''){
 const config={slug,...(locale?{locale}:{}),published,...(body?{body}:{})};
 owner(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at) VALUES('${id(n)}','${store}','${kind}',${lit(title)},${json(config)},'${status}',1,${status==='archived'?`${lit(when)}::timestamptz`:'NULL'},${lit(when)}::timestamptz,${lit(when)}::timestamptz)`);
}
async function check(name,run){await run();console.log(`PASS ${++count} ${name}`);}

async function main(){
 try{
  root=mkdtempSync('/tmp/celebix-public-content-');socket=path.join(root,'socket');data=path.join(root,'data');port=24000+Math.floor(Math.random()*10000);mkdirSync(socket,{mode:0o700});
  command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);
  command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);
  sql(`CREATE DATABASE ${DB};`,'postgres');
  const files=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||[130,131,142,144,149,150,153,154,158,162,163,164,165,170,171,172,173,174].includes(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
  for(const file of files)apply(file);
  owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Content fixture','content-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${FOREIGN}','Foreign fixture','foreign-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(71)}','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),('${id(72)}','${FOREIGN}','${OTHER_HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);`);
  assert.equal(scalar(PUBLIC_CONTENT_READINESS_SQL),'f','new storefront runtime must reject a database missing migration177');
  apply(UP);
  assert.equal(scalar(PUBLIC_CONTENT_READINESS_SQL),'t','new storefront runtime recognizes the complete public grant set');
  const revoked=sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;REVOKE EXECUTE ON FUNCTION saas.public_blog_get(text,timestamptz,text,text) FROM celebix_saas_host_resolver;${PUBLIC_CONTENT_READINESS_SQL};ROLLBACK;`);
  assert.equal(revoked.stdout.trim(),'f','new storefront runtime must reject a missing reader grant');
  seedRecord(1,STORE,'language_setting',null,null,'active',false,undefined,'Languages');
  owner(`UPDATE saas.merchant_admin_records SET config='{"defaultLocale":"tr","enabledLocales":["tr","en-US"]}'::jsonb WHERE id='${id(1)}'`);
  seedRecord(2,STORE,'sitemap',null,null,'active',false,undefined,'Sitemap');
  owner(`UPDATE saas.merchant_admin_records SET config='{"includeProducts":true,"includeContent":true,"changeFrequency":"monthly"}'::jsonb WHERE id='${id(2)}'`);
  seedRecord(3,STORE,'seo_control',null,null,'active',false,undefined,'SEO');
  seedRecord(4,FOREIGN,'seo_control',null,null,'active',false,undefined,'SEO foreign');
  owner(`UPDATE saas.merchant_admin_records SET config='{"allowIndex":true}'::jsonb WHERE id IN('${id(3)}','${id(4)}')`);
  seedRecord(5,STORE,'page','about','tr','active',true,'2026-09-29T08:00:00.000Z','About','<p>Legacy page</p>');
  seedRecord(6,STORE,'page','about','en-US','active',true,'2026-09-29T08:00:00.000Z','About EN','<p>English page</p>');
  seedRecord(7,STORE,'blog_post','news','tr','active',true,'2026-09-29T08:00:00.000Z','News','<p>Turkish news</p>');
  seedRecord(8,STORE,'blog_post','news','en-US','active',true,'2026-09-29T09:00:00.000Z','News EN','<p>English news</p>');
  seedRecord(9,STORE,'blog_post','draft','tr','draft',false,'2026-09-29T08:00:00.000Z','Draft');
  seedRecord(10,STORE,'blog_post','archive','tr','archived',true,'2026-09-29T08:00:00.000Z','Archived');
  seedRecord(11,FOREIGN,'blog_post','foreign','tr','active',true,'2026-09-29T08:00:00.000Z','Private foreign');
  seedRecord(12,FOREIGN,'page','other','tr','active',true,'2026-09-29T08:00:00.000Z','Other page');
  seedRecord(13,STORE,'page','legacy','tr','active',true,'2026-09-29T08:00:00.000Z','Legacy plain','Plain legacy content');
  seedRecord(14,STORE,'page','empty','tr','active',true,'2026-09-29T08:00:00.000Z','Empty');
  seedRecord(15,STORE,'page','dupe','tr','active',true,'2026-09-29T08:00:00.000Z','Older','Old');
  seedRecord(16,STORE,'page','dupe','tr','active',true,'2026-09-29T09:00:00.000Z','Newer','New');
  seedRecord(17,STORE,'blog_post','another','tr','active',true,'2026-09-29T09:30:00.000Z','Another','<p>Another blog</p>');
  seedRecord(18,STORE,'page','missing-locale',null,'active',true,'2026-09-29T09:30:00.000Z','Missing Locale','<p>Default language</p>');
  const body='<p>'+'ğ'.repeat(39996)+'x</p>';assert.equal(Buffer.byteLength(body),80000);
  owner(`INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description) VALUES('${STORE}','${id(5)}',1,${lit(body)},'normalized_html','{}'::jsonb,'Actual excerpt','Saved SEO','Saved description')`);
  // Fixture only: product catalog's inventory trigger needs a full adjustment workflow.
  owner(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
    VALUES('${id(26)}','https://identity.example.test','content-pricing-owner','pricing-owner@example.test',true,'2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES
    ('${id(20)}','${STORE}','ring','Ring','active','TRY','2026-09-29T08:00:00Z','2026-09-29T09:00:00Z'),
    ('${id(21)}','${FOREIGN}','other-ring','Other Ring','active','TRY','2026-09-29T08:00:00Z','2026-09-29T09:00:00Z'),
    ('${id(24)}','${STORE}','unpriced-earring','Unpriced Earring','active','TRY','2026-09-29T08:00:00Z','2026-09-29T09:00:00Z');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES
    ('${id(22)}','${id(20)}','${STORE}','One',100,false,0,'active','2026-09-29T08:00:00Z','2026-09-29T09:00:00Z'),
    ('${id(23)}','${id(21)}','${FOREIGN}','One',100,false,0,'active','2026-09-29T08:00:00Z','2026-09-29T09:00:00Z'),
    ('${id(25)}','${id(24)}','${STORE}','Unpriced',100,false,0,'active','2026-09-29T08:00:00Z','2026-09-29T09:00:00Z');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.pricing_reference_definitions(id,store_id,kind,label,reference_purity,created_by,created_at)
    VALUES('${id(27)}','${STORE}','eur','EUR unavailable',NULL,'${id(26)}','${NOW}');
    INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,source_amount,reference_id,labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at)
    VALUES('${STORE}','${id(25)}',1,'eur',100,'${id(27)}','none',0,0,false,'{}'::jsonb,'${id(26)}','${NOW}');
    INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version) VALUES('${STORE}','${id(25)}',1)`);
  await check('public page detail preserves 80KB sidecar and exact locale/metadata; legacy V1 shape unchanged',()=>{
   const tr=publicCall('public_content_page_get_v2',HOST,`,'about','tr'`),en=publicCall('public_content_page_get_v2',HOST,`,'about','en-US'`);
   assert.equal(tr.payload.body,body);assert.equal(tr.payload.seoTitle,'Saved SEO');assert.equal(tr.payload.seoDescription,'Saved description');
   assert.equal(en.payload.body,'<p>English page</p>');assert.equal(en.payload.locale,'en-US');
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'about','fr'`).outcome,'not_found');
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'other','tr'`).outcome,'not_found');
   assert.deepEqual(Object.keys(publicCall('public_content_page_get',HOST,`,'about'`).payload).sort(),['body','id','slug','title','updatedAt']);
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'legacy','tr'`).payload.body,'Plain legacy content');
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'empty','tr'`).payload.body,'');
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'dupe','tr'`).payload.id,id(16));
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'missing-locale','tr'`).payload.locale,'tr');
  });
  await check('blog list/detail hide private and unpublished content and paginate by bound locale',()=>{
   const list=publicCall('public_blog_list',HOST,`,'tr',1,NULL`);
   assert.equal(list.outcome,'listed');assert.equal(list.payload.items.length,1);assert.equal(list.payload.items[0].slug,'another');assert.equal(typeof list.payload.nextCursor,'string');
   const parsedCursor=JSON.parse(Buffer.from(list.payload.nextCursor,'base64url').toString('utf8'));
   owner(`UPDATE saas.merchant_admin_records SET status='archived',archived_at='${NOW}',updated_at='${NOW}' WHERE id='${id(17)}'`);
   const after=publicCall('public_blog_list',HOST,`,'tr',1,${json(parsedCursor)}`);
   assert.equal(after.payload.items[0].slug,'news');assert.equal(after.payload.nextCursor,null);
   assert.equal(publicCall('public_blog_list',HOST,`,'en-US',1,${json(parsedCursor)}`).outcome,'invalid_input');
   assert.equal('body' in list.payload.items[0],false);assert.equal(publicCall('public_blog_get',HOST,`,'news','en-US'`).payload.body,'<p>English news</p>');
   for(const slug of ['draft','archive','foreign'])assert.equal(publicCall('public_blog_get',HOST,`,'${slug}','tr'`).outcome,'not_found');
   assert.equal(publicCall('public_blog_list',HOST,`,'en-US',1,NULL`).payload.items[0].locale,'en-US');
  });
  await check('actual SQL to repository to XML delivers tenant-specific monthly product/content and weekly default',async()=>{
   const pool=new pg.Pool({host:socket,port,user:'postgres',database:DB,max:2});
   try{const repo=new PostgresPublicStorefrontContentRepository({pool,role:'celebix_saas_host_resolver',timeouts:{poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:5000}});
    const index=await repo.getSitemapIndex({hostname:HOST,now:new Date(NOW)});assert.deepEqual(index,[{kind:'content',page:0},{kind:'products',page:0}]);
    for(const kind of ['content','products']){const entries=await repo.getSitemapPage({hostname:HOST,now:new Date(NOW),kind,page:0});const output=renderSitemapPage(`https://${HOST}/`,entries);assert.match(output,/<changefreq>monthly<\/changefreq>/);assert.equal(entries.every(e=>e.changeFrequency==='monthly'),true);assert.equal(output.includes(OTHER_HOST),false);}
    const other=await repo.getSitemapPage({hostname:OTHER_HOST,now:new Date(NOW),kind:'products',page:0});assert.equal(other[0].changeFrequency,'weekly');assert.match(renderSitemapPage(`https://${OTHER_HOST}/`,other),/<changefreq>weekly<\/changefreq>/);
   }finally{await pool.end();}
  });
  await check('published list to detail to canonical/SEO to sitemap is one consistent store-scoped chain',async()=>{
   const pool=new pg.Pool({host:socket,port,user:'postgres',database:DB,max:2});
   try{const repo=new PostgresPublicStorefrontContentRepository({pool,role:'celebix_saas_host_resolver',timeouts:{poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:5000}});
    const locales=await repo.getLocales({hostname:HOST,now:new Date(NOW)});
    const list=await repo.listBlogPosts({hostname:HOST,now:new Date(NOW),locale:'en-US',limit:20});
    assert.equal(list.items[0].slug,'news');
    const detail=buildPublicBlogPage(await repo.getBlogPost({hostname:HOST,now:new Date(NOW),slug:'news',locale:'en-US'}),'news',locales.defaultLocale);
    const page=buildPublicContentPageV2(await repo.getPageV2({hostname:HOST,now:new Date(NOW),slug:'about',locale:'tr'}),'about',locales.defaultLocale);
    assert.equal(Buffer.byteLength(page.html,'utf8'),80000);
    const metadata=publicContentSeo(page,'Content fixture');
    assert.equal(metadata.title,'Saved SEO | Content fixture');assert.equal(metadata.description,'Saved description');
    assert.equal(detail.route,'/blog/news?lang=en-US');assert.equal(page.route,'/pages/about');
    const sitemap=renderSitemapPage(`https://${HOST}/`,await repo.getSitemapPage({hostname:HOST,now:new Date(NOW),kind:'content',page:0}));
    assert.ok(sitemap.includes(`https://${HOST}/blog/news?lang=en-US`));assert.ok(sitemap.includes(`https://${HOST}/pages/about`));
    assert.ok(!sitemap.includes(OTHER_HOST));
   }finally{await pool.end();}
  });
  await check('product sitemap matches the current public catalog price visibility at the same instant',()=>{
   const projection=scalar(`SELECT saas.public_effective_product_projection('${STORE}','${id(24)}','${NOW}'::timestamptz) IS NULL`);
   assert.equal(projection,'t','an active variant with an unresolved reference price has no public product projection');
   const catalog=rpc(`saas.public_catalog_query_v2('${HOST}','${NOW}'::timestamptz,NULL,'','all','featured',48,0)`);
   assert.equal(catalog.outcome,'found');
   assert.equal(catalog.payload.items.some(item=>item.slug==='unpriced-earring'),false);
   assert.equal(catalog.payload.items.some(item=>item.slug==='ring'),true);
   const products=publicCall('public_content_sitemap_page',HOST,`,'products',0`).payload.items;
   assert.equal(products.some(item=>item.path==='/urun/unpriced-earring'),false);
   assert.equal(products.some(item=>item.path==='/urun/ring'),true);
  });
  await check('sitemap rechecks publication, duplicate winners and out-of-range pages',()=>{
   const before=publicCall('public_content_sitemap_page',HOST,`,'content',0`).payload.items;
   assert.equal(before.filter(x=>x.path==='/pages/dupe').length,1);
   assert.equal(before.some(x=>x.path==='/blog/draft' || x.path==='/blog/archive' || x.path==='/blog/foreign'),false);
   owner(`UPDATE saas.merchant_admin_records SET status='archived',archived_at='${NOW}',updated_at='${NOW}' WHERE id='${id(7)}'`);
   assert.equal(publicCall('public_content_sitemap_page',HOST,`,'content',0`).payload.items.some(x=>x.path==='/blog/news'),false);
   assert.equal(publicCall('public_content_sitemap_page',HOST,`,'content',1`).outcome,'not_found');
  });
  await check('legacy invalid slugs are absent from list/sitemap and a sidecar null excerpt stays cleared',()=>{
   seedRecord(28,STORE,'blog_post','Bad Slug','tr','active',true,'2026-09-29T10:00:00.000Z','Invalid blog');
   seedRecord(29,STORE,'blog_post','x'.repeat(101),'tr','active',true,'2026-09-29T10:00:00.000Z','Long slug');
   seedRecord(30,STORE,'page','','tr','active',true,'2026-09-29T10:00:00.000Z','Empty slug page');
   seedRecord(31,STORE,'blog_post','cleared','tr','active',true,'2026-09-29T10:00:00.000Z','Cleared blog');
   owner(`UPDATE saas.merchant_admin_records SET config=config||'{"excerpt":"Stale generic excerpt"}'::jsonb WHERE id='${id(31)}';
     INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description)
     VALUES('${STORE}','${id(31)}',1,'<p>Fresh body</p>','normalized_html','{}'::jsonb,NULL,NULL,NULL)`);
   const list=publicCall('public_blog_list',HOST,`,'tr',20,NULL`).payload.items;
   assert.equal(list.some(item=>item.slug==='Bad Slug'||item.slug==='x'.repeat(101)),false);
   assert.equal(list.find(item=>item.slug==='cleared')?.excerpt,null);
   assert.equal(publicCall('public_blog_get',HOST,`,'Bad Slug','tr'`).outcome,'invalid_input');
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'','tr'`).outcome,'invalid_input');
   const content=publicCall('public_content_sitemap_page',HOST,`,'content',0`).payload.items;
   assert.equal(content.some(item=>item.path.includes('Bad Slug')||item.path.includes('x'.repeat(101))||item.path==='/pages/'),false);
   const detail=publicCall('public_blog_get',HOST,`,'cleared','tr'`).payload;
   assert.equal(detail.excerpt,null);
   assert.match(publicContentSeo(detail,'Content fixture').description,/Fresh body/);
   assert.doesNotMatch(publicContentSeo(detail,'Content fixture').description,/Stale generic excerpt/);
  });
  await check('language and frequency settings fail closed while absent settings use defaults',()=>{
   for(const frequency of ['always','hourly','daily','weekly','monthly','yearly','never']){owner(`UPDATE saas.merchant_admin_records SET config=${json({includeProducts:true,includeContent:true,changeFrequency:frequency})} WHERE id='${id(2)}'`);assert.equal(publicCall('public_content_sitemap_page',HOST,`,'products',0`).payload.items[0].changeFrequency,frequency);}
   for(const bad of [null,'','<xml>']){owner(`UPDATE saas.merchant_admin_records SET config=${json({changeFrequency:bad})} WHERE id='${id(2)}'`);assert.notEqual(sql(`BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT * FROM saas.public_content_sitemap_index('${HOST}','${NOW}');COMMIT;`,DB,true).status,0);}
   owner(`UPDATE saas.merchant_admin_records SET config='{}'::jsonb WHERE id='${id(2)}'`);assert.equal(publicCall('public_content_sitemap_page',HOST,`,'products',0`).payload.items[0].changeFrequency,'weekly');
   owner(`UPDATE saas.merchant_admin_records SET status='draft' WHERE id='${id(1)}'`);assert.deepEqual(publicCall('public_content_locale_get').payload,{defaultLocale:'tr',enabledLocales:['tr']});
   owner(`UPDATE saas.merchant_admin_records SET status='active',config='{"defaultLocale":"en-US","enabledLocales":["tr","en-US"]}'::jsonb WHERE id='${id(1)}'`);
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'about','tr'`).payload.locale,'tr');
   assert.equal(publicCall('public_content_page_get_v2',HOST,`,'missing-locale','en-US'`).payload.locale,'en-US');
   owner(`UPDATE saas.merchant_admin_records SET config='{"defaultLocale":"bad_locale","enabledLocales":["tr"]}'::jsonb WHERE id='${id(1)}'`);
   assert.notEqual(sql(`BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT * FROM saas.public_content_locale_get('${HOST}','${NOW}');COMMIT;`,DB,true).status,0);
  });
  await check('host resolver may only call public functions, raw rows remain private',()=>{
   for(const table of ['merchant_admin_records','merchant_content_bodies','products'])assert.notEqual(sql(`SET ROLE celebix_saas_host_resolver;SELECT * FROM saas.${table} LIMIT 1`,DB,true).status,0);
   for(const fn of [`saas.public_content_locale_config('${STORE}')`,`saas.public_content_sitemap_config('${STORE}')`,`saas.public_content_projection('${STORE}','${id(5)}','tr',true)`])assert.notEqual(sql(`SET ROLE celebix_saas_host_resolver;SELECT ${fn}`,DB,true).status,0);
  });
  apply(DOWN);assert.equal(scalar("SELECT to_regprocedure('saas.public_blog_get(text,timestamptz,text,text)') IS NULL"),'t');
  console.log(`PASS native public merchant content: ${count} scenarios`);
 }finally{if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);if(root)rmSync(root,{recursive:true,force:true});}
}
await main();
