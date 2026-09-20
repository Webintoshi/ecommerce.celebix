// Disposable-only integration fixture. Never import this from the application.
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import pg from 'pg';
import { PostgresOrderRepository } from '../packages/saas-data/src/orders/repository.ts';
import { runOrdersQaArchive } from './atlas-orders-qa-archive.mjs';

const STORE = 'a828862c-4cc1-475a-89cc-5fbee31eb43f';
const IDS = ['af1982e0-c3f2-5f39-8509-8e0250394b13', '0e8bca85-e87c-5a82-8a4e-d615b6d4df29'];
const DRAFTS = ['195bbbd8-f7f6-46ca-a83a-6e15e30eac23', '3355619c-9e3c-4296-8d7e-8a6848cf54eb'];
const CREATED = ['2026-08-01T15:36:36.656Z', '2026-08-01T15:37:26.880Z'];
const PROTECTED = ['a53947fb-e99f-4be5-8d05-5c5cf4eeeb4e', 'a5de1e47-404a-5e90-89c2-2fa9da177a4f', '3f8fb0cc-3d25-4bea-aca7-569bc01f9cd6'];
const MEMBER = 'b2222222-2222-4222-8222-222222222222';
const PRINCIPAL = 'b1111111-1111-4111-8111-111111111111';
const PLAN = '00000000-0000-4000-8000-000000000001';
const DATABASE = 'celebix_saas_staging_auth01';
const uid = n => `c0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const address = JSON.stringify({ recipientName:'QA Fixture', line1:'Disposable fixture', city:'Fixture', country:'TR' });

async function digest(pool) {
  const { rows } = await pool.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relkind='r' AND c.relname NOT IN ('order_archive_state','order_archive_operations') ORDER BY c.relname");
  const snapshot = {};
  for (const {relname} of rows) {
    assert.match(relname,/^[a-z][a-z0-9_]*$/);
    snapshot[relname] = (await pool.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) AS digest FROM saas."${relname}" t`)).rows[0];
  }
  return snapshot;
}

function connectionConfig(socket,port) {
  assert.match(realpathSync(socket),/^\/(?:private\/)?tmp\/orders-archive-[^/]+\/socket$/,'owned isolated archive socket required');
  assert.ok(Number.isInteger(port) && port >= 20000 && port < 30000);
  return { host:socket, port, user:'postgres', password:'', ssl:false, connectionTimeoutMillis:3000, max:2 };
}

// The real targets predate transactional email migration089. Seed at that point
// in the real migration sequence instead of disabling its trigger or deleting
// notifications to manufacture eligibility after the fact.
export async function seedExactAllowlistBeforeEmailMigration({socket,port}) {
  const pool = new pg.Pool({...connectionConfig(socket,port),database:'postgres'});
  try {
    await pool.query(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES($1,'https://identity.example.test','exact-archive-fixture','fixture@example.test',true,'2026-01-01','2026-01-01')`,[PRINCIPAL]);
    await pool.query(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Exact QA Fixture','guzide-kuyumcu-4','active','tr','TRY','hemenaku','2026-01-01','2026-01-01')`,[STORE]);
    await pool.query(`INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active','2026-01-01','2026-01-01')`,[MEMBER,PRINCIPAL,STORE]);
    await pool.query(`INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES($1,$2,$3,'free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01')`,[uid(1),STORE,PLAN]);
    await pool.query(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES($1,$2,'archive-fixture-product','QA fixture product','active','TRY','2026-01-01','2026-01-01')`,[uid(2),STORE]);
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');
      // Exercise the real stock trigger with its normal catalog provenance;
      // no trigger disabling or inventory bypass is used to seed this fixture.
      await seedClient.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time','2026-01-01T00:00:00Z',true)",[uid(4)]);
      await seedClient.query(`INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES($1,$2,$3,'QA fixture variant',9094500,false,0,'active','2026-01-01','2026-01-01')`,[uid(3),uid(2),STORE]);
      await seedClient.query('COMMIT');
    } catch (error) { await seedClient.query('ROLLBACK'); throw error; }
    finally { seedClient.release(); }
    for (const [index,id] of [...IDS,...PROTECTED].entries()) {
      const created = CREATED[index] ?? '2026-08-02T00:00:00.000Z';
      await pool.query(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES($1,$2,$3,'manual','ATLAS QA Fixture','qa@example.test','TRY',9094500,0,0,9094500,'confirmed',$4,$5,1,$6,$6)`,[id,STORE,`MAN-${id.replaceAll('-','').slice(0,20)}`,id===PROTECTED[0]?'completed':'pending',address,created]);
      await pool.query(`INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES($1,$2,$3,$4,$5,0,'QA immutable product snapshot',9094500,1,0,9094500,$6)`,[uid(10+index),STORE,id,uid(2),uid(3),created]);
      if (index >= 2) continue;
      for(let n=0;n<index+2;n++) await pool.query(`INSERT INTO saas.order_events(id,store_id,order_id,event_type,message,payload,created_at) VALUES($1,$2,$3,$4,'QA fixture history','{}',$5)`,[uid(30+index*10+n),STORE,id,n===0?'order_created':n===1?'status_transition':'shipping_updated',created]);
      for(let n=0;n<index+1;n++) await pool.query(`INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES($1,$2,$3,$4,$5,'{}',$6)`,[uid(50+index*10+n),STORE,id,n===0?'transition_status':'update_shipping','a'.repeat(64),created]);
      await pool.query(`INSERT INTO saas.order_drafts(id,store_id,draft_number,status,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_address,billing_address,note,adjust_inventory,converted_order_id,version,created_at,updated_at) VALUES($1,$2,$3,'converted','ATLAS QA Fixture','qa@example.test','TRY',9094500,0,0,9094500,$4,$4,'Reviewed QA fixture',false,$5,3,$6,$6)`,[DRAFTS[index],STORE,`DRAFT-QA-${index}`,address,id,created]);
      await pool.query(`INSERT INTO saas.order_draft_lines(id,store_id,draft_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES($1,$2,$3,$4,$5,0,'QA immutable product snapshot',9094500,1,0,9094500,$6)`,[uid(70+index),STORE,DRAFTS[index],uid(2),uid(3),created]);
      for (const [n,kind] of ['create','update','convert'].entries()) await pool.query(`INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES($1,$2,$3,$4,$5,'{}',$6)`,[uid(80+index*10+n),STORE,DRAFTS[index],kind,'b'.repeat(64),created]);
    }
  } finally { await pool.end(); }
}

export async function verifyArchiveToolInPostgres({socket,port}) {
  const config = connectionConfig(socket,port);
  const bootstrap = new pg.Pool({...config,database:'postgres'});
  try { await bootstrap.query(`CREATE DATABASE ${DATABASE} TEMPLATE postgres`); }
  finally { await bootstrap.end(); }
  const pool = new pg.Pool({...config,database:DATABASE});
  try {
    const context = {
      schemaVersion:1, requestId:'exact-archive-fixture', principal:{id:PRINCIPAL,issuer:'https://identity.example.test',subject:'exact-archive-fixture'},
      store:{id:STORE,slug:'guzide-kuyumcu-4',status:'active'}, membership:{id:MEMBER,role:'store_owner',status:'active'}, locale:'tr-TR',
      entitlements:{schemaVersion:1,planId:PLAN,planCode:'free_starter',version:1,status:'active',features:['orders'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-01-01T00:00:00.000Z'},
    };
    const orders = new PostgresOrderRepository({pool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:3000,statementMs:10000,lockMs:3000,idleTransactionMs:10000},generateId:()=>{throw Error('archive must not generate commerce IDs');},audit:()=>{}});
    const resolveAuthorizedScope = async () => ({
      databaseName:(await pool.query('SELECT current_database() AS name')).rows[0].name,
      storeSlug:(await pool.query('SELECT slug FROM saas.stores WHERE id=$1',[STORE])).rows[0].slug,
      tenantContext:context,orders,
    });
    const before = await digest(pool);
    const dryRun = await runOrdersQaArchive({resolveAuthorizedScope});
    assert.deepEqual(dryRun.results.map(r=>[r.orderId,r.eligible,r.action]),IDS.map(id=>[id,true,'none']),JSON.stringify(dryRun));
    assert.deepEqual(await digest(pool),before);
    console.log('PASS exact allowlist real-repository dry-run: 2 eligible, archived 0, deleted 0');
    let raceSnapshot;
    let dependencyInserted = false;
    await pool.query('CREATE TABLE saas.archive_tool_fixture_dependency(store_id uuid,order_id uuid,FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id))');
    await pool.query('ALTER TABLE saas.archive_tool_fixture_dependency OWNER TO celebix_saas_owner');
    const raceOrders = {
      getOrder: orders.getOrder.bind(orders), archiveOrder: orders.archiveOrder.bind(orders),
      async getArchiveEligibility(input) {
        const result = await orders.getArchiveEligibility(input);
        if (!dependencyInserted) {
          dependencyInserted = true;
          await pool.query('INSERT INTO saas.archive_tool_fixture_dependency VALUES($1,$2)',[STORE,input.orderId]);
          raceSnapshot = await digest(pool);
        }
        return result;
      },
    };
    await assert.rejects(runOrdersQaArchive({
      resolveAuthorizedScope: async () => ({...await resolveAuthorizedScope(), orders:raceOrders}),
      mode:'apply', evidenceReference:'qa/disposable-exact-allowlist',
    }), error=>error.code==='invalid_transition');
    assert.deepEqual(await digest(pool),raceSnapshot);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM saas.order_archive_operations WHERE store_id=$1',[STORE])).rows[0].count,0);
    // Remove only this test-owned synthetic dependency relation; no production
    // table, order history, notification or immutable operation is removed.
    await pool.query('DROP TABLE saas.archive_tool_fixture_dependency');
    assert.deepEqual(await digest(pool),before);
    console.log('PASS exact runner refuses a dependency added after eligibility; zero archive/history effects');
    const result = await runOrdersQaArchive({resolveAuthorizedScope,mode:'apply',evidenceReference:'qa/disposable-exact-allowlist'});
    assert.equal(result.archivedCount,2); assert.deepEqual(await digest(pool),before);
    const input = {tenantContext:context,now:new Date(),pageSize:100};
    assert.deepEqual((await orders.listOrders(input)).items.map(x=>x.id).sort(),[...PROTECTED].sort());
    assert.deepEqual((await orders.listArchivedOrders(input)).items.map(x=>x.id).sort(),[...IDS].sort());
    assert.equal((await orders.getOrder({tenantContext:context,now:new Date(),orderId:IDS[0]})).archive.archived,true);
    assert.equal((await runOrdersQaArchive({resolveAuthorizedScope,mode:'apply',evidenceReference:'qa/disposable-exact-allowlist'})).archivedCount,0);
    for(const [index,id] of IDS.entries()) await orders.restoreOrder({tenantContext:context,now:new Date(),orderId:id,operationId:uid(200+index),reason:'Fixture restore',evidenceReference:'qa/disposable-exact-allowlist'});
    assert.equal((await orders.listOrders(input)).items.length,5); assert.deepEqual(await digest(pool),before);
    console.log('PASS exact allowlist archive/restore: 2 targets, all physical rows/IDs/FKs/snapshots/effects unchanged');
  } finally { await pool.end(); }
}
