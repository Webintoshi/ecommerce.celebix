import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,root=path.resolve(dir,'../../../../..');
const UP='202610290290_storefront_product_review_summaries.up.sql',DOWN=UP.replace('.up.','.down.'),ASSERT=UP.replace('.up.','_assertions.');
const signature='saas.public_product_review_summaries(text,timestamptz,uuid[])';
const read=file=>readFileSync(path.join(dir,file),'utf8');
const lit=value=>value===null?'NULL':`'${String(value).replaceAll("'","''")}'`;
const id=n=>`29000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const S=id(1),OTHER=id(2),PRODUCT=id(3),ZERO=id(4),SECOND=id(5),FOREIGN=id(6),DRAFT=id(7),ARCHIVED=id(8),MISSING=id(9);
const HOST='review-summary290.example.test',OTHER_HOST='other-summary290.example.test',NOW='2026-10-29T12:00:00Z';
const PLAN='00000000-0000-4000-8000-000000000010';
const pg=startDisposablePostgres({database:'storefront_review_summaries290'}),{sql}=pg;
const owned=source=>sql('SET ROLE celebix_saas_owner;'+source),j=source=>JSON.parse(sql(source));
const array=ids=>ids===null?'NULL::uuid[]':`ARRAY[${ids.map(value=>lit(value)+'::uuid').join(',')}]::uuid[]`;
const expression=(ids=[PRODUCT],host=HOST,now=NOW)=>`saas.public_product_review_summaries(${lit(host)},${lit(now)}::timestamptz,${array(ids)})`;
const native=call=>j(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r) FROM ${call} r`);
const summary=(ids,host,now)=>native(expression(ids,host,now));
const availability=(product=PRODUCT,host=HOST)=>native(`saas.public_product_page_review_availability(${lit(host)},${lit(NOW)},${lit(product)},'[]'::jsonb)`);
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)) FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
const tableAuthority=()=>j("SELECT jsonb_object_agg(c.oid::regclass::text,jsonb_build_object('owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity)) FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relkind IN('r','p')");
const snapshot=()=>j(`SELECT jsonb_build_object('reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.product_reviews r),'settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.store_id) FROM saas.product_page_review_settings s),'invitations',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM saas.review_collection_requests s))`);
let checks=0;const check=(name,run)=>{run();console.log(`PASS ${++checks} ${name}`);};

try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=286&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 const ownerIndex=process.argv.indexOf('--owner-ref');
 if(ownerIndex>=0){
  const ref=process.argv[ownerIndex+1];assert.match(ref,/^[a-f0-9]{40}$/,'owner baseline must be an exact reviewed commit');
  for(const file of ['202610280287_store_tool_manual_release.up.sql','202610280288_toshi_test_credit_offer.up.sql','202610280289_toshi_public_test_checkout.up.sql']){
   sql(execFileSync('git',['show',`${ref}:apps/owner/scripts/sql/saas/${file}`],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
  }
  console.log(`PASS reviewed owner migrations287..289 baseline ${ref}`);
 }
 const before=catalog(),tablesBefore=tableAuthority();
 check('PostgreSQL16 exact predecessor baseline has no summary entry point',()=>{
  assert.match(sql('SHOW server_version'),/^16\./);
  assert.equal(sql(`SELECT to_regprocedure(${lit(signature)}) IS NULL`),'t');
 });
 sql(read(UP));sql(read(ASSERT));
 const withoutSummary=()=>{const after=catalog();delete after[sql(`SELECT ${lit(signature)}::regprocedure::text`)];return after;};
 check('additive installation preserves all prior routines, private table ownership and permissions',()=>{
  assert.deepEqual(withoutSummary(),before);assert.deepEqual(tableAuthority(),tablesBefore);
 });
 check('disposable down and reapply restore every previous routine and remove only the new index',()=>{
  sql(read(DOWN));assert.deepEqual(catalog(),before);assert.deepEqual(tableAuthority(),tablesBefore);
  assert.equal(sql("SELECT to_regclass('saas.product_reviews_approved_product_summary_idx') IS NULL"),'t');
  sql(read(UP));sql(read(ASSERT));assert.deepEqual(withoutSummary(),before);
 });
 owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
  ('${S}','Review summary fixture','review-summary290','active','tr','TRY','starter','2026-01-01','2026-01-01'),
  ('${OTHER}','Foreign review summary fixture','other-summary290','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
  ('${id(10)}','${S}','${PLAN}','professional',2,'active','2026-01-01','2026-01-01','2026-01-01'),
  ('${id(11)}','${OTHER}','${PLAN}','professional',2,'active','2026-01-01','2026-01-01','2026-01-01');
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
  ('${id(12)}','${S}','${HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
  ('${id(13)}','${OTHER}','${OTHER_HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,archived_at,created_at,updated_at) VALUES
  ${[[PRODUCT,S,'active'],[ZERO,S,'active'],[SECOND,S,'active'],[FOREIGN,OTHER,'active'],[DRAFT,S,'draft'],[ARCHIVED,S,'archived']].map(([product,store,status])=>`('${product}','${store}','product-${product}','Review summary fixture','${status}','TRY',1,${status==='archived'?"'2026-10-01'":'NULL'},'2026-01-01','2026-10-01')`).join(',')};`);
 check('missing merchant setting defaults off and matches existing public availability',()=>{
  assert.deepEqual(summary().result_payload,{enabled:false,items:[]});
  assert.deepEqual(availability().result_payload,{enabled:false});
 });
 owned(`INSERT INTO saas.product_page_review_settings(store_id,enabled,version,updated_at) VALUES('${S}',true,1,'${NOW}'),('${OTHER}',true,1,'${NOW}')`);
 check('enabled unrated products have a real zero summary and empty batches remain valid',()=>{
  assert.deepEqual(summary([ZERO]),{outcome:'found',result_payload:{enabled:true,items:[{productId:ZERO,averageRating:0,reviewCount:0}]}});
  assert.deepEqual(summary([]),{outcome:'found',result_payload:{enabled:true,items:[]}});
  assert.equal(availability(ZERO).result_payload.enabled,true);
 });
 owned(`INSERT INTO saas.product_reviews(id,store_id,product_id,reviewer_name,rating,review_body,status,version,archived_at,created_at,updated_at) VALUES
  ${Array.from({length:24},(_,n)=>`('${id(100+n)}','${S}','${PRODUCT}','Fixture approved customer',5,'Approved fixture','approved',1,NULL,'2026-10-28','2026-10-28')`).join(',')},
  ('${id(124)}','${S}','${PRODUCT}','Old approved customer',1,'Old approved review beyond the latest twenty','approved',1,NULL,'2026-01-01','2026-01-01'),
  ('${id(125)}','${S}','${PRODUCT}','Long approved customer',4,repeat('x',3000),'approved',1,NULL,'2026-01-02','2026-01-02'),
  ('${id(126)}','${S}','${PRODUCT}','Private pending customer',1,'PRIVATE_PENDING_BODY','pending',1,NULL,'2026-10-28','2026-10-28'),
  ('${id(127)}','${S}','${PRODUCT}','Private rejected customer',1,'PRIVATE_REJECTED_BODY','rejected',1,NULL,'2026-10-28','2026-10-28'),
  ('${id(128)}','${S}','${PRODUCT}','Private archived customer',1,'PRIVATE_ARCHIVED_BODY','archived',1,'2026-10-28','2026-10-28','2026-10-28'),
  ('${id(129)}','${S}','${SECOND}','Second customer',3,'Second approved fixture','approved',1,NULL,'2026-10-28','2026-10-28'),
  ('${id(130)}','${OTHER}','${FOREIGN}','Foreign customer',1,'FOREIGN_PRIVATE_BODY','approved',1,NULL,'2026-10-28','2026-10-28'),
  ('${id(131)}','${S}','${DRAFT}','Draft customer',1,'DRAFT_PRIVATE_BODY','approved',1,NULL,'2026-10-28','2026-10-28'),
  ('${id(132)}','${S}','${ARCHIVED}','Archived customer',1,'ARCHIVED_PRIVATE_BODY','approved',1,NULL,'2026-10-28','2026-10-28');`);
 check('all approved reviews contribute beyond the latest twenty, including long legacy content',()=>{
  const item=summary().result_payload.items[0];assert.equal(item.reviewCount,26);assert.ok(Math.abs(item.averageRating-125/26)<1e-12);
  const detailAverage=Number(sql(`SELECT avg(rating) FROM(SELECT rating FROM saas.product_reviews WHERE store_id='${S}' AND product_id='${PRODUCT}' AND status='approved' ORDER BY created_at DESC,id DESC LIMIT 20) r`));
  assert.equal(detailAverage,5);assert.notEqual(item.averageRating,detailAverage);
 });
 check('pending, rejected and archived reviews never affect the public count or average',()=>{
  const result=summary();assert.equal(result.result_payload.items[0].reviewCount,26);
  assert.equal(sql(`SELECT count(*) FROM saas.product_reviews WHERE store_id='${S}' AND product_id='${PRODUCT}'`),'29');
  assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
 });
 check('one batch deduplicates product IDs in first-request order and carries independent summaries',()=>{
  const items=summary([ZERO,SECOND,PRODUCT,ZERO,SECOND]).result_payload.items;
  assert.deepEqual(items.map(item=>item.productId),[ZERO,SECOND,PRODUCT]);
  assert.deepEqual(items[1],{productId:SECOND,averageRating:3,reviewCount:1});
  assert.deepEqual(Object.keys(items[2]).sort(),['averageRating','productId','reviewCount']);
 });
 check('foreign, absent, draft and archived product IDs cannot acquire public summary rows',()=>{
  const input=[FOREIGN,MISSING,DRAFT,ARCHIVED,PRODUCT];assert.deepEqual(summary(input).result_payload.items.map(item=>item.productId),[PRODUCT]);
  assert.deepEqual(summary(input,OTHER_HOST).result_payload.items,[{productId:FOREIGN,averageRating:1,reviewCount:1}]);
  assert.deepEqual(summary([FOREIGN,DRAFT,ARCHIVED,MISSING]).result_payload,{enabled:true,items:[]});
  for(const product of [FOREIGN,DRAFT,ARCHIVED,MISSING])assert.deepEqual(availability(product).result_payload,{enabled:false});
 });
 check('merchant disable hides all summaries in that store and leaves invitation settings untouched',()=>{
  const invitations=sql('SELECT count(*) FROM saas.review_collection_settings');
  owned(`UPDATE saas.product_page_review_settings SET enabled=false,version=version+1 WHERE store_id='${S}'`);
  assert.deepEqual(summary([PRODUCT,ZERO]).result_payload,{enabled:false,items:[]});assert.deepEqual(availability().result_payload,{enabled:false});
  assert.equal(summary([FOREIGN],OTHER_HOST).result_payload.enabled,true);assert.equal(sql('SELECT count(*) FROM saas.review_collection_settings'),invitations);
  owned(`UPDATE saas.product_page_review_settings SET enabled=true,version=version+1 WHERE store_id='${S}'`);
 });
 check('malformed, unknown and untrusted hostnames are unavailable through the existing host authority',()=>{
  for(const host of [null,'unknown-summary290.example.test',HOST.toUpperCase(),HOST+':443','https://'+HOST,HOST+'/']){
   assert.deepEqual(summary([PRODUCT],host),{outcome:'unavailable',result_payload:null});
   assert.equal(availability(PRODUCT,host).outcome,'unavailable');
  }
 });
 check('invalid times, null arrays, null IDs, multidimensional arrays and raw batches over500 fail closed',()=>{
  for(const now of [null,'infinity','-infinity'])assert.deepEqual(summary([PRODUCT],HOST,now),{outcome:'invalid_input',result_payload:null});
  for(const ids of [null,[null],Array(501).fill(PRODUCT)])assert.deepEqual(summary(ids),{outcome:'invalid_input',result_payload:null});
  assert.deepEqual(native(`saas.public_product_review_summaries('${HOST}','${NOW}',ARRAY[ARRAY['${PRODUCT}'::uuid]])`),{outcome:'invalid_input',result_payload:null});
 });
 check('invalid UUID text is rejected by the typed database boundary without reading private rows',()=>{
  const before=snapshot();assert.throws(()=>native(`saas.public_product_review_summaries('${HOST}','${NOW}',ARRAY['malformed-product-id']::uuid[])`),/invalid input syntax for type uuid/);assert.deepEqual(snapshot(),before);
 });
 const bounded=Array.from({length:500},(_,n)=>id(1000+n));
 owned(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES ${bounded.map(product=>`('${product}','${S}','product-${product}','Bounded product fixture','active','TRY',1,'2026-01-01','2026-01-01')`).join(',')}`);
 check('the maximum500 distinct products return exactly500 zero summaries in input order',()=>{
  const result=summary(bounded);assert.equal(result.outcome,'found');assert.equal(result.result_payload.items.length,500);
  assert.deepEqual(result.result_payload.items.map(item=>item.productId),bounded);
  assert.ok(result.result_payload.items.every(item=>item.averageRating===0&&item.reviewCount===0));
 });
 check('store suspension and inactive or future-verified domains match availability host gates',()=>{
  for(const mutation of [
   `UPDATE saas.stores SET status='suspended' WHERE id='${S}'`,
   `UPDATE saas.store_domains SET status='disabled',is_primary=false,version=version+1 WHERE store_id='${S}'`,
   `UPDATE saas.store_domains SET verified_at='2026-10-30',version=version+1 WHERE store_id='${S}'`,
  ]){
   const result=j(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${mutation};SET LOCAL ROLE celebix_saas_host_resolver;
    SELECT jsonb_build_object('summary',(SELECT to_jsonb(r) FROM ${expression()} r),'availability',(SELECT to_jsonb(r) FROM saas.public_product_page_review_availability('${HOST}','${NOW}','${PRODUCT}','[]') r));ROLLBACK;`);
   assert.deepEqual(result.summary,{outcome:'unavailable',result_payload:null});assert.equal(result.availability.outcome,'unavailable');
  }
 });
 check('subscription state changes retain the existing public availability semantics',()=>{
  const result=j(`BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.subscriptions SET status='expired' WHERE store_id='${S}';SET LOCAL ROLE celebix_saas_host_resolver;
   SELECT jsonb_build_object('summary',(SELECT result_payload FROM ${expression()}),'availability',(SELECT result_payload FROM saas.public_product_page_review_availability('${HOST}','${NOW}','${PRODUCT}','[]')));ROLLBACK;`);
  assert.equal(result.summary.enabled,result.availability.enabled);assert.equal(result.summary.enabled,true);
 });
 check('the projection is read-only and keeps all private records, settings and prior routines exact',()=>{
  const beforeRows=snapshot();const result=j(`BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_host_resolver;SELECT to_jsonb(r) FROM ${expression()} r;COMMIT;`);
  assert.equal(result.result_payload.items[0].reviewCount,26);assert.deepEqual(snapshot(),beforeRows);
  assert.deepEqual(withoutSummary(),before);assert.deepEqual(tableAuthority(),tablesBefore);sql(read(ASSERT));
 });
 check('only the host resolver can execute the new routine and private review tables stay inaccessible',()=>{
  const roles=j("SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner'");
  for(const role of roles){
   if(role!=='celebix_saas_host_resolver')assert.throws(()=>sql(`SET ROLE ${role};SELECT * FROM ${expression()}`),/permission denied/);
   for(const table of ['product_reviews','product_page_review_settings','product_page_review_submissions','review_collection_requests']){
    assert.equal(sql(`SELECT has_table_privilege('${role}','saas.${table}','SELECT,INSERT,UPDATE,DELETE')`),'f');
   }
  }
 });
 if(process.argv.includes('--manifest'))console.log(sql(`SELECT jsonb_build_object('signature',p.oid::regprocedure::text,'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'sourceSha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'acl',p.proacl::text) FROM pg_proc p WHERE p.oid=${lit(signature)}::regprocedure`));
 console.log(`Native storefront product review summaries290: ${checks} checks passed; ${Object.keys(before).length} prior routines exact`);
}finally{pg.stop();}
