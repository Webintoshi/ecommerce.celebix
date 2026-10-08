import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';
const evidence=process.env.POPUP_DELETE_EVIDENCE_DIR??'/tmp/celebix-popup-delete-222-evidence';mkdirSync(evidence,{recursive:true});
const fixture=startAccountingFixture(221),migration='202610090222_store_popup_delete';
const manifestSQL=`SET search_path=pg_catalog;SELECT coalesce(jsonb_object_agg(signature,authority ORDER BY signature),'{}') FROM(SELECT p.oid::regprocedure::text signature,jsonb_build_object('oid',p.oid,'definition',md5(pg_get_functiondef(p.oid)),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel) authority FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace) objects;`;
const relationsSQL=`SELECT coalesce(jsonb_agg(jsonb_build_object('oid',oid,'name',relname,'owner',relowner,'acl',relacl::text,'rls',relrowsecurity,'forceRls',relforcerowsecurity) ORDER BY oid),'[]') FROM pg_class WHERE relnamespace='saas'::regnamespace;`;
async function concurrency(){
 const pool=new pg.Pool({...fixture.connection,max:2});
 const authority=['a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000003','a2220000-0000-4000-8000-000000000004','popup222_qa',1,new Date()];
 const transact=async(text,values)=>{const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE celebix_saas_app');await client.query("SET LOCAL statement_timeout='10s'");const result=await client.query(text,values);await client.query('COMMIT');return result.rows[0];}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
 const deletion='SELECT * FROM saas.store_engagement_popup_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)';
 try{
  const selected=JSON.parse(fixture.value("SELECT jsonb_build_object('id',id,'config',config,'version',version) FROM saas.store_engagement_campaigns WHERE store_id='a2220000-0000-4000-8000-000000000001' AND kind='popup' ORDER BY id LIMIT 1;"));
  const deleteKey='a2220000-0000-4000-8000-000000000081',saveKey='a2220000-0000-4000-8000-000000000082';
  const [deleted,saved]=await Promise.all([
   transact(deletion,[...authority,deleteKey,'c'.repeat(64),selected.id,selected.version]),
   transact('SELECT * FROM saas.store_engagement_campaign_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text,$13::text,$14::boolean,$15::jsonb)',[...authority,saveKey,'d'.repeat(64),selected.id,selected.version,'popup','Concurrent save',false,JSON.stringify(selected.config)])
  ]);
  assert.ok((deleted.outcome==='saved'&&saved.outcome==='not_found')||(deleted.outcome==='version_conflict'&&saved.outcome==='saved'),JSON.stringify({deleted,saved}));
  assert.equal(fixture.value(`SELECT count(*) FROM saas.store_engagement_admin_operations WHERE operation_id IN('${deleteKey}','${saveKey}');`),'1');
  const expectedVersion=deleted.outcome==='saved'?'absent':'2';assert.equal(fixture.value(`SELECT coalesce((SELECT version::text FROM saas.store_engagement_campaigns WHERE id='${selected.id}'),'absent');`),expectedVersion);
  console.log('PASS concurrent save versus delete has exactly one committed winner');
  const duplicate=JSON.parse(fixture.value("SELECT jsonb_build_object('id',id,'version',version) FROM saas.store_engagement_campaigns WHERE store_id='a2220000-0000-4000-8000-000000000001' AND kind='popup' ORDER BY id DESC LIMIT 1;"));
  const replayKey='a2220000-0000-4000-8000-000000000083',args=[...authority,replayKey,'e'.repeat(64),duplicate.id,duplicate.version];
  const receipts=await Promise.all([transact(deletion,args),transact(deletion,args)]);
  assert.deepEqual(receipts.map(row=>row.outcome).sort(),['replayed','saved']);assert.deepEqual(receipts[0].result_payload,{campaignId:duplicate.id,deleted:true});assert.deepEqual(receipts[0].result_payload,receipts[1].result_payload);
  assert.equal(fixture.value(`SELECT count(*) FROM saas.store_engagement_admin_operations WHERE operation_id='${replayKey}';`),'1');assert.equal(fixture.value(`SELECT count(*) FROM saas.store_engagement_campaigns WHERE id='${duplicate.id}';`),'0');
  console.log('PASS concurrent duplicate deletion records one operation and returns the same receipt');
 }finally{await pool.end();}
}
try{
 const tests=readFileSync(new URL('./popup-delete.sql',import.meta.url),'utf8');
 if(process.argv.includes('--red')){const result=fixture.sql(tests,true);assert.notEqual(result.status,0);assert.match(result.stderr,/function saas\.store_engagement_popup_delete/);writeFileSync(path.join(evidence,'red-native.log'),result.stderr);console.log('PASS RED: popup delete native function is unavailable');}
 else{
  const before=JSON.parse(fixture.value(manifestSQL)),relations=JSON.parse(fixture.value(relationsSQL));
  fixture.apply(`${migration}.up.sql`);fixture.apply(`${migration}_assertions.sql`);
  const after=JSON.parse(fixture.value(manifestSQL));for(const [signature,authority] of Object.entries(before))assert.deepEqual(after[signature],authority,signature);
  const added=Object.keys(after).filter(key=>!(key in before));assert.deepEqual(added,['saas.store_engagement_popup_delete(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)']);assert.deepEqual(JSON.parse(fixture.value(relationsSQL)),relations);
  const result=fixture.sql(tests),checks=result.stdout.trim().split('\n').filter(Boolean);assert.equal(checks.length,16);console.log(checks.map(name=>'PASS '+name).join('\n'));
  fixture.apply(`${migration}.down.sql`);assert.deepEqual(JSON.parse(fixture.value(manifestSQL)),before);assert.deepEqual(JSON.parse(fixture.value(relationsSQL)),relations);
  fixture.apply(`${migration}.up.sql`);fixture.apply(`${migration}_assertions.sql`);assert.equal(fixture.sql(tests).status,0);
  fixture.sql(tests.replace(/ROLLBACK;\s*$/,'COMMIT;'));await concurrency();
  const sqlRoot=new URL('../../../apps/owner/scripts/sql/saas/',import.meta.url),files=[`${migration}.up.sql`,`${migration}.down.sql`,`${migration}_assertions.sql`].map(file=>({file,sha256:createHash('sha256').update(readFileSync(new URL(file,sqlRoot))).digest('hex')}));
  const receipt={baselineThrough:221,baselineFunctions:Object.keys(before).length,predecessorFunctionsChanged:0,addedFunctions:added,relationsChanged:0,checks,concurrencyChecks:['same-version save/delete has one committed winner','same-key concurrent deletion records one receipt'],rollbackReapply:true,productionWrites:false,files};writeFileSync(path.join(evidence,'acceptance.json'),JSON.stringify(receipt,null,2)+'\n');console.log('PASS native222 deletion, predecessor preservation and rollback/reapply');
 }
}finally{fixture.stop();}
