import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// This harness is allowed to write only to the named disposable production clone.
// It never contacts DeepSeek or sends a real credential to an external service.
const connectionString = process.env.DEEPSEEK_DATABASE_URL ?? readFileSync("/tmp/deepseek-qa.env", "utf8").match(/^DEEPSEEK_DATABASE_URL=(.*)$/m)?.[1];
if (!connectionString) throw Error("DEEPSEEK_QA_CONNECTION_REQUIRED");
const client = new pg.Client({ connectionString });
const sqlRoot = new URL("../../../apps/owner/scripts/sql/saas/", import.meta.url);
const up = readFileSync(new URL("202609260163_toshi_deepseek_provider.up.sql", sqlRoot), "utf8");
const down = readFileSync(new URL("202609260163_toshi_deepseek_provider.down.sql", sqlRoot), "utf8");
const body = (sql) => sql.replace(/^BEGIN;\n/, "").replace(/COMMIT;\s*$/, "");
const report = [];
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const success = (label) => { report.push(label); console.log(`PASS ${label}`); };
const changedNames = new Set(["toshi_provider_public_payload", "toshi_provider_connection_identity", "toshi_provider_connect", "toshi_provider_select_model", "toshi_provider_set_default", "toshi_provider_revoke", "toshi_provider_get_authority", "toshi_provider_list", "toshi_provider_envelope_valid"]);
async function functions() {
 return (await client.query(`SELECT p.oid::regprocedure::text signature,p.proname name,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text acl
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.prokind='f' ORDER BY p.oid::regprocedure::text`)).rows;
}
async function vault() {
 const result = {};
 for (const name of ["configs", "operations", "events"]) {
  result[name] = (await client.query(`SELECT count(*)::integer count,md5(COALESCE(string_agg(row_json,E'\n' ORDER BY row_json),'')) digest
 FROM (SELECT to_jsonb(t)::text row_json FROM saas.toshi_provider_${name} t) rows`)).rows[0];
 }
 return result;
}
async function boundaries() {
 return (await client.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl,pg_get_userbyid(c.relowner) owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas'
 AND c.relname IN ('toshi_provider_configs','toshi_provider_operations','toshi_provider_events') ORDER BY c.relname`)).rows;
}
async function constraints() {
 return (await client.query(`SELECT conname,pg_get_constraintdef(oid) definition,convalidated FROM pg_constraint
 WHERE conname IN ('toshi_provider_configs_provider_check','toshi_provider_events_provider_check') ORDER BY conname`)).rows;
}
async function deniedSql(sql, args, message) {
 await client.query("SAVEPOINT denied_sql");
 await assert.rejects(() => client.query(sql, args), message);
 await client.query("ROLLBACK TO SAVEPOINT denied_sql"); await client.query("RELEASE SAVEPOINT denied_sql");
}
async function invoke(name, args) {
 await client.query("SET LOCAL ROLE celebix_saas_app");
 try {
  return (await client.query(`SELECT outcome,result_payload FROM saas.${name}(${args.map((_,i)=>`$${i+1}`).join(",")})`, args.map(value => value && typeof value === "object" ? JSON.stringify(value) : value))).rows[0];
 } finally { try { await client.query("RESET ROLE"); } catch {} }
}
await client.connect();
try {
 assert.equal((await client.query("SELECT current_database() db")).rows[0].db, "celebix_deepseek_qa_20260926", "EXACT_DISPOSABLE_CLONE_REQUIRED");
 const beforeFunctions = await functions(), beforeVault = await vault(), beforeBoundaries = await boundaries(), beforeConstraints = await constraints();
 assert.equal(beforeFunctions.filter(f=>changedNames.has(f.name)).length,9);
 const existingProjection = beforeFunctions.find(f=>f.name==="toshi_provider_public_payload");
 // Guard failure must roll back any earlier replacement in the same migration.
 await client.query("BEGIN");
 await client.query(existingProjection.definition.replace("AS $function$", "AS $function$\n-- bounded QA predecessor drift"));
 await deniedSql(body(up), [], /TOSHI_DEEPSEEK_PREDECESSOR_DRIFT/);
 await client.query("ROLLBACK");
 assert.deepEqual(await functions(), beforeFunctions);success("changed predecessor definition fails closed and leaves every function unchanged");
 await client.query(up);
 const afterFunctions=await functions();
 const beforeBySignature=new Map(beforeFunctions.map(f=>[f.signature,f]));
 const changed=afterFunctions.filter(f=>beforeBySignature.has(f.signature) && f.definition!==beforeBySignature.get(f.signature).definition);
 assert.equal(changed.length,9);assert.deepEqual(new Set(changed.map(f=>f.name)),changedNames);
 assert.equal(afterFunctions.length,beforeFunctions.length+1);
 for(const next of afterFunctions) {
  const old=beforeBySignature.get(next.signature);
  if(!old){
   assert.equal(next.name,"toshi_provider_list_v2");
   const legacy=beforeFunctions.find(f=>f.name==="toshi_provider_list");
   assert.equal(next.definition,legacy.definition.replace("saas.toshi_provider_list(","saas.toshi_provider_list_v2("));
   assert.equal(next.owner,legacy.owner);assert.equal(next.acl,legacy.acl);continue;
  }
  assert.equal(next.owner,old.owner);assert.equal(next.acl,old.acl);
  const expected = old.name==="toshi_provider_envelope_valid"
   ? old.definition.replace("p_value->>'ciphertext' ~ '^[A-Za-z0-9_-]{2,21846}$'",() => "p_value->>'ciphertext' ~ '^[A-Za-z0-9_-]+$' AND pg_catalog.length(p_value->>'ciphertext') BETWEEN 2 AND 21846")
   : old.name==="toshi_provider_list"
   ? old.definition.replace("WHERE c.store_id=p_store_id AND c.status='active'","WHERE c.store_id=p_store_id AND c.status='active' AND c.provider <> 'deepseek'")
   : changedNames.has(old.name) ? old.name==="toshi_provider_public_payload"
   ? old.definition.replace("WHEN 'gemini' THEN 'Google Gemini' ELSE 'Anthropic Claude' END","WHEN 'gemini' THEN 'Google Gemini' WHEN 'deepseek' THEN 'DeepSeek' ELSE 'Anthropic Claude' END")
   : old.definition.replace("'openai','gemini','anthropic'","'openai','gemini','anthropic','deepseek'") : old.definition;
  assert.equal(next.definition,expected);
 }
 assert.deepEqual(await vault(),beforeVault);assert.deepEqual(await boundaries(),beforeBoundaries);
 for(const c of await constraints()){assert.equal(c.convalidated,true);assert.match(c.definition,/'deepseek'::text/);}
 success("migration changes nine definitions plus one authorized reader and two validated checks with all owners, ACLs, RLS and existing rows intact");
 await client.query(down);
 assert.deepEqual(await functions(),beforeFunctions);assert.deepEqual(await constraints(),beforeConstraints);assert.deepEqual(await vault(),beforeVault);
 success("clean down migration restores every original function and constraint without changing stored rows");
 await client.query(up);
 assert.deepEqual(await functions(),afterFunctions);success("clean rollback supports exact reapplication");
 const now = new Date().toISOString();
 const authorities=(await client.query(`SELECT DISTINCT ON(m.store_id) m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version
 FROM saas.memberships m JOIN saas.stores st ON st.id=m.store_id JOIN saas.subscriptions s ON s.store_id=m.store_id
 JOIN saas.plans p ON p.id=s.plan_id WHERE m.role='store_owner' AND m.status='active' AND st.status='active'
 AND s.status='active' AND p.status='active' AND s.valid_from<=now() AND (s.valid_until IS NULL OR s.valid_until>now())
 ORDER BY m.store_id,m.id LIMIT 2`)).rows;
 assert.equal(authorities.length,2,"TWO_ACTIVE_CLONE_STORES_REQUIRED");
 const auth=authorities.map(a=>[a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,Number(a.plan_version),now]);
 await client.query("BEGIN");
 // Populate missing legacy families only inside the disposable test transaction,
 // so the versioned reader is exercised with all four simultaneous connections.
 const initial=await invoke("toshi_provider_list_v2",auth[0]);
 const legacyEnvelope={algorithm:"A256GCM",ciphertext:"Y3JlZGVudGlhbA",iv:"MTIzNDU2Nzg5MDEy",keyId:"deepseek-qa-only",tag:"MTIzNDU2Nzg5MDEyMzQ1Ng",version:1};
 for(const provider of ["openai","gemini","anthropic"]) {
  if(initial.result_payload.items.some(item=>item.provider===provider)) continue;
  const model=`qa-${provider}`;
  const seeded=await invoke("toshi_provider_connect",[...auth[0],randomUUID(),fingerprint({legacySeed:provider}),randomUUID(),provider,legacyEnvelope,`sha256:${"a".repeat(64)}`,1,"••••QA00",model,[{id:model,label:model}],0]);
  assert.equal(seeded.outcome,"connected");
 }
 const originalList=await invoke("toshi_provider_list_v2",auth[0]);assert.equal(originalList.outcome,"listed");
 const priorDefault=originalList.result_payload.items.find(i=>i.isDefault);
 const models=[{id:"deepseek-chat",label:"DeepSeek Chat"},{id:"deepseek-reasoner",label:"DeepSeek Reasoner"}];
 const envelope={algorithm:"A256GCM",ciphertext:"Y3JlZGVudGlhbA",iv:"MTIzNDU2Nzg5MDEy",keyId:"deepseek-qa-only",tag:"MTIzNDU2Nzg5MDEyMzQ1Ng",version:1};
 const ciphertext = async value => (await client.query("SELECT saas.toshi_provider_envelope_valid($1::jsonb) valid",[JSON.stringify({...envelope,ciphertext:value})])).rows[0].valid;
 assert.equal(await ciphertext("ab"),true);assert.equal(await ciphertext("a".repeat(21846)),true);
 assert.equal(await ciphertext("a"),false);assert.equal(await ciphertext("a".repeat(21847)),false);assert.equal(await ciphertext("contains space"),false);
 success("encrypted envelope validator enforces the unchanged ASCII and length bounds without unsupported PostgreSQL regex quantifiers");
 const config=randomUUID(),operation=randomUUID();
 const connectArgs=[...auth[0],operation,fingerprint({deepseek:true}),config,"deepseek",envelope,`sha256:${"a".repeat(64)}`,1,"••••QA01","deepseek-chat",models,0];
 const connected=await invoke("toshi_provider_connect",connectArgs);assert.equal(connected.outcome,"connected");
 assert.equal(connected.result_payload.label,"DeepSeek");assert.equal(connected.result_payload.provider,"deepseek");assert.equal(connected.result_payload.isDefault,!priorDefault);
 assert.doesNotMatch(JSON.stringify(connected.result_payload),/sealedCredentials|ciphertext|credentialDigest|apiKey/);
 success("DeepSeek connect stores only an encrypted envelope and returns the correct secret-free label with existing-default behavior");
 const replay=await invoke("toshi_provider_connect",connectArgs);assert.equal(replay.outcome,"operation_replayed");assert.deepEqual(replay.result_payload,connected.result_payload);
 const listed=await invoke("toshi_provider_list_v2",auth[0]);assert.equal(listed.result_payload.items.length,originalList.result_payload.items.length+1);
 for(const item of originalList.result_payload.items)assert.deepEqual(listed.result_payload.items.find(next=>next.provider===item.provider),item);
 const legacyListed=await invoke("toshi_provider_list",auth[0]);
 assert.equal(legacyListed.result_payload.items.length,3);
 assert.equal(legacyListed.result_payload.items.some(item=>item.provider==="deepseek"),false);
 assert.deepEqual(legacyListed.result_payload,originalList.result_payload);
 assert.equal(listed.result_payload.items.length,4);
 success("legacy reader stays strictly three-provider compatible while versioned reader returns all four");
 const identity=await invoke("toshi_provider_connection_identity",[...auth[0],"deepseek"]);assert.equal(identity.outcome,"found");assert.deepEqual(identity.result_payload,{configId:config,credentialVersion:1,version:1});
 const authority=await invoke("toshi_provider_get_authority",[...auth[0],"deepseek"]);assert.equal(authority.outcome,"found");assert.deepEqual(authority.result_payload.sealedCredentials,envelope);
 success("list, identity, server authority and connect replay preserve tenant boundaries and existing providers");
 const wrongMembership=[...auth[0]];wrongMembership[2]=randomUUID();
 assert.equal((await invoke("toshi_provider_connection_identity",[...wrongMembership,"deepseek"])).outcome,"membership_denied");
 assert.equal((await invoke("toshi_provider_connection_identity",[...auth[1],"deepseek"])).outcome,"not_found");
 assert.equal((await invoke("toshi_provider_get_authority",[...auth[1],"deepseek"])).outcome,"not_found");
 assert.equal((await invoke("toshi_provider_connect",[...auth[1],...connectArgs.slice(7)])).outcome,"operation_mismatch");
 const deniedConnect=[...connectArgs];deniedConnect[2]=randomUUID();deniedConnect[7]=randomUUID();assert.equal((await invoke("toshi_provider_connect",deniedConnect)).outcome,"membership_denied");
 assert.equal((await invoke("toshi_provider_connection_identity",[...auth[0],"unknown"])).outcome,"invalid_input");
 success("cross-store access, replay takeover, invalid membership and unknown provider are denied");
 const modelArgs=[...auth[0],randomUUID(),fingerprint({model:"reasoner"}),"deepseek","deepseek-reasoner",1];
 const selected=await invoke("toshi_provider_select_model",modelArgs);assert.equal(selected.outcome,"updated");assert.equal(selected.result_payload.selectedModel,"deepseek-reasoner");assert.equal(selected.result_payload.version,2);
 assert.deepEqual((await invoke("toshi_provider_select_model",modelArgs)).result_payload,selected.result_payload);
 assert.equal((await invoke("toshi_provider_select_model",[...auth[0],randomUUID(),fingerprint({bad:true}),"deepseek","not-listed",2])).outcome,"model_unavailable");
 assert.equal((await invoke("toshi_provider_select_model",[...auth[0],randomUUID(),fingerprint({stale:true}),"deepseek","deepseek-chat",1])).outcome,"version_conflict");
 success("model selection retains verified allowlist, optimistic versions and immutable replay");
 const defaultArgs=[...auth[0],randomUUID(),fingerprint({default:true}),"deepseek",2];
 const defaulted=await invoke("toshi_provider_set_default",defaultArgs);assert.equal(defaulted.outcome,"updated");assert.equal(defaulted.result_payload.isDefault,true);assert.equal(defaulted.result_payload.version,3);
 const afterDefault=await invoke("toshi_provider_list_v2",auth[0]);assert.equal(afterDefault.result_payload.items.filter(i=>i.isDefault).length,1);
 const defaultAuthority=await invoke("toshi_provider_get_authority",[...auth[0],null]);assert.equal(defaultAuthority.result_payload.provider,"deepseek");
 if(priorDefault){const demoted=afterDefault.result_payload.items.find(i=>i.provider===priorDefault.provider);assert.equal(demoted.isDefault,false);assert.equal(demoted.version,priorDefault.version+1);}
 success("setting DeepSeek as default preserves the single-default invariant and Toshi authority lookup");
 const rotateArgs=[...connectArgs];rotateArgs[7]=randomUUID();rotateArgs[8]=fingerprint({rotate:true});rotateArgs[12]=`sha256:${"b".repeat(64)}`;rotateArgs[13]=2;rotateArgs[14]="••••QA02";rotateArgs[15]="deepseek-reasoner";rotateArgs[17]=3;
 const rotated=await invoke("toshi_provider_connect",rotateArgs);assert.equal(rotated.outcome,"connected");assert.equal(rotated.result_payload.version,4);assert.equal(rotated.result_payload.isDefault,true);
 assert.deepEqual((await invoke("toshi_provider_connect",connectArgs)).result_payload,connected.result_payload);
 success("credential rotation preserves encryption and old replay returns its historical public state");
 const revokeArgs=[...auth[0],randomUUID(),fingerprint({revoke:true}),"deepseek",4];
 const revoked=await invoke("toshi_provider_revoke",revokeArgs);assert.equal(revoked.outcome,"revoked");assert.equal(revoked.result_payload.status,"revoked");assert.equal(revoked.result_payload.isDefault,false);assert.equal(revoked.result_payload.version,5);
 assert.deepEqual((await invoke("toshi_provider_revoke",revokeArgs)).result_payload,revoked.result_payload);
 assert.equal((await invoke("toshi_provider_get_authority",[...auth[0],"deepseek"])).outcome,"not_found");
 const audit=(await client.query("SELECT event_kind FROM saas.toshi_provider_events WHERE config_id=$1 ORDER BY event_kind",[config])).rows.map(r=>r.event_kind);
 assert.deepEqual(audit,["connected","default_selected","model_selected","revoked","rotated"]);
 success("revocation disables authority and keeps the complete immutable lifecycle audit");
 await deniedSql(body(down),[],/TOSHI_DEEPSEEK_ROLLBACK_DATA_PRESENT/);
 assert.deepEqual(await functions(),afterFunctions);success("rollback refuses even revoked DeepSeek history without deleting credentials or replay records");
 const permissions=(await client.query("SELECT has_table_privilege('celebix_saas_app','saas.toshi_provider_configs','SELECT') direct_read,has_table_privilege('celebix_saas_app','saas.toshi_provider_configs','UPDATE') direct_write,has_function_privilege('celebix_saas_app','saas.toshi_provider_public_payload(uuid,uuid)','EXECUTE') private_projection")).rows[0];
 assert.deepEqual(permissions,{direct_read:false,direct_write:false,private_projection:false});
 await deniedSql("UPDATE saas.toshi_provider_events SET summary=summary WHERE config_id=$1",[config],/TOSHI_PROVIDER_EVENT_IMMUTABLE/);
 await deniedSql("UPDATE saas.toshi_provider_operations SET result_payload=result_payload WHERE operation_id=$1",[operation],/TOSHI_PROVIDER_OPERATION_IMMUTABLE/);
 success("application grants stay narrow and both audit and replay ledgers stay append-only");
 await client.query("ROLLBACK");assert.deepEqual(await vault(),beforeVault);success("all lifecycle test data rolls back while leaving the clone feature migration applied");
 console.log(JSON.stringify({status:"passed",tests:report.length,database:"celebix_deepseek_qa_20260926",checks:report}));
} finally { try { await client.query("ROLLBACK"); } catch {} await client.end(); }
