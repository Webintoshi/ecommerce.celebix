// Socket-only disposable PostgreSQL authority checks; never connects to a configured database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';

const migration='202610150238_cashier_catalog_analytics',sqlDir=new URL('../../../apps/owner/scripts/sql/saas/',import.meta.url);
const fixture=startAccountingFixture(237),{value,sql}=fixture;
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const store=randomUUID(),other=randomUUID(),principal=randomUUID(),member=randomUUID(),plan='00000000-0000-4000-8000-000000000001',product=randomUUID(),variant=randomUUID();
const extra=Array.from({length:4},()=>({principal:randomUUID(),member:randomUUID()})),depot=randomUUID(),stamp='2026-01-01T00:00:00Z';
const authority=(target=store)=>`${lit(target)},${lit(principal)},${lit(member)},${lit(plan)},'free_starter',1`;
const catalog=(target=store)=>`${authority(target)},100,transaction_timestamp()`;
const merchant=(action,target=store,feature='catalog')=>value(`SET ROLE celebix_saas_owner;SELECT coalesce(saas.merchant_action_authority_error(${authority(target)},transaction_timestamp(),${lit(feature)},${lit(action)}),'allowed')`);
const call=expression=>JSON.parse(value(`SET ROLE celebix_saas_app;SELECT row_to_json(r) FROM ${expression} r`));
const create=(target=store,p=product,v=variant)=>`saas.catalog_create_product(${catalog(target)},'${randomUUID()}','${'a'.repeat(64)}','${p}','${v}','cashier-product','Cashier product',NULL,'active','TRY','Default',NULL,NULL,10000,NULL,NULL,false,0,'{}'::jsonb)`;
const grants=()=>JSON.parse(value(`SELECT jsonb_agg(to_jsonb(g) ORDER BY membership_id) FROM saas.in_store_staff_grants g WHERE store_id='${store}'`));
const functions=()=>value("SELECT jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(oid),'oid',oid,'owner',proowner,'acl',proacl,'config',proconfig)) FROM pg_proc WHERE oid IN('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)'::regprocedure,'saas.catalog_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)'::regprocedure)");
let checks=0;const check=(label,run)=>{run();console.log(`PASS ${++checks} ${label}`);};
try{
 sql(`SET ROLE celebix_saas_owner;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${store}','Cashier238','cashier238','active','tr','TRY','starter',now(),now()),('${other}','Other238','other238','active','tr','TRY','starter',now(),now());
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${principal}','https://identity.example.test','cashier238','cashier238@example.test',true,now(),now());
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${member}','${principal}','${store}','cashier','active',now(),now());
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${randomUUID()}','${store}','${plan}','free_starter',1,'active','2026-01-01',now(),now());
 INSERT INTO saas.in_store_staff_grants(store_id,membership_id,enabled,location_ids,discount_limit_bps,version,updated_at,can_collect_receivables) VALUES('${store}','${member}',true,ARRAY['${depot}']::uuid[],1500,4,'${stamp}',false);
 ${extra.map((x,i)=>`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${x.principal}','https://identity.example.test','extra238-${i}','extra238-${i}@example.test',true,now(),now());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${x.member}','${x.principal}','${store}','${i===2?'editor':'cashier'}','${i===1?'revoked':'active'}',now(),now());INSERT INTO saas.in_store_staff_grants(store_id,membership_id,enabled,location_ids,discount_limit_bps,version,updated_at,can_collect_receivables) VALUES('${store}','${x.member}',${i!==0},ARRAY['${depot}']::uuid[],500,7,'${stamp}',${i===3});`).join('\n')}`);
 const originalFunctions=functions(),originalGrants=grants();
 if(!process.argv.includes('--baseline')&&existsSync(new URL(migration+'.up.sql',sqlDir)))sql(readFileSync(new URL(migration+'.up.sql',sqlDir),'utf8'));
 check('cashier receives precisely catalog lifecycle, analytics and existing register actions',()=>{
  for(const action of ['catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.delete','analytics.read','in_store.read','in_store.sell','in_store.discount'])assert.equal(merchant(action,store,action==='analytics.read'?'analytics':action.startsWith('in_store.')?'orders':'catalog'),'allowed',action);
  for(const action of ['catalog_admin.import','catalog_admin.moderate','orders.read','orders.manage','orders.payment','orders.delete','carts.read','carts.manage','customers.read','customers.manage','configuration.read','configuration.manage','integrations.read','inventory.read','pricing.read','in_store.staff','in_store.resolve'])assert.equal(merchant(action),'membership_denied',action);
 });
 check('collection backfill changes only enabled active cashier grants and increments their version',()=>{
  const current=grants();
  for(const previous of originalGrants){const actual=current.find(x=>x.membership_id===previous.membership_id);if(previous.membership_id===member){assert.equal(actual.can_collect_receivables,true);assert.equal(actual.version,previous.version+1);assert.notEqual(actual.updated_at,previous.updated_at);for(const key of Object.keys(previous).filter(k=>!['can_collect_receivables','version','updated_at'].includes(k)))assert.deepEqual(actual[key],previous[key],key);}else assert.deepEqual(actual,previous);}
  assert.equal(value("SELECT column_default FROM information_schema.columns WHERE table_schema='saas' AND table_name='in_store_staff_grants' AND column_name='can_collect_receivables'"),'true');
 });
 check('cashier creates and reads a product through the real catalog boundaries',()=>{
  assert.equal(call(create()).outcome,'created');
  assert.equal(call(`saas.catalog_get_product_details(${catalog()},'${product}',false)`).outcome,'found');
 });
 check('cashier updates, archives and restores a product with current versions',()=>{
  assert.equal(call(`saas.catalog_update_product(${catalog()},'${randomUUID()}','${'b'.repeat(64)}','${product}',1,'cashier-product','Updated product',NULL,'active','TRY')`).outcome,'updated');
  assert.equal(call(`saas.catalog_archive_product(${catalog()},'${randomUUID()}','${'c'.repeat(64)}','${product}',2)`).outcome,'archived');
  assert.equal(call(`saas.catalog_restore_product(${catalog()},'${randomUUID()}','${'d'.repeat(64)}','${product}',3)`).outcome,'restored');
 });
 check('cashier removal preserves existing inventory dependencies and deletes an eligible product',()=>{
  // Current create RPCs add inventory references, which SQL144 deliberately preserves.
  // Exercise the same eligible legacy product shape as the existing deletion harness.
  assert.equal(call(`saas.delete_product(${catalog()},'${randomUUID()}','${'e'.repeat(64)}','${product}',4,'Updated product')`).outcome,'cleanup_failed');
  assert.equal(value(`SELECT count(*) FROM saas.products WHERE id='${product}'`),'1');
  const eligible=randomUUID(),operation=randomUUID();
  sql(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${eligible}','${store}','eligible-legacy','Eligible legacy','draft','TRY',1,now(),now())`);
  const expression=`saas.delete_product(${catalog()},'${operation}','${'f'.repeat(64)}','${eligible}',1,'Eligible legacy')`;
  assert.equal(call(expression).outcome,'deleted');assert.equal(call(expression).outcome,'operation_replayed');assert.equal(value(`SELECT count(*) FROM saas.products WHERE id='${eligible}'`),'0');
 });
 check('editor dependency reads use catalog/media authority without opening import or settings',()=>{
  assert.equal(value(`SET ROLE celebix_saas_owner;SELECT coalesce(saas.media_read_authority_error(${authority()},(SELECT effective_limit FROM saas.plan_limits WHERE plan_id='${plan}' AND limit_key='storageBytes'),transaction_timestamp()),'allowed')`),'allowed');
  assert.equal(call(`saas.catalog_admin_authorize_feed_preview(${authority()},transaction_timestamp())`).outcome,'membership_denied');
  assert.equal(call(`saas.orders_get(${authority()},transaction_timestamp(),'${randomUUID()}')`).outcome,'membership_denied');
  assert.equal(call(`saas.merchant_admin_list(${authority()},transaction_timestamp(),'payment_setting')`).outcome,'membership_denied');
 });
 check('cross-tenant and revoked cashier requests retain durable denial',()=>{
  assert.equal(call(create(other,randomUUID(),randomUUID())).outcome,'membership_denied');
  assert.equal(merchant('catalog_admin.read',other),'membership_denied');
  sql(`UPDATE saas.memberships SET status='revoked' WHERE id='${member}'`);assert.equal(call(create()).outcome,'membership_denied');sql(`UPDATE saas.memberships SET status='active' WHERE id='${member}'`);
 });
 check('catalog still requires the exact active plan feature and product limit',()=>{
  assert.equal(value(`SET ROLE celebix_saas_owner;SELECT saas.catalog_authority_error(${authority()},99,transaction_timestamp())`),'durable_authority_invalid');
  sql(`UPDATE saas.subscriptions SET status='inactive' WHERE store_id='${store}'`);assert.equal(call(create()).outcome,'durable_authority_invalid');sql(`UPDATE saas.subscriptions SET status='active' WHERE store_id='${store}'`);
 });
 check('migration assertions preserve definer ownership, ACLs and exact published sources',()=>sql(readFileSync(new URL(migration+'_assertions.sql',sqlDir),'utf8')));
 check('rollback refuses to overwrite later explicit collection choices',()=>{
  const migrated=grants().find(x=>x.membership_id===member);
  sql(`UPDATE saas.in_store_staff_grants SET can_collect_receivables=false,version=version+1 WHERE membership_id='${member}'`);
  const rejected=sql(readFileSync(new URL(migration+'.down.sql',sqlDir),'utf8'),true);
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/CASHIER238_ROLLBACK_GRANT_CHANGED/);
  assert.equal(grants().find(x=>x.membership_id===member).can_collect_receivables,false);assert.equal(merchant('catalog_admin.read'),'allowed');
  sql(`UPDATE saas.in_store_staff_grants SET can_collect_receivables=true,version=${migrated.version} WHERE membership_id='${member}'`);
 });
 check('rollback restores exact functions/default/grants without undoing product history',()=>{
  sql(readFileSync(new URL(migration+'.down.sql',sqlDir),'utf8'));assert.equal(functions(),originalFunctions);assert.deepEqual(grants(),originalGrants);
  assert.equal(value("SELECT column_default FROM information_schema.columns WHERE table_schema='saas' AND table_name='in_store_staff_grants' AND column_name='can_collect_receivables'"),'false');
  assert.equal(value(`SELECT count(*) FROM saas.record_deletion_operations WHERE store_id='${store}'`),'1');assert.equal(merchant('catalog_admin.read'),'membership_denied');
  sql(readFileSync(new URL(migration+'.up.sql',sqlDir),'utf8'));sql(readFileSync(new URL(migration+'_assertions.sql',sqlDir),'utf8'));
 });
 console.log(`CASHIER238_NATIVE_PASS ${checks}/${checks}`);
}finally{fixture.stop();}
