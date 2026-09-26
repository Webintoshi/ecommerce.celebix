import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import pg from 'pg';
import { isAbsolute } from 'node:path';
const path=process.env.TOSHI_QA_CONNECTION_FILE,evidencePath=process.env.TOSHI_QA_EVIDENCE_FILE,db='celebix_toshi_ai_qa_20260926';
assert.ok(typeof path === 'string' && isAbsolute(path), 'ABSOLUTE_QA_CONNECTION_FILE_REQUIRED');
assert.ok(typeof evidencePath === 'string' && isAbsolute(evidencePath), 'ABSOLUTE_QA_EVIDENCE_FILE_REQUIRED');
assert.equal(statSync(path).mode&0o777,0o600);
const connectionString=readFileSync(path,'utf8').trim(),url=new URL(connectionString);
assert.equal(url.pathname,`/${db}`);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000,statement_timeout:60000});
const migration=readFileSync(new URL('../../../apps/owner/scripts/sql/saas/202609260164_toshi_conversations.up.sql',import.meta.url),'utf8');
assert.ok(migration.includes('pg_column_size(result_payload)<=2097152'));
const target='toshi_generation_operations_result_payload_check';
const checks=[],pass=label=>{checks.push(label);console.log(`PASS ${label}`);};
const fp=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function invoke(name,args){
 await client.query('SET LOCAL ROLE celebix_saas_app');
 try{return(await client.query(`SELECT outcome,result_payload FROM saas.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args.map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0];}
 finally{try{await client.query('RESET ROLE');}catch{}}
}
async function counts(){const result={};for(const n of['conversations','messages','generation_operations','generation_events'])result[n]=(await client.query(`SELECT count(*)::int count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) digest FROM saas.toshi_${n} t`)).rows[0];return result;}
async function constraint(){return(await client.query("SELECT conname,pg_get_constraintdef(oid) definition,convalidated FROM pg_constraint WHERE conrelid='saas.toshi_generation_operations'::regclass AND conname=$1",[target])).rows[0];}
let selected;
const userText='界'.repeat(4000),assistantText='界'.repeat(12000);
const sources=Array.from({length:12},(_,i)=>({label:'界'.repeat(120),href:`/products/${'x'.repeat(225)}${i}`}));
async function twentyTurns(){
 let id=null,version=null,last;
 for(let turn=0;turn<20;turn++){
  const now=new Date(Date.now()+turn*61_000).toISOString();
  const a=[selected.store_id,selected.principal_id,selected.membership_id,selected.plan_id,selected.plan_code,Number(selected.plan_version),now],operationId=randomUUID();
  const fingerprint=fp([a[0],a[1],id,version,userText]);
  const ready=await invoke('toshi_conversation_begin_turn',[...a,operationId,fingerprint,id,version,userText]);assert.equal(ready.outcome,'ready');
  const done=await invoke('toshi_conversation_complete_turn',[...a,operationId,assistantText,sources]);assert.equal(done.outcome,'completed');
  const previousId=id,previousVersion=version;id=done.result_payload.id;version=done.result_payload.version;
  last={a,operationId,fingerprint,previousId,previousVersion,conversation:done.result_payload};
 }
 return last;
}
await client.connect();
try{
 assert.equal((await client.query('SELECT current_database() db')).rows[0].db,db);
 const before=await counts();
 selected=(await client.query("SELECT m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version FROM saas.memberships m JOIN saas.stores st ON st.id=m.store_id JOIN saas.subscriptions s ON s.store_id=m.store_id JOIN saas.toshi_provider_configs p ON p.store_id=m.store_id AND p.status='active' AND p.is_default WHERE m.role='store_owner' AND m.status='active' AND st.status='active' AND s.status='active' ORDER BY m.store_id LIMIT 1")).rows[0];assert.ok(selected,'existing public active default required');
 const prior=await constraint();assert.equal(prior.convalidated,true);
 if(prior.definition.includes('<= 600000')){
  await client.query('BEGIN');
  await assert.rejects(()=>twentyTurns(),e=>e?.code==='23514'&&e?.constraint===target);
  await client.query('ROLLBACK');assert.deepEqual(await counts(),before);
  pass('original 600000-byte snapshot constraint rejects an otherwise valid multilingual conversation; RED reproduced with all fixture writes rolled back');
  await client.query('BEGIN');await client.query('SET LOCAL ROLE celebix_saas_owner');await client.query("SET LOCAL lock_timeout='5s'");
  const guarded=await constraint();assert.deepEqual(guarded,prior);
  await client.query(`ALTER TABLE saas.toshi_generation_operations DROP CONSTRAINT ${target}`);
  await client.query(`ALTER TABLE saas.toshi_generation_operations ADD CONSTRAINT ${target} CHECK(result_payload IS NULL OR(jsonb_typeof(result_payload)='object' AND pg_column_size(result_payload)<=2097152))`);
  await client.query('COMMIT');
 }else assert.ok(prior.definition.includes('<= 2097152'),'only reviewed feature constraint is eligible');
 const fixed=await constraint();assert.ok(fixed.definition.includes('<= 2097152'));assert.equal(fixed.convalidated,true);assert.deepEqual(await counts(),before);
 pass('only named SQL164 snapshot constraint is widened to validated 2 MiB; existing conversation, message, operation and audit rows are unchanged');
 await client.query('BEGIN');
 const last=await twentyTurns(),conversation=last.conversation;
 assert.equal(conversation.version,20);assert.equal(conversation.messages.length,40);
 assert.equal(conversation.messages[0].text.length,4000);assert.equal(conversation.messages[39].text.length,12000);assert.equal(conversation.messages[39].sources.length,12);
 const publicBytes=Buffer.byteLength(JSON.stringify(conversation));assert.ok(publicBytes>600000);assert.ok(publicBytes<2097152);
 const jsonbBytes=(await client.query('SELECT pg_column_size($1::jsonb)::int bytes',[JSON.stringify(conversation)])).rows[0].bytes;assert.ok(jsonbBytes>600000);assert.ok(jsonbBytes<2097152);
 const get=await invoke('toshi_conversation_get',[...last.a,conversation.id]);assert.deepEqual(get.result_payload,conversation);
 const replay=await invoke('toshi_conversation_begin_turn',[...last.a,last.operationId,last.fingerprint,last.previousId,last.previousVersion,userText]);assert.equal(replay.outcome,'replayed');assert.deepEqual(replay.result_payload,conversation);
 const recovery=await invoke('toshi_conversation_recover_turn',[...last.a,last.operationId,'complete',null]);assert.deepEqual(recovery.result_payload,conversation);
 pass('twenty maximum-length CJK turns plus twelve bounded sources produce forty successful public messages above 600000 bytes, with identical GET, replay and recovery snapshots');
 await client.query('ROLLBACK');assert.deepEqual(await counts(),before);
 pass('all Unicode regression fixtures roll back and retain the prior cancelled concurrency fixture exactly');
 const result={database:db,migrationSha256:createHash('sha256').update(migration).digest('hex'),passed:checks.length,checks,publicBytes,jsonbBytes,snapshotLimit:2097152,fixtureRowsConserved:true,providerCalls:0};
 writeFileSync(evidencePath,JSON.stringify(result,null,2),{mode:0o600});console.log(`PASS ${checks.length}/${checks.length}; ${publicBytes} public bytes, ${jsonbBytes} jsonb bytes`);
}finally{try{await client.query('ROLLBACK');}catch{}await client.end();}
