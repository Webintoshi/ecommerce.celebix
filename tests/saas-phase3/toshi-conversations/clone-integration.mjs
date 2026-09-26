import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import pg from 'pg';
import { isAbsolute } from 'node:path';
const connectionPath = process.env.TOSHI_QA_CONNECTION_FILE;
const evidencePath = process.env.TOSHI_QA_EVIDENCE_FILE;
assert.ok(typeof connectionPath === 'string' && isAbsolute(connectionPath), 'ABSOLUTE_QA_CONNECTION_FILE_REQUIRED');
assert.ok(typeof evidencePath === 'string' && isAbsolute(evidencePath), 'ABSOLUTE_QA_EVIDENCE_FILE_REQUIRED');
assert.equal(statSync(connectionPath).mode & 0o777, 0o600);
const connectionString = readFileSync(connectionPath, 'utf8').trim();
const expectedDatabase = 'celebix_toshi_ai_qa_20260926';
const url = new URL(connectionString);
assert.equal(url.pathname, `/${expectedDatabase}`); assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
const sqlRoot = new URL('../../../apps/owner/scripts/sql/saas/', import.meta.url);
const up = readFileSync(new URL('202609260164_toshi_conversations.up.sql', sqlRoot),'utf8');
const down = readFileSync(new URL('202609260164_toshi_conversations.down.sql', sqlRoot),'utf8');
const body = sql => sql.replace(/^BEGIN;\n/,'').replace(/COMMIT;\s*$/,'');
const report = [];
const success = label => { report.push(label); console.log(`PASS ${label}`); };
const fp = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const at = offset => new Date(Date.now()+offset*1000).toISOString();
async function invoke(name,args,c=client) {
 await c.query('SET LOCAL ROLE celebix_saas_app');
 try { return (await c.query(`SELECT outcome,result_payload FROM saas.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args.map(v=>v && typeof v==='object' ? JSON.stringify(v) : v))).rows[0]; }
 finally { try { await c.query('RESET ROLE'); } catch {} }
}
async function deny(sql,args=[],pattern=/permission denied/) {
 await client.query('SAVEPOINT denied'); await assert.rejects(()=>client.query(sql,args),pattern); await client.query('ROLLBACK TO SAVEPOINT denied'); await client.query('RELEASE SAVEPOINT denied');
}
async function functions(){return(await client.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.prokind='f' ORDER BY 1")).rows;}
async function merchantDigests(){
 const names=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='saas' AND table_type='BASE TABLE' AND table_name NOT IN('toshi_conversations','toshi_messages','toshi_generation_operations','toshi_generation_events') ORDER BY table_name")).rows.map(r=>r.table_name);
 assert.ok(names.every(n=>/^[a-z0-9_]+$/.test(n)));
 const sql=names.map(n=>`SELECT '${n}' table_name,count(*)::integer count,md5(COALESCE(string_agg(row_json,E'\\n' ORDER BY row_json),'')) digest FROM(SELECT to_jsonb(t)::text row_json FROM saas.${n} t)x`).join(' UNION ALL ');
 return Object.fromEntries((await client.query(sql)).rows.map(({table_name,...value})=>[table_name,value]));
}
await client.connect();
try {
 assert.equal((await client.query('SELECT current_database() db')).rows[0].db, expectedDatabase);
 if((await client.query("SELECT to_regclass('saas.toshi_conversations') table_name")).rows[0].table_name!==null)await client.query(down);
 const originalFunctions=await functions(), originalData=await merchantDigests();
 assert.equal((await client.query("SELECT to_regclass('saas.toshi_conversations') table_name")).rows[0].table_name,null,'fresh exact clone required');
 await client.query(up); const migratedFunctions=await functions();
 for(const old of originalFunctions)assert.deepEqual(migratedFunctions.find(f=>f.signature===old.signature),old);
 assert.equal(migratedFunctions.length,originalFunctions.length+10);assert.deepEqual(await merchantDigests(),originalData);
 success('SQL164 creates ten isolated functions and four private tables without changing any existing function authority or merchant row');
 await client.query(down); assert.deepEqual(await functions(),originalFunctions);assert.deepEqual(await merchantDigests(),originalData); await client.query(up);assert.deepEqual(await functions(),migratedFunctions);
 success('empty rollback and reapplication restore the exact original schema and authority');
 const authRows=(await client.query(`SELECT DISTINCT ON(m.store_id) m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version
 FROM saas.memberships m JOIN saas.stores st ON st.id=m.store_id JOIN saas.subscriptions s ON s.store_id=m.store_id JOIN saas.plans p ON p.id=s.plan_id
 WHERE m.role='store_owner' AND m.status='active' AND st.status='active' AND s.status='active' AND p.status='active' AND s.valid_from<=now() AND(s.valid_until IS NULL OR s.valid_until>now()) ORDER BY m.store_id,m.id LIMIT 2`)).rows;
 assert.equal(authRows.length,2,'two active cloned stores required');
 const auth=authRows.map(a=>[a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,Number(a.plan_version),at(0)]);
 const timed=(a,offset)=>[...a.slice(0,6),at(offset)];
 await client.query('BEGIN');
 for(const table of ['conversations','messages','generation_operations','generation_events']) {
  const sec=(await client.query("SELECT c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=$1",[`toshi_${table}`])).rows[0];
  assert.deepEqual(sec,{relrowsecurity:true,relforcerowsecurity:true,owner:'celebix_saas_owner'});
  await client.query('SET LOCAL ROLE celebix_saas_app');await deny(`SELECT * FROM saas.toshi_${table}`);await client.query('RESET ROLE');
 }
 for(const helper of ["saas.toshi_conversation_sources_valid(jsonb)","saas.toshi_conversation_summary(uuid,uuid,uuid)","saas.toshi_conversation_public_payload(uuid,uuid,uuid)"]){
  const sec=(await client.query("SELECT has_function_privilege('celebix_saas_app',$1,'EXECUTE') app,has_function_privilege('celebix_saas_workflow',$1,'EXECUTE') workflow,has_function_privilege('celebix_saas_host_resolver',$1,'EXECUTE') host",[helper])).rows[0];assert.deepEqual(sec,{app:false,workflow:false,host:false});
 }
 success('FORCE RLS and direct-table/helper denial preserve private server authority');
 // Synthetic secret only; no merchant credential is selected, decrypted or sent anywhere.
 const identity=await invoke('toshi_provider_connection_identity',[...auth[0],'deepseek']);
 const configId=identity.outcome==='found'?identity.result_payload.configId:randomUUID();
 const version=identity.outcome==='found'?identity.result_payload.version:0;
 const credentialVersion=identity.outcome==='found'?identity.result_payload.credentialVersion+1:1;
 const envelope={algorithm:'A256GCM',ciphertext:'Y3JlZGVudGlhbA',iv:'MTIzNDU2Nzg5MDEy',keyId:'toshi-qa-only',tag:'MTIzNDU2Nzg5MDEyMzQ1Ng',version:1};
 const connected=await invoke('toshi_provider_connect',[...auth[0],randomUUID(),fp(['synthetic']),configId,'deepseek',envelope,`sha256:${'a'.repeat(64)}`,credentialVersion,'••••QA01','deepseek-flash',[{id:'deepseek-flash',label:'Flash'},{id:'deepseek-v4-pro',label:'Pro'}],version]);assert.equal(connected.outcome,'connected');
 assert.equal((await invoke('toshi_provider_set_default',[...auth[0],randomUUID(),fp(['default']),'deepseek',connected.result_payload.version])).outcome,'updated');
 const reservation = async(a,op,id,ver,text)=>invoke('toshi_conversation_begin_turn',[...a,op,fp([a[0],a[1],id,ver,text]),id,ver,text]);
 const complete=async(a,op,text='Stok mevcut.',sources=[{label:'Ürünler',href:'/products'}])=>invoke('toshi_conversation_complete_turn',[...a,op,text,sources]);
 const fail=async(a,op,code='cancelled')=>invoke('toshi_conversation_fail_turn',[...a,op,code]);
 const op1=randomUUID(), first=await reservation(auth[0],op1,null,null,'Stok durumum');assert.equal(first.outcome,'ready');
 const convId=first.result_payload.conversation.id;
 assert.equal(first.result_payload.configId,configId);assert.equal(first.result_payload.credentialVersion,credentialVersion);assert.equal(first.result_payload.conversation.model,'deepseek-flash');assert.equal(first.result_payload.conversation.version,0);assert.deepEqual(first.result_payload.conversation.messages,[]);
 assert.doesNotMatch(JSON.stringify(first.result_payload),/sealedCredentials|ciphertext|apiKey|credentialDigest/);
 success('begin pins active default config and model without exposing credentials, incrementing version or appending a fake message');
 assert.equal((await reservation(auth[0],op1,null,null,'Stok durumum')).outcome,'turn_busy');
 assert.equal((await reservation(auth[0],op1,null,null,'Değişen mesaj')).outcome,'operation_mismatch');
 assert.equal((await reservation(auth[0],randomUUID(),null,null,'Paralel mesaj')).outcome,'turn_busy');
 const recover=await invoke('toshi_conversation_recover_turn',[...auth[0],op1,'begin',fp([auth[0][0],auth[0][1],null,null,'Stok durumum'])]);assert.deepEqual(recover,first);
 success('pending replay and parallel conversations cannot start another charge; uncertain reservation recovers the identical lease');
 assert.equal((await fail(auth[0],op1,'quota_exceeded')).outcome,'failed');
 assert.equal((await reservation(auth[0],op1,null,null,'Stok durumum')).outcome,'quota_exceeded');
 assert.equal((await invoke('toshi_conversation_get',[...auth[0],convId])).result_payload.version,0);
 assert.deepEqual((await invoke('toshi_conversation_get',[...auth[0],convId])).result_payload.messages,[]);
 success('failed operations replay their safe error and leave conversation messages and version unchanged');
 const op2=randomUUID();assert.equal((await reservation(auth[0],op2,convId,0,'Devam')).outcome,'ready');
 const finished=await complete(auth[0],op2);assert.equal(finished.outcome,'completed');assert.equal(finished.result_payload.version,1);assert.deepEqual(finished.result_payload.messages.map(m=>m.role),['user','assistant']);assert.equal(finished.result_payload.messages[0].text,'Devam');
 assert.deepEqual(await complete(auth[0],op2),finished);
 const replay=await reservation(auth[0],op2,convId,0,'Devam');assert.equal(replay.outcome,'replayed');assert.deepEqual(replay.result_payload,finished.result_payload);
 const completeRecovery=await invoke('toshi_conversation_recover_turn',[...auth[0],op2,'complete',null]);assert.deepEqual(completeRecovery,finished);
 success('complete atomically appends one user/assistant pair and freezes one public replay result');
 assert.equal((await invoke('toshi_conversation_get',[...auth[1],convId])).outcome,'conversation_not_found');
 assert.equal((await reservation(auth[1],op2,convId,0,'Devam')).outcome,'operation_mismatch');
 const wrong=[...auth[0]];wrong[2]=randomUUID();assert.equal((await invoke('toshi_conversation_get',[...wrong,convId])).outcome,'membership_denied');
 // Additional valid actor in the same cloned store; created only in rolled-back QA transaction.
 const actor=randomUUID(),member=randomUUID();
 await client.query("INSERT INTO saas.principals VALUES($1,'https://toshi-qa.invalid',$2,'qa@toshi.invalid',true,$3,$3)",[actor,actor,at(0)]);
 await client.query("INSERT INTO saas.memberships VALUES($1,$2,$3,'analyst','active',$4,$4)",[member,actor,auth[0][0],at(0)]);
 const otherActor=[...auth[0]];otherActor[1]=actor;otherActor[2]=member;
 assert.equal((await invoke('toshi_conversation_get',[...otherActor,convId])).outcome,'conversation_not_found');assert.deepEqual((await invoke('toshi_conversation_list',otherActor)).result_payload,{conversations:[]});assert.equal((await reservation(otherActor,op2,convId,0,'Devam')).outcome,'operation_mismatch');
 success('cross-store, valid same-store other actor, and invalid membership cannot read or take over a conversation');
 assert.equal((await reservation(auth[0],randomUUID(),convId,0,'Stale')).outcome,'version_conflict');
 const op3=randomUUID(), ready3=await reservation(auth[0],op3,convId,1,'Dalga');assert.equal(ready3.outcome,'ready');
 assert.equal((await complete(auth[0],op3,'a'.repeat(12001),[])).outcome,'invalid_input');assert.equal((await complete(auth[0],op3,'Unsafe',[{label:'X',href:'https://evil.test'}])).outcome,'invalid_input');
 await client.query('SAVEPOINT rotation');await client.query('UPDATE saas.toshi_provider_configs SET credential_version=credential_version+1 WHERE id=$1',[configId]);assert.equal((await complete(auth[0],op3)).outcome,'credential_invalid');await client.query('ROLLBACK TO SAVEPOINT rotation');
 await client.query('SAVEPOINT revocation');await client.query("UPDATE saas.toshi_provider_configs SET status='revoked',revoked_at=$2,is_default=false WHERE id=$1",[configId,at(1)]);assert.equal((await complete(timed(auth[0],1),op3)).outcome,'connection_revoked');await client.query('ROLLBACK TO SAVEPOINT revocation');
 await client.query('SAVEPOINT model_removal');await client.query("UPDATE saas.toshi_provider_configs SET selected_model='deepseek-v4-pro',available_models=$2::jsonb WHERE id=$1",[configId,JSON.stringify([{id:'deepseek-v4-pro',label:'Pro'}])]);assert.equal((await complete(auth[0],op3)).outcome,'model_unavailable');await client.query('ROLLBACK TO SAVEPOINT model_removal');
 assert.equal((await complete(auth[0],op3)).outcome,'completed');
 success('finish rechecks pinned config, credential version and allowed model after generation; revoked or changed credentials never append a reply');
 await client.query("UPDATE saas.toshi_provider_configs SET selected_model='deepseek-v4-pro' WHERE id=$1",[configId]);
 const op4=randomUUID(), ready4=await reservation(auth[0],op4,convId,2,'Eski model');assert.equal(ready4.outcome,'ready');assert.equal(ready4.result_payload.conversation.model,'deepseek-flash');assert.equal((await complete(auth[0],op4)).outcome,'completed');
 const op5=randomUUID(),ready5=await reservation(auth[0],op5,null,null,'Yeni model');assert.equal(ready5.outcome,'ready');assert.equal(ready5.result_payload.conversation.model,'deepseek-v4-pro');await fail(auth[0],op5);
 assert.deepEqual((await reservation(auth[0],op2,convId,0,'Devam')).result_payload,finished.result_payload);
 success('selection changes affect new conversations; continued conversations and historical replay preserve the original model and snapshot');
 const rateAuth=timed(auth[0],600);
 for(let i=0;i<6;i++){const op=randomUUID();assert.equal((await reservation(rateAuth,op,null,null,'Rate QA')).outcome,'ready');await fail(rateAuth,op);}
 assert.equal((await reservation(rateAuth,randomUUID(),null,null,'Seventh')).outcome,'rate_limited');
 success('six generation attempts per actor and store per minute remain durable across failures');
 const leaseOp=randomUUID();assert.equal((await reservation(timed(auth[0],1200),leaseOp,null,null,'Lease')).outcome,'ready');
 const expiredNext=randomUUID();assert.equal((await reservation(timed(auth[0],1321),expiredNext,null,null,'Next lease')).outcome,'ready');await fail(timed(auth[0],1321),expiredNext);
 assert.equal((await reservation(timed(auth[0],1321),leaseOp,null,null,'Lease')).outcome,'provider_timeout');
 success('expired lease releases the actor and permanently prevents the original paid operation from running again');
 let ver=3;
 for(;ver<100;ver++) { const a=timed(auth[0],2000+ver*61),op=randomUUID();assert.equal((await reservation(a,op,convId,ver,'History QA')).outcome,'ready');const done=await complete(a,op);assert.equal(done.outcome,'completed');assert.equal(done.result_payload.version,ver+1);assert.ok(done.result_payload.messages.length<=40); }
 const final=await invoke('toshi_conversation_get',[...timed(auth[0],9000),convId]);assert.equal(final.result_payload.messages.length,40);assert.equal(final.result_payload.version,100);
 assert.equal((await client.query('SELECT count(*)::integer count FROM saas.toshi_messages WHERE conversation_id=$1',[convId])).rows[0].count,200);
 assert.equal((await reservation(timed(auth[0],9000),randomUUID(),convId,100,'Too many')).outcome,'conversation_limit_reached');
 assert.equal((await invoke('toshi_conversation_list',timed(auth[0],9000))).result_payload.conversations.length<=20,true);
 success('one hundred successful turns are retained with only the last forty public messages and bounded history lists; turn 101 is rejected');
 await deny(body(down),[],/TOSHI_CONVERSATIONS_ROLLBACK_DATA_PRESENT/);
 await deny('UPDATE saas.toshi_generation_events SET event_kind=event_kind',[],/TOSHI_GENERATION_EVENT_IMMUTABLE/);
 success('audit events are immutable and rollback refuses any conversation, message or operation history');
 await client.query('ROLLBACK'); assert.deepEqual(await merchantDigests(),originalData);
 for(const name of ['conversations','messages','generation_operations','generation_events'])assert.equal((await client.query(`SELECT count(*)::integer count FROM saas.toshi_${name}`)).rows[0].count,0);
 success('every fixture and merchant clone mutation rolled back while leaving only SQL164 applied');
 // Two independent transactions prove the actor lease after a committed reservation.
 const firstClient=new pg.Client({connectionString, connectionTimeoutMillis: 10000, statement_timeout: 60000}), secondClient=new pg.Client({connectionString, connectionTimeoutMillis: 10000, statement_timeout: 60000});await firstClient.connect();await secondClient.connect();
 try {
  for(const c of [firstClient,secondClient])assert.equal((await c.query('SELECT current_database() db')).rows[0].db,expectedDatabase);
  const selected=(await client.query("SELECT m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version FROM saas.memberships m JOIN saas.stores st ON st.id=m.store_id JOIN saas.subscriptions s ON s.store_id=m.store_id JOIN saas.toshi_provider_configs p ON p.store_id=m.store_id AND p.status='active' AND p.is_default WHERE m.role='store_owner' AND m.status='active' AND st.status='active' AND s.status='active' ORDER BY m.store_id LIMIT 1")).rows[0];
  assert.ok(selected,'active cloned default needed for concurrency');
  const a=[selected.store_id,selected.principal_id,selected.membership_id,selected.plan_id,selected.plan_code,Number(selected.plan_version),at(0)],op=randomUUID();await firstClient.query('BEGIN');assert.equal((await invoke('toshi_conversation_begin_turn',[...a,op,fp([a[0],a[1],null,null,'Concurrency']),null,null,'Concurrency'],firstClient)).outcome,'ready');
  await secondClient.query('BEGIN');await secondClient.query("SET LOCAL statement_timeout='250ms'");
  await assert.rejects(()=>invoke('toshi_conversation_begin_turn',[...a,randomUUID(),fp(['second']),null,null,'Second'],secondClient),/statement timeout/);await secondClient.query('ROLLBACK');
  await firstClient.query('COMMIT');
  await secondClient.query('BEGIN');assert.equal((await invoke('toshi_conversation_begin_turn',[...a,randomUUID(),fp(['third']),null,null,'Third'],secondClient)).outcome,'turn_busy');await secondClient.query('ROLLBACK');
  await firstClient.query('BEGIN');assert.equal((await invoke('toshi_conversation_fail_turn',[...a,op,'cancelled'],firstClient)).outcome,'failed');await firstClient.query('COMMIT');
  success('independent transactions serialize concurrent reservations and see a committed actor-wide lease without a second charge');
 }finally{await firstClient.end();await secondClient.end();}
 assert.deepEqual(await merchantDigests(),originalData);
 const result={database:expectedDatabase,migrationSha256:createHash('sha256').update(up).digest('hex'),passed:report.length,checks:report,existingTablesConserved:Object.keys(originalData).length,existingFunctionsConserved:originalFunctions.length,fixturePolicy:'Lifecycle fixtures rolled back; one cancelled concurrency operation retained only in named disposable clone. No provider calls or credential reads.'};
 writeFileSync(evidencePath,JSON.stringify(result,null,2),{mode:0o600});console.log(`PASS ${report.length}/${report.length}`);
}finally{try{await client.query('ROLLBACK');}catch{}await client.end();}
