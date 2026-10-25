import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,fixture=startDisposablePostgres({database:'panel_session_30_days272_native'}),{sql}=fixture;
const read=file=>readFileSync(path.join(dir,file),'utf8'),lit=value=>`'${String(value).replaceAll("'","''")}'`,json=value=>lit(JSON.stringify(value))+'::jsonb';
const owned=q=>sql('SET ROLE celebix_saas_owner;'+q),query=q=>JSON.parse(sql(q)),identity=q=>query('SET ROLE celebix_saas_identity;SELECT row_to_json(r) FROM '+q+' r');
const digest=value=>createHash('sha256').update(value).digest('hex'),candidate=()=>({sessionId:randomUUID(),familyId:randomUUID(),operationId:randomUUID(),tokenKeyId:'test272',tokenDigest:digest(randomUUID()),completionCiphertext:'fixture.encrypted.completion'});
const up='202610240272_panel_session_30_days.up.sql',down='202610240272_panel_session_30_days.down.sql';
const functionSnapshot=()=>sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=271&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 const untouched=sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname NOT IN('issue_panel_session','redeem_cross_host_panel_handoff','merchant_whatsapp_command')");
 const S=randomUUID(),OTHER=randomUUID(),P=randomUUID(),M=randomUUID(),OM=randomUUID(),legacy=candidate();
 owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${S}','Session272','session272','active','tr','TRY','starter',now(),now()),('${OTHER}','Session272 other','session272-other','active','tr','TRY','starter',now(),now());
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://identity.example.test','session272','session272@example.test',true,now(),now());
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${M}','${P}','${S}','store_owner','active',now(),now()),('${OM}','${P}','${OTHER}','store_owner','active',now(),now());
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)SELECT gen_random_uuid(),id,'00000000-0000-4000-8000-000000000010','professional',2,'active','2026-01-01',now(),now()FROM saas.stores WHERE id IN('${S}','${OTHER}');
 INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,created_at,updated_at,management)VALUES('${randomUUID()}','${S}','session272.example.test','platform_subdomain','active',true,now(),now(),now(),'platform'),('${randomUUID()}','${OTHER}','other272.example.test','platform_subdomain','active',true,now(),now(),now(),'platform');`);
 const issue=(c,{principal=P,store=S,expires="now()+interval '8 hours'",now='now()'}={})=>identity(`saas.issue_panel_session('${c.sessionId}','${c.familyId}','${c.operationId}','${c.tokenKeyId}','${c.tokenDigest}','${principal}','${store}',${now},${expires})`);
 assert.equal(issue(legacy).outcome,'issued');const legacyBefore=sql(`SELECT to_jsonb(s) FROM saas.panel_sessions s WHERE session_id='${legacy.sessionId}'`);
 if(!process.argv.includes('--before-fix')){
  const before=functionSnapshot(),signature='saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz)',definition=sql(`SELECT pg_get_functiondef('${signature}'::regprocedure)`);
  owned(`GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_workflow`);assert.throws(()=>sql(read(up)),/SESSION_30D272_PREDECESSOR_DRIFT/);owned(`REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_workflow`);
  const drift=definition.replace(/\nBEGIN\b/,'\nBEGIN /* fixture predecessor drift272 */');assert.notEqual(drift,definition);owned(drift);assert.throws(()=>sql(read(up)),/SESSION_30D272_PREDECESSOR_DRIFT/);assert.equal(sql("SELECT to_regclass('saas.panel_session_30_days272_functions')IS NULL"),'t');owned(definition);
  sql(read(up));assert.throws(()=>sql(read(up)),/SESSION_30D272_ALREADY_INSTALLED/);assert.throws(()=>sql(read(down)),/SESSION_30D272_ROLLBACK_CONFIRMATION_REQUIRED/);
  sql("SET celebix.allow_native272_down='on';"+read(down));assert.equal(functionSnapshot(),before,'empty rollback restores exact predecessor metadata');sql(read(up));
  check('source and ACL drift fail atomically; empty rollback restores all predecessors',()=>assert.equal(sql(`SELECT to_jsonb(s) FROM saas.panel_sessions s WHERE session_id='${legacy.sessionId}'`),legacyBefore));
 }
 const command=(action,input)=>identity(`saas.merchant_whatsapp_command(${lit(action)},${json(input)})`);
 const actor={actorTokenKeyId:legacy.tokenKeyId,actorTokenDigest:legacy.tokenDigest};
 const prepare=(purpose,{phoneDigest=digest('session272-phone'),host='session272.example.test',actor:actorInput}={})=>{
  const binding={pendingId:randomUUID(),pendingDigest:digest(randomUUID()),browserDigest:digest(randomUUID()),environment:'test272'};
  const input={...binding,...actorInput,operationId:randomUUID(),purpose,phoneKeyId:'phone272',phoneDigest,phoneCiphertext:'fixture.encrypted.phone',phoneMasked:'***272',destinationHostname:host,ipDigest:null,recipientBudgetDigest:digest(randomUUID()),challengeId:randomUUID(),codeDigest:digest('123456')};
  assert.equal(command('prepare',input).outcome,'prepared');assert.equal(command('finish_delivery',{...binding,challengeId:input.challengeId,status:'accepted'}).outcome,'accepted');
  return{binding,input,verify:{...binding,...actorInput,...candidate(),challengeId:input.challengeId,codeDigest:input.codeDigest}};
 };
 const bound=prepare('bind_phone',{actor}),boundResult=command('verify',bound.verify);assert.equal(boundResult.outcome,'phone_bound');
 const fixed30=result=>assert.equal(Date.parse(result.authority.session.expiresAt)-Date.parse(result.authority.session.issuedAt),2_592_000_000);
 check('accepted WhatsApp bind issues a fixed 30 day session and assurance',()=>{fixed30(boundResult);assert.equal(sql(`SELECT a.expires_at=s.expires_at AND a.created_at=s.issued_at AND a.expires_at=a.created_at+interval '30 days' FROM saas.admin_login_assurance a JOIN saas.panel_sessions s ON s.family_id=a.family_id WHERE s.session_id='${bound.verify.sessionId}'`),'t');});
 const login=prepare('login'),loginResult=command('verify',login.verify);assert.equal(loginResult.outcome,'issued');
 check('new OTP login and exact completion replay keep the same 30 day deadline',()=>{fixed30(loginResult);assert.deepEqual(command('verify',login.verify).authority,loginResult.authority);assert.equal(command('verify',login.verify).outcome,'operation_replayed');});
 check('administrator and cashier OTP sign-ins receive the same fixed 30 day session',()=>{
  for(const role of ['admin','cashier']){
   const principal=randomUUID(),phone=digest('session272-'+role);
   owned(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at,authority_kind)VALUES('${principal}','urn:celebix:merchant-phone','${principal}',NULL,false,now(),now(),'phone');INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${randomUUID()}','${principal}','${S}','${role}','active',now(),now());INSERT INTO saas.merchant_phone_identities(id,phone_key_id,phone_digest,phone_ciphertext,phone_masked,principal_id,verified_at)VALUES('${randomUUID()}','phone272','${phone}','fixture.encrypted.phone','***272','${principal}',now());`);
   const staff=prepare('login',{phoneDigest:phone}),result=command('verify',staff.verify);assert.equal(result.outcome,'issued');fixed30(result);
  }
 });
 const dst=prepare('login'),dstResult=query(`SET TIMEZONE='Europe/Berlin';SET ROLE celebix_saas_identity;SELECT row_to_json(r)FROM saas.merchant_whatsapp_command('verify',${json(dst.verify)})r`);
 check('30 days means exactly 2592000 seconds through a DST timezone transition',()=>{assert.equal(dstResult.outcome,'issued');fixed30(dstResult);});
 const rebind=prepare('bind_phone',{actor:{actorTokenKeyId:login.verify.tokenKeyId,actorTokenDigest:login.verify.tokenDigest}}),rebindResult=command('verify',rebind.verify);
 check('fresh verified phone rebind issues its own fixed 30 day session',()=>{assert.equal(rebindResult.outcome,'phone_bound');fixed30(rebindResult);});
 check('existing 8 hour session is preserved exactly',()=>{assert.equal(sql(`SELECT to_jsonb(s) FROM saas.panel_sessions s WHERE session_id='${legacy.sessionId}'`),legacyBefore);});
 check('generic legacy issuer cannot acquire an arbitrary 30 day session',()=>{assert.equal(issue(candidate(),{expires:"now()+interval '30 days'"}).outcome,'durable_authority_invalid');assert.equal(issue(candidate()).outcome,'issued');});
 const assured=(method='whatsapp',{age='0 seconds',lifetime='30 days',principal=P,store=S}={})=>{
  const c=candidate();owned(`INSERT INTO saas.admin_login_factors(principal_id)VALUES('${principal}')ON CONFLICT DO NOTHING;INSERT INTO saas.admin_login_assurance(family_id,principal_id,security_version,expires_at,legacy,session_id,operation_id,token_key_id,token_digest,created_at,authentication_method)SELECT '${c.familyId}','${principal}',security_version,now()-interval '${age}'+interval '${lifetime}',false,'${c.sessionId}','${c.operationId}','${c.tokenKeyId}','${c.tokenDigest}',now()-interval '${age}','${method}' FROM saas.admin_login_factors WHERE principal_id='${principal}';`);return c;
 };
 check('30 day boundary is accepted only with matching valid WhatsApp credentials',()=>{
  const c=assured();const times=query(`SELECT jsonb_build_object('start',created_at,'end',expires_at)FROM saas.admin_login_assurance WHERE family_id='${c.familyId}'`);assert.equal(issue(c,{now:lit(times.start),expires:lit(times.end)}).outcome,'issued');
  const altered=assured();assert.equal(issue({...altered,tokenDigest:digest('wrong-binding')},{expires:"now()+interval '30 days'"}).outcome,'mfa_required');
  const tooLong=assured('whatsapp',{lifetime:'30 days 1 second'}),tooLongTimes=query(`SELECT jsonb_build_object('start',created_at,'end',expires_at)FROM saas.admin_login_assurance WHERE family_id='${tooLong.familyId}'`);assert.equal(issue(tooLong,{now:lit(tooLongTimes.start),expires:lit(tooLongTimes.end)}).outcome,'durable_authority_invalid');
 });
 check('non-WhatsApp and expired security-version assurance cannot issue beyond 8 hours',()=>{
  const password=assured('password_whatsapp');assert.equal(issue(password,{expires:"now()+interval '29 days'"}).outcome,'durable_authority_invalid');
  const expired=assured('whatsapp',{age:'31 days'});assert.equal(issue(expired,{expires:"now()+interval '1 hour'"}).outcome,'mfa_required');
  const stale=assured();owned(`UPDATE saas.admin_login_assurance SET security_version=security_version+1 WHERE family_id='${stale.familyId}'`);assert.equal(issue(stale,{expires:"now()+interval '29 days'"}).outcome,'mfa_required');
 });
 const resolve=c=>identity(`saas.resolve_panel_session('${c.tokenKeyId}','${c.tokenDigest}',now())`),rotate=(c,store=S)=>{const next=candidate();const result=identity(`saas.rotate_panel_session('${c.tokenKeyId}','${c.tokenDigest}','${next.sessionId}','${next.operationId}','${next.tokenKeyId}','${next.tokenDigest}','${store}',now())`);return{...next,familyId:c.familyId,result};};
 check('activity rotation and store switching preserve the original deadline',()=>{
  assert.equal(resolve(login.verify).outcome,'resolved');const rotated=rotate(login.verify,OTHER);assert.equal(rotated.result.outcome,'rotated');assert.equal(rotated.result.authority.session.expiresAt,loginResult.authority.session.expiresAt);assert.equal(rotated.result.authority.session.issuedAt,loginResult.authority.session.issuedAt);assert.equal(resolve(rotated).outcome,'resolved');
 });
 const handoff=(c,store=S,host='session272.example.test')=>{const h={id:randomUUID(),op:randomUUID(),digest:digest(randomUUID()),next:candidate()};assert.equal(identity(`saas.issue_cross_host_panel_handoff('${c.tokenKeyId}','${c.tokenDigest}','${h.id}','${h.op}','test272','${h.digest}','${store}','${host}',now(),now()+interval '2 minutes')`).outcome,'handoff_issued');return h;};
 const redeem=(h,expires="now()+interval '30 days'",host='session272.example.test')=>identity(`saas.redeem_cross_host_panel_handoff('test272','${h.digest}','${host}','${h.next.operationId}','${h.next.sessionId}','${h.next.familyId}','test272','${h.next.tokenDigest}',now(),${expires})`);
 check('domain handoff retains source expiry and original WhatsApp assurance issue time',()=>{
  const h=handoff(bound.verify),r=redeem(h);assert.equal(r.outcome,'redeemed');assert.equal(r.authority.session.expiresAt,boundResult.authority.session.expiresAt);assert.equal(sql(`SELECT a.created_at=b.created_at AND a.expires_at=b.expires_at FROM saas.admin_login_assurance a JOIN saas.admin_login_assurance b ON b.family_id='${bound.verify.familyId}' WHERE a.family_id='${h.next.familyId}'`),'t');
  const again=handoff(h.next),rr=redeem(again);assert.equal(rr.outcome,'redeemed');assert.equal(rr.authority.session.expiresAt,boundResult.authority.session.expiresAt);
 });
 check('a second handoff cannot expand a shorter WhatsApp session to its longer assurance deadline',()=>{
  const h=handoff(bound.verify),r=redeem(h,"now()+interval '24 hours'");assert.equal(r.outcome,'redeemed');
  const next=handoff(h.next),result=redeem(next);assert.equal(result.outcome,'redeemed');assert.equal(result.authority.session.expiresAt,r.authority.session.expiresAt);
 });
 check('legacy domain handoff cannot extend an existing 8 hour deadline',()=>{const h=handoff(legacy),r=redeem(h,"now()+interval '8 hours'");assert.equal(r.outcome,'redeemed');assert.equal(Date.parse(r.authority.session.expiresAt),Date.parse(JSON.parse(legacyBefore).expires_at));});
 check('historical WhatsApp session reads after 8 hours and rejects at its original 30 day deadline',()=>{
  for(const age of ['9 hours','29 days 23 hours 59 minutes 55 seconds']){
   const c=assured('whatsapp',{age});owned(`INSERT INTO saas.panel_sessions(session_id,family_id,operation_id,operation_kind,token_key_id,token_digest,principal_id,active_store_id,version,issued_at,rotated_at,expires_at,created_at,updated_at)SELECT '${c.sessionId}',family_id,'${c.operationId}','issue','${c.tokenKeyId}','${c.tokenDigest}',principal_id,'${S}',1,created_at,created_at,expires_at,created_at,created_at FROM saas.admin_login_assurance WHERE family_id='${c.familyId}'`);
   assert.equal(resolve(c).outcome,'resolved');if(age.startsWith('29 days'))assert.equal(identity(`saas.resolve_panel_session('${c.tokenKeyId}','${c.tokenDigest}',clock_timestamp()+interval '10 seconds')`).outcome,'unauthenticated');
  }
 });
 check('logout revokes the session and invalidates an outstanding domain handoff',()=>{const h=handoff(rebind.verify);assert.equal(identity(`saas.revoke_panel_session('test272','${rebind.verify.tokenDigest}','logout',now())`).outcome,'revoked');assert.notEqual(resolve(rebind.verify).outcome,'resolved');assert.equal(redeem(h).outcome,'mfa_required');});
 owned("UPDATE saas.merchant_whatsapp_policy SET central_hostnames=ARRAY['panel272.example.test'],signup_enabled=true");
 const signup=prepare('signup',{phoneDigest:digest('signup272'),host:'panel272.example.test'});assert.equal(command('verify',signup.verify).outcome,'phone_verified');
 const signupP=sql(`SET ROLE celebix_saas_bootstrap;SELECT saas.merchant_whatsapp_bootstrap_principal('${signup.binding.pendingId}','${signup.binding.pendingDigest}','${signup.binding.browserDigest}','test272','${randomUUID()}','${S}')->>'id'`);
 owned(`INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${randomUUID()}','${signupP}','${S}','store_owner','active',now(),now());`);
 const claim={...signup.binding,...candidate(),storeId:S},claimResult=command('claim_signup',claim);
 check('verified signup completion issues one fixed 30 day session',()=>{assert.equal(claimResult.outcome,'issued');fixed30(claimResult);assert.equal(command('claim_signup',claim).outcome,'operation_replayed');});
 check('membership removal immediately denies a 30 day session',()=>{owned(`UPDATE saas.memberships SET status='revoked' WHERE principal_id='${signupP}'`);assert.equal(resolve(claim).outcome,'membership_denied');});
 check('security-version change immediately denies the remaining long session',()=>{owned(`UPDATE saas.admin_login_factors SET security_version=security_version+1 WHERE principal_id='${P}'`);assert.equal(resolve(bound.verify).outcome,'mfa_required');});
 check('central owner TOTP, legacy email handoffs, customer sessions and unrelated SQL stay byte-identical',()=>assert.equal(sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname NOT IN('issue_panel_session','redeem_cross_host_panel_handoff','merchant_whatsapp_command')"),untouched));
 check('persisted 30 day authority prevents destructive rollback even after revocation',()=>assert.throws(()=>sql("SET celebix.allow_native272_down='on';"+read(down)),/SESSION_30D272_ROLLBACK_IN_USE/));
 sql(read('202610240272_panel_session_30_days_assertions.sql'));
 if(process.argv.includes('--dump-installed'))console.log(sql("SELECT jsonb_build_object('kind','native272Installed','sourceFunctionMetadataSha256',(SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text)::text,'UTF8')),'hex')FROM pg_proc p JOIN saas.panel_session_30_days272_functions f ON f.signature=p.oid::regprocedure::text),'functionCount',(SELECT count(*)FROM saas.panel_session_30_days272_functions),'constraints',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'name',constraint_name,'hash',published_sha256)ORDER BY table_name,constraint_name)FROM saas.panel_session_30_days272_constraints))"));
 console.log(`Native panel session272: ${checks} checks passed`);
}finally{fixture.stop();}
