import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statfsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { homedir } from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SQL = path.join(ROOT, 'apps/owner/scripts/sql/saas');
const BIN = process.env.POSTGRES_BIN ?? path.join(homedir(), '.codex/tmp/postgresql-16.14-install/bin');
const UP = '202609090127_orders_qa_archive.up.sql';
const store = '10000000-0000-4000-8000-000000000089';
const other = '10000000-0000-4000-8000-000000000090';
const principal = '20000000-0000-4000-8000-000000000089';
const member = '30000000-0000-4000-8000-000000000089';
const plan = '00000000-0000-4000-8000-000000000001';
const now = '2026-09-09T12:00:00.000Z';
const order = n => `80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const op = n => `90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const authority = (selected = store) => `'${selected}','${principal}','${member}','${plan}','free_starter',1,'${now}'`;
const available = () => { const s = statfsSync(ROOT); return s.bavail * s.bsize; };
assert.ok(available() >= 5e9, 'Minimum 5GB free disk');
console.log(`disk-before=${available()}`);
const root = mkdtempSync('/tmp/orders-archive-');
const socket = path.join(root,'socket'); mkdirSync(socket);
const data = path.join(root,'data');
const port = 20000 + Math.floor(Math.random()*10000);
function command(name,args,input='',allow=false) {
  const r = spawnSync(path.join(BIN,name),args,{input,encoding:'utf8',maxBuffer:32*1024*1024,env:{PATH:process.env.PATH,LC_ALL:'C'}});
  if(r.error) throw r.error;
  if(!allow && r.status!==0) throw new Error(r.stderr);
  return r;
}
const args = ['-h',socket,'-p',String(port),'-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
const sql = (s,allow=false) => command('psql',args,s,allow);
function asyncSql(s) { return new Promise((resolve,reject) => {
  const child = spawn(path.join(BIN,'psql'),args,{env:{PATH:process.env.PATH,LC_ALL:'C'}});
  let out='',err=''; child.stdout.on('data',s=>out+=s); child.stderr.on('data',s=>err+=s);
  child.on('error',reject); child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err))); child.stdin.end(s);
}); }
const expr = (fn,n=1,operation=1,reason='qa fixture',evidence='qa/archive-fixture') => `saas.orders_${fn}(${authority()},'${op(operation)}','${order(n)}','${reason}','${evidence}')`;
const rpcSql = expression => `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`;
const rpc = expression => JSON.parse(sql(rpcSql(expression)).stdout.trim());
const digest = () => {
 const tables=sql(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relkind='r' AND c.relname NOT IN ('order_archive_operations','order_archive_state') ORDER BY c.relname;`).stdout.trim().split('\n');
 return sql(tables.map(table=>`SELECT '${table}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) FROM ${table} t;`).join('\n')).stdout.trim();
};
let count=0;
const pass = name => console.log(`PASS ${++count} ${name}`);
try {
 command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);
 command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'log'),'start']);
 assert.match(sql('SHOW server_version;').stdout,/^16\./);
 const files = readdirSync(SQL).filter(f=> /^\d{12}/.test(f) && !f.includes('.down.') && Number(f.slice(8,12))<=126 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12)) || a.localeCompare(b));
 for(const f of files.filter(f=>!f.includes('seed_guzide_pilot_admin_domain'))) {
   if(process.env.ARCHIVE_TOOL_INTEGRATION==='1' && f==='202608050089_order_transactional_email.up.sql') {
     const { seedExactAllowlistBeforeEmailMigration }=await import('../../../scripts/atlas-orders-qa-archive-postgres-fixture.mjs');
     await seedExactAllowlistBeforeEmailMigration({socket,port});
   }
   sql(readFileSync(path.join(SQL,f),'utf8'));
 }
 sql(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${principal}','https://identity.example.test/oidc','archive-owner','owner@example.test',true,'2026-01-01','2026-01-01');
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${store}','Archive','archive-fixture','active','tr','TRY','hemenaku','2026-01-01','2026-01-01'),('${other}','Other','archive-other','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${member}','${principal}','${store}','store_owner','active','2026-01-01','2026-01-01');
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('40000000-0000-4000-8000-000000000089','${store}','${plan}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');`);
 for(let n=1;n<=4;n++) sql(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES('${order(n)}','${store}','CX-${n}','manual_import','QA Fixture','fixture@example.test','TRY',12000,0,0,12000,'pending','pending','{}',1,'${now}','${now}');`);
 sql(`INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES('${op(60)}','${store}','${order(4)}',0,'History fixture',12000,1,0,12000,'${now}');
 INSERT INTO saas.order_events(id,store_id,order_id,event_type,message,payload,created_at) VALUES('${op(61)}','${store}','${order(4)}','order_created','Fixture','{}','${now}');
 INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES('${op(62)}','${store}','${order(4)}','update_shipping','${'a'.repeat(64)}','{}','${now}');
 INSERT INTO saas.order_drafts(id,store_id,draft_number,status,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_address,billing_address,adjust_inventory,converted_order_id,version,created_at,updated_at) VALUES('${op(63)}','${store}','DRAFT-1','converted','QA Fixture','qa@example.test','TRY',12000,0,0,12000,'{"recipientName":"QA","line1":"Fixture","city":"Istanbul","country":"TR"}','{"recipientName":"QA","line1":"Fixture","city":"Istanbul","country":"TR"}',false,'${order(4)}',2,'${now}','${now}');
 INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES('${op(64)}','${store}','${op(63)}','convert','${'b'.repeat(64)}','{}','${now}');`);
 const before = digest();
 const retired = sql(`\\set apply 1\n${readFileSync(path.join(ROOT,'scripts/atlas-orders-qa-cleanup.sql'),'utf8')}`,true);
 assert.notEqual(retired.status,0); assert.match(retired.stderr,/ORDERS_QA_PHYSICAL_DELETE_RETIRED/); assert.equal(digest(),before); pass('obsolete physical deletion entrypoint is retired');
 if(process.env.ARCHIVE_RETIREMENT_ONLY==='1') process.exitCode=0;
 else {
 const migration = readdirSync(SQL).includes(UP); assert.ok(migration,'archive migration must exist');
 sql(readFileSync(path.join(SQL,UP),'utf8'));
 sql(readFileSync(path.join(SQL,UP.replace('.up.sql','_assertions.sql')),'utf8'));
 const eligibility = rpc(`saas.orders_archive_eligibility(${authority()},'${order(4)}')`);
 assert.equal(eligibility.result.eligible,true); pass('real migrations establish eligible fixture');
 const archived = rpc(expr('archive',4)); assert.equal(archived.outcome,'archived'); assert.equal(archived.result.archived,true); assert.equal(digest(),before); pass('archive writes only separate metadata and audit');
 const list = fn => rpc(`saas.${fn}(${authority()},NULL,'QA Fixture','newest',1,NULL,NULL,NULL)`);
 assert.equal(list('orders_list').result.items[0].id,order(3)); assert.ok(list('orders_list').result.nextCursor);
 assert.equal(list('orders_list_archived').result.items[0].id,order(4)); pass('active filtering occurs before LIMIT and search; archive has separate query');
 assert.equal(rpc(`saas.orders_get_neighbors(${authority()},'${order(3)}')`).result.previous,undefined);
 assert.equal(rpc(`saas.orders_get_neighbors(${authority()},'${order(4)}')`).outcome,'order_not_found'); pass('active neighbors exclude archived orders');
 assert.equal(rpc(`saas.orders_get(${authority()},'${order(4)}')`).result.archive,undefined);
 assert.equal(rpc(`saas.orders_get_with_archive(${authority()},'${order(4)}')`).result.archive.archived,true); pass('new detail exposes archive indicator while legacy function preserves exact shape');
 assert.equal(rpc(expr('archive',4)).outcome,'operation_replayed');
 assert.equal(rpc(expr('archive',3)).outcome,'operation_mismatch');
 assert.equal(rpc(expr('archive',4,1,'changed reason')).outcome,'operation_mismatch'); pass('replay is immutable and rejects changed target or intent');
 assert.equal(rpc(`saas.orders_archive_eligibility(${authority(other)},'${order(4)}')`).outcome,'membership_denied');
 sql(`UPDATE saas.memberships SET role='analyst' WHERE id='${member}';`);
 assert.notEqual(rpc(expr('restore',4,2)).outcome,'restored'); assert.notEqual(list('orders_list_archived').outcome,'listed');
 sql(`UPDATE saas.memberships SET role='store_owner' WHERE id='${member}';`); pass('tenant and manage authority enforced');
 const concurrent = await Promise.all([asyncSql(rpcSql(expr('restore',4,2))),asyncSql(rpcSql(expr('restore',4,2)))]);
 assert.deepEqual(concurrent.map(s=>JSON.parse(s).outcome).sort(),['operation_replayed','restored']);
 assert.equal(sql('SELECT count(*) FROM saas.order_archive_operations;').stdout.trim(),'2');
 assert.equal(list('orders_list').result.items[0].id,order(4)); assert.equal(digest(),before); pass('concurrent restore replays once and preserves all history');
 sql(`SET ROLE celebix_saas_owner; CREATE TABLE saas.archive_fixture_dependency(store_id uuid,order_id uuid,FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id)); INSERT INTO saas.archive_fixture_dependency VALUES('${store}','${order(1)}');`);
 const effectBefore=digest();
 assert.equal(rpc(expr('archive',1,20)).outcome,'invalid_transition'); assert.equal(digest(),effectBefore); pass('new unknown order dependency blocks without history changes');
 const pending=`INSERT INTO saas.order_email_deliveries(id,store_id,order_id,order_event_id,event_type,recipient_kind,status,next_attempt_at,idempotency_key,created_at,updated_at) VALUES('${op(70)}','${store}','${order(4)}','${op(61)}','order_received','customer','pending','${now}','order-email/v1/${op(70)}','${now}','${now}');`;
 sql(pending); const emailBefore=digest(); assert.equal(rpc(expr('archive',4,21)).outcome,'invalid_transition'); assert.equal(digest(),emailBefore); pass('actual active notification blocks without cancelling or sending');
 // A dependency committed while archive waits must be observed after lock acquisition.
 const inserted = asyncSql(`BEGIN;SET LOCAL application_name='archive_dependency_barrier'; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.archive_fixture_dependency VALUES('${store}','${order(2)}'); SELECT pg_sleep(1); COMMIT;`);
 for(let i=0;;i++) {
   const held=sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='archive_dependency_barrier' AND wait_event='PgSleep');").stdout.trim();
   if(held==='t')break;
   assert.ok(i<100,'dependency lock barrier must become visible');
   await new Promise(resolve=>setTimeout(resolve,10));
 }
 const racing = asyncSql(rpcSql(expr('archive',2,22)));
 await inserted; assert.equal(JSON.parse(await racing).outcome,'invalid_transition'); pass('concurrent dependency insert cannot bypass locked recheck');
 const independent = await Promise.all([asyncSql(rpcSql(expr('archive',3,23))),asyncSql(rpcSql(expr('archive',3,24)))]);
 assert.deepEqual(independent.map(s=>JSON.parse(s).outcome).sort(),['archived','invalid_transition']); pass('distinct concurrent operations serialize per order');
 assert.notEqual(sql('SET ROLE celebix_saas_app;SELECT * FROM saas.order_archive_state;',true).status,0);
 assert.notEqual(sql('UPDATE saas.order_archive_operations SET reason=reason;',true).status,0);
 assert.notEqual(sql('UPDATE saas.order_draft_operations SET committed_at=committed_at;',true).status,0);
 assert.notEqual(sql('DELETE FROM saas.order_draft_operations;',true).status,0);
 assert.notEqual(sql(`INSERT INTO saas.order_archive_operations(store_id,operation_id,order_id,principal_id,membership_id,action,reason,evidence_reference,changed_at,result_payload) VALUES('${other}','${op(98)}','${order(1)}','${principal}','${member}','archive','fixture','qa/fixture','${now}','{}');`,true).status,0);
 assert.notEqual(sql(`INSERT INTO saas.order_archive_state(store_id,order_id,archived,operation_id,changed_at) VALUES('${other}','${order(1)}',true,'${op(99)}','${now}');`,true).status,0); pass('restricted grants, immutable audit and composite tenant FK');
 if(process.env.ARCHIVE_TOOL_INTEGRATION==='1') {
   const { verifyArchiveToolInPostgres }=await import('../../../scripts/atlas-orders-qa-archive-postgres-fixture.mjs');
   await verifyArchiveToolInPostgres({socket,port,bin:BIN});
 }
 }
} finally {
 command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);
 rmSync(root,{recursive:true,force:true}); console.log(`disk-after=${available()}`);
}
