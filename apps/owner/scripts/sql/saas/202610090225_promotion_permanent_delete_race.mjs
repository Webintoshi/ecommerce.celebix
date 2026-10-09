// Disposable local database clone only. Never connects to a remote host.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
const [socket,port,source] = process.argv.slice(2);
assert.match(socket ?? '', /^\/tmp\/celebix-discount-delete-[a-zA-Z0-9_-]+-socket$/);
assert.match(port ?? '', /^\d{4,5}$/);
assert.equal(source, 'email_marketing_isolated');
const database = 'discount_delete_race_' + randomUUID().replaceAll('-','');
const options = { host:socket, port:Number(port), user:'postgres' };
const admin = new Client({ ...options, database:source });
const connections = [];
const qid = value => '"' + value.replaceAll('"','""') + '"';
async function connect(label) { const client = new Client({ ...options,database,application_name:'discount-delete-race-'+label });await client.connect();connections.push(client);await client.query('SET ROLE celebix_saas_owner');return client; }
const fn = (name,values) => ({ text:`SELECT * FROM saas.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')})`,values });
let cloned = false;
try {
 await admin.connect();
 assert.equal((await admin.query("SELECT current_setting('listen_addresses') value")).rows[0].value,'');
 assert.equal((await admin.query('SELECT count(*)::int value FROM saas.promotion_deletions')).rows[0].value,0);
 await admin.query(`CREATE DATABASE ${qid(database)} TEMPLATE ${qid(source)}`);cloned=true;
 const control=await connect('control'),a=await connect('a'),b=await connect('b');
 const authority=(await control.query("SELECT m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version FROM saas.memberships m JOIN saas.subscriptions s ON s.store_id=m.store_id WHERE saas.promotion_authority_error(m.store_id,m.principal_id,m.id,s.plan_id,s.plan_code,s.plan_version,date_trunc('milliseconds',clock_timestamp()),'promotions.archive') IS NULL ORDER BY m.store_id,m.id LIMIT 1")).rows[0];assert.ok(authority);
 const prefix=[authority.store_id,authority.principal_id,authority.membership_id,authority.plan_id,authority.plan_code,Number(authority.plan_version)];
 const pidA=(await a.query('SELECT pg_backend_pid() pid')).rows[0].pid,pidB=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 async function waitBlocked() {
  const start=Date.now();
  while(Date.now()-start<5000){
   const row=(await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pidB])).rows[0];
   if(row?.wait_event_type==='Lock') {
    assert.ok((await admin.query('SELECT 1 FROM pg_locks waiting JOIN pg_locks holding USING(locktype,database,classid,objid,objsubid) WHERE waiting.pid=$1 AND holding.pid=$2 AND NOT waiting.granted AND holding.granted AND waiting.locktype=\'advisory\'',[pidB,pidA])).rowCount>0);
    return;
   }
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error('Native competitor never waited on shared advisory lock');
 }
 async function fixture() {
  const now=(await control.query("SELECT date_trunc('milliseconds',clock_timestamp()) n")).rows[0].n,promotion=randomUUID();
  const rule={schemaVersion:1,benefit:{kind:'free_shipping'},targets:{mode:'all',include:[],exclude:[]},audience:{mode:'everyone'},trigger:{kind:'code',codes:['RACE'+randomUUID().replaceAll('-','').toUpperCase()]},schedule:{timezone:'Europe/Istanbul'},limits:{totalUsage:null,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},conditions:{minimumBasketMinor:0,minimumQuantity:0,minimumProductQuantity:0},combinationPolicy:{kind:'none'},priority:0,marginPolicy:{kind:'warn'},progressMessagePolicy:{enabled:false}};
  const fp=(await control.query("SELECT saas.promotion_operation_fingerprint_v2('create',$1,$2::jsonb) fp",[prefix[0],JSON.stringify({name:'Isolated race discount',ruleDocument:rule})])).rows[0].fp;
  assert.equal((await control.query(fn('promotion_create_v1',[...prefix,now,randomUUID(),fp,promotion,'Isolated race discount',JSON.stringify(rule)]))).rows[0].outcome,'created');
  const pubfp=(await control.query("SELECT saas.promotion_operation_fingerprint_v2('lifecycle',$1,$2::jsonb) fp",[prefix[0],JSON.stringify({id:promotion,expectedVersion:1,nextStatus:'active'})])).rows[0].fp;
  assert.equal((await control.query(fn('promotion_lifecycle_v1',[...prefix,now,randomUUID(),pubfp,promotion,1,'active']))).rows[0].outcome,'updated');
  const config={schemaVersion:1,template:'discount',heading:'Isolated fixture',body:'Fixture',buttonLabel:'Close',delaySeconds:0,repeatDays:7,devices:{desktop:true,mobile:true},collectMode:'either',promotionId:promotion};
  const campaign=(await control.query(fn('store_engagement_campaign_save',[...prefix,now,randomUUID(),'a'.repeat(64),null,null,'popup','Isolated race popup',false,JSON.stringify(config)]))).rows[0];assert.equal(campaign.outcome,'saved');
  const delfp=(await control.query('SELECT saas.promotion_delete_fingerprint_v1($1,$2,2) fp',[prefix[0],promotion])).rows[0].fp;
  return {now,promotion,campaign:campaign.result_payload.id,config,delfp,operation:randomUUID()};
 }
 const enable = (client,f) => client.query(fn('store_engagement_campaign_save',[...prefix,f.now,randomUUID(),'b'.repeat(64),f.campaign,1,'popup','Isolated race popup',true,JSON.stringify(f.config)]));
 const remove = (client,f) => client.query(fn('promotion_delete_v1',[...prefix,f.now,f.operation,f.delfp,f.promotion,2]));
 const down=readFileSync(new URL('./202610090225_promotion_permanent_delete.down.sql',import.meta.url),'utf8');
 const up=readFileSync(new URL('./202610090225_promotion_permanent_delete.up.sql',import.meta.url),'utf8');
 async function waitReceiptTableBlocked() {
  const start=Date.now();
  while(Date.now()-start<5000){
   const locked=await admin.query("SELECT 1 FROM pg_locks waiting JOIN pg_locks holding ON holding.database=waiting.database AND holding.relation=waiting.relation WHERE waiting.pid=$1 AND holding.pid=$2 AND NOT waiting.granted AND holding.granted AND waiting.locktype='relation'",[pidB,pidA]);
   if(locked.rowCount) return;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error('Rollback/delete competitor never waited on receipt relation lock');
 }
 {
  const f=await fixture();
  const split=down.indexOf('DO $safe$');assert.ok(split>0);
  await a.query(down.slice(0,split));await b.query('BEGIN');
  const competitor=remove(b,f).then(value=>value,error=>({error}));await waitReceiptTableBlocked();
  await a.query(down.slice(split));
  const result=await competitor;assert.ok(result.error,'A deletion already in flight must abort after pre-use rollback drops its receipt table');await b.query('ROLLBACK');
  assert.equal((await control.query("SELECT to_regclass('saas.promotion_deletions') value")).rows[0].value,null);
  await control.query(up);
  assert.equal((await control.query('SELECT count(*)::int value FROM saas.promotion_deletions')).rows[0].value,0);
  console.log('PASS rollback-first: first deletion waits on receipt table and aborts after rollback');
 }
 {
  const f=await fixture();await a.query('BEGIN');
  assert.equal((await remove(a,f)).rows[0].outcome,'deleted');
  const competitor=b.query(down).then(value=>value,error=>({error}));await waitReceiptTableBlocked();await a.query('COMMIT');
  assert.equal((await competitor).error?.message,'PROMOTION_DELETE_ROLLBACK_REFUSED_AFTER_USE');await b.query('ROLLBACK');
  assert.equal((await control.query('SELECT count(*)::int value FROM saas.promotion_deletions WHERE promotion_id=$1',[f.promotion])).rows[0].value,1);
  console.log('PASS delete-first: rollback waits for first deletion and refuses after receipt commits');
 }

 {
  const f=await fixture();await a.query('BEGIN');await b.query('BEGIN');
  assert.equal((await enable(a,f)).rows[0].outcome,'saved');
  const competitor=remove(b,f).then(value=>value,error=>({error}));await waitBlocked();await a.query('COMMIT');
  assert.equal((await competitor).rows[0].outcome,'deletion_blocked');await b.query('COMMIT');
  assert.equal((await control.query('SELECT count(*)::int value FROM saas.promotion_deletions WHERE promotion_id=$1',[f.promotion])).rows[0].value,0);
  console.log('PASS enable-first: delete waits on shared lock and blocks the newly enabled campaign');
 }
 {
  const f=await fixture();await a.query('BEGIN');await b.query('BEGIN');
  const receipt=(await remove(a,f)).rows[0];assert.equal(receipt.outcome,'deleted');
  const competitor=enable(b,f).then(value=>value,error=>({error}));await waitBlocked();await a.query('COMMIT');
  assert.equal((await competitor).rows[0].outcome,'invalid_reference');await b.query('COMMIT');
  assert.equal((await control.query('SELECT enabled FROM saas.store_engagement_campaigns WHERE id=$1',[f.campaign])).rows[0].enabled,false);
  console.log('PASS delete-first: campaign enable waits and rejects the permanently deleted discount');
 }
 {
  const f=await fixture();await a.query('BEGIN');await b.query('BEGIN');
  const receipt=(await remove(a,f)).rows[0];assert.equal(receipt.outcome,'deleted');
  const competitor=remove(b,f).then(value=>value,error=>({error}));await waitBlocked();await a.query('COMMIT');
  const replay=(await competitor).rows[0];assert.equal(replay.outcome,'operation_replayed');assert.deepEqual(replay.result_payload,receipt.result_payload);await b.query('COMMIT');
  assert.equal((await control.query('SELECT count(*)::int value FROM saas.promotion_deletions WHERE promotion_id=$1',[f.promotion])).rows[0].value,1);
  console.log('PASS concurrent same-key delete: one immutable receipt and identical replay');
 }
 await assert.rejects(control.query(down), error=>error.message==='PROMOTION_DELETE_ROLLBACK_REFUSED_AFTER_USE');
 await control.query('ROLLBACK');
 assert.ok((await control.query("SELECT to_regprocedure('saas.promotion_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') value")).rows[0].value);
 console.log('PASS rollback after use: irreversible deletion receipts prevent restoration');
} finally {
 await Promise.all(connections.map(client=>client.end()));
 if(cloned) await admin.query(`DROP DATABASE ${qid(database)}`);
 await admin.end();
}
