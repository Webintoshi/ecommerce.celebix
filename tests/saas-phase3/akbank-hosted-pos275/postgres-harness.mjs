import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {verifyScopedFairness} from './scoped-fixture.mjs';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../merchant-signup-profile/disposable-postgres.mjs';
const ROOT=path.resolve(import.meta.dirname,'../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const name='202610250275_akbank_hosted_pos',pg=startDisposablePostgres({database:'akbank_hosted_pos275'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`,j=q=>JSON.parse(sql(q));
const id=n=>`27500000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const NOW='2026-10-25T12:00:00.000Z',EXPIRES='2026-10-25T12:10:00.000Z',EVIDENCE='sha256:'+'a'.repeat(64);
const config={environment:'live',locale:'tr',threeDSecure:'provider_managed',installmentMode:'single_payment',maxInstallment:0};
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};let checks=0;
const mark=(n,options={})=>j(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.akbank_merchant_self_service_mark_verification('${id(n+100)}',${lit(options.provider??'akbank_json')},'payment_processing',${lit(options.environment??'live')},${options.adapter??1},${lit(options.worker??'worker.akbank')},${lit(options.now??NOW)},'${options.lease??id(n+200)}',${options.credentialVersion??1},${options.profileVersion??1},${lit(options.outcome??'validated')},${lit(options.code??'validated')})r`);
const profile=n=>j(`SELECT to_jsonb(p)FROM saas.merchant_provider_profiles p WHERE id='${id(n+100)}'`);
const seed=(n,{provider='akbank_json',environment='live',adapter=1}={})=>{
 const envelope={algorithm:'A256GCM',ciphertext:'AA',iv:'AAAAAAAAAAAAAAAA',keyId:'akbank-fixture',tag:'AAAAAAAAAAAAAAAAAAAAAA',version:1};
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Akbank fixture ${n}','akbank275-${n}','active','tr','TRY','starter',${lit(NOW)},${lit(NOW)});
 INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,validation_lease_id,validation_lease_owner,validation_lease_expires_at,created_at,updated_at,validation_environment,validation_adapter_version)
 VALUES('${id(n+100)}','${id(n)}',${lit(provider)},'payment_processing',${lit(JSON.stringify({environment}))}::jsonb,'Akbank hesabı',${lit(JSON.stringify(envelope))}::jsonb,'${'c'.repeat(64)}','akbank-fixture',1,1,'pending_validation',1,'${id(n+200)}','worker.akbank',${lit(EXPIRES)},${lit(NOW)},${lit(NOW)},${lit(environment)},${adapter});`);
};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=274&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=catalog();
 if(!process.argv.includes('--before-fix')){
  const signature='saas.provider_payment_method_config_valid(text,jsonb)',original=before[signature].definition;
  check('wrong predecessor body fails atomically before native admission',()=>{
   sql(original.replace("p_provider_code IN('paytr_iframe','iyzico_iframe')","false AND p_provider_code IN('paytr_iframe','iyzico_iframe')")+';');
   assert.throws(()=>sql(read(name+'.up.sql')),/AKBANK275_PREDECESSOR_INVALID/);sql(original+';');
   assert.equal(sql("SELECT to_regclass('saas.akbank_hosted_pos275_function_backup')IS NULL"),'t');
  });
  check('wrong predecessor ACL fails without accepting extra app privileges',()=>{
   sql('GRANT EXECUTE ON FUNCTION '+signature+' TO celebix_saas_app');
   assert.throws(()=>sql(read(name+'.up.sql')),/AKBANK275_PREDECESSOR_INVALID/);
   sql('REVOKE EXECUTE ON FUNCTION '+signature+' FROM celebix_saas_app');
  });
  check('wrong provider constraint fails admission and preserves the prior schema',()=>{
   sql("ALTER TABLE saas.storefront_hosted_checkout_sessions DROP CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check,ADD CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check CHECK(provider_code IN('paytr_iframe','iyzico_iframe','unexpected'))");
   assert.throws(()=>sql(read(name+'.up.sql')),/AKBANK275_CONSTRAINT_PREDECESSOR_INVALID/);
   sql("ALTER TABLE saas.storefront_hosted_checkout_sessions DROP CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check,ADD CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check CHECK(provider_code IN('paytr_iframe','iyzico_iframe'))");
  });
  sql(read(name+'.up.sql'));
 }
 check('Akbank credentials can use verification without execution authority',()=>assert.equal(sql("SELECT count(*)FROM saas.merchant_provider_definitions WHERE provider_code='akbank_json'AND capability='payment_processing'AND enabled AND allows_verification_without_execution_authority"),'1'));
 check('strict preferences admit only single payment and both implemented locales',()=>{for(const locale of ['tr','en'])assert.equal(sql(`SELECT saas.provider_payment_method_config_valid('akbank_json',${lit(JSON.stringify({...config,locale}))}::jsonb)`),'t');for(const bad of [{installmentMode:'all'},{installmentMode:'limited',maxInstallment:2},{maxInstallment:2},{threeDSecure:'disabled'},{locale:'TR'},{extra:true}])assert.equal(sql(`SELECT saas.provider_payment_method_config_valid('akbank_json',${lit(JSON.stringify({...config,...bad}))}::jsonb)`),'f');assert.equal(sql(`SELECT saas.provider_payment_method_config_valid('akbank',${lit(JSON.stringify(config))}::jsonb)`),'f');});
 if(process.argv.includes('--before-fix'))throw Error('missing RED failure');
 check('four exact replacements preserve all other routines and all existing ACLs',()=>{const after=catalog(),changed=Object.keys(after).filter(k=>before[k]&&after[k].definition!==before[k].definition);assert.deepEqual(changed.map(k=>k.split('(')[0]).sort(),['saas.provider_payment_method_config_valid','saas.storefront_hosted_checkout_authority_projection','saas.storefront_hosted_checkout_reconciliation_candidates_scoped','saas.storefront_payment_methods_projection']);for(const key of Object.keys(before)){const a={...after[key]},b={...before[key]};if(changed.includes(key)){delete a.definition;delete b.definition;}assert.deepEqual(a,b,key);}assert.equal(Object.keys(after).length,Object.keys(before).length+1);sql(read(name+'_assertions.sql'));});
 check('unused rollback requires opt-in and restores every predecessor',()=>{assert.throws(()=>sql(read(name+'.down.sql')),/AKBANK275_DOWN_OPT_IN_REQUIRED/);sql("SET celebix.allow_akbank275_down='on';"+read(name+'.down.sql'));assert.deepEqual(catalog(),before);sql(read(name+'.up.sql'));});
 seed(1);seed(2);seed(3);seed(4);seed(5);seed(6);seed(7);seed(8,{environment:'test'});seed(9,{adapter:2});
 check('credential validation alone does not grant execution or create a method',()=>{assert.equal(mark(1).outcome,'validated');assert.equal(profile(1).status,'active');assert.equal(profile(1).execution_evidence_digest,null);assert.equal(sql(`SELECT count(*)FROM saas.payment_methods WHERE store_id='${id(1)}'`),'0');assert.equal(mark(1).outcome,'operation_replayed');assert.equal(mark(1,{code:'changed'}).outcome,'operation_mismatch');});
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)VALUES('akbank_json','payment_processing','live',1,'${EVIDENCE}','production_ready',true,${lit(NOW)});`);
 check('wrong provider environment adapter worker lease version and expired claims cannot activate',()=>{const original=profile(2);for(const options of [{provider:'akbank'},{environment:'test'},{adapter:2},{worker:'worker.other'},{lease:id(999)},{profileVersion:2},{credentialVersion:2},{now:EXPIRES}])assert.notEqual(mark(2,options).outcome,'validated');assert.deepEqual(profile(2),original);});
 check('reviewed exact authority atomically binds profile and intended method and replays once',()=>{assert.equal(mark(2).outcome,'validated');const p=profile(2);assert.equal(p.execution_evidence_digest,EVIDENCE);const m=j(`SELECT to_jsonb(m)FROM saas.payment_methods m WHERE store_id='${id(2)}'`);assert.equal(m.profile_id,id(102));assert.equal(m.state,'active');assert.deepEqual(m.config,config);assert.equal(mark(2).outcome,'operation_replayed');assert.equal(j(`SELECT to_jsonb(m)FROM saas.payment_methods m WHERE store_id='${id(2)}'`).version,1);const projected=j(`SELECT saas.storefront_payment_methods_projection('${id(2)}')`);assert.equal(projected[0].providerCode,'akbank_json');assert.equal(projected[0].presentation,'form_post');assert.deepEqual(projected[0].requiredCustomerFields,[]);assert.equal(sql(`SELECT count(*)FROM saas.merchant_provider_jobs WHERE store_id='${id(2)}'`),'0');});
 check('unavailable releases lease pending and rejection cannot activate',()=>{assert.equal(mark(3,{outcome:'unavailable',code:'validation_unavailable'}).outcome,'unavailable');assert.equal(profile(3).status,'pending_validation');assert.equal(profile(3).validation_lease_id,null);assert.equal(mark(4,{outcome:'rejected',code:'credentials_rejected'}).outcome,'rejected');assert.equal(profile(4).status,'rotation_required');assert.equal(sql(`SELECT count(*)FROM saas.payment_methods WHERE store_id IN('${id(3)}','${id(4)}')`),'0');});
 check('test and different adapter validation cannot bind live authority',()=>{assert.equal(mark(8,{environment:'test'}).outcome,'validated');assert.equal(mark(9,{adapter:2}).outcome,'validated');for(const n of [8,9])assert.equal(profile(n).execution_evidence_digest,null);});
 // A working existing provider must remain active, with the new profile and lease untouched.
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,created_at,updated_at,validation_environment,validation_adapter_version)SELECT '${id(500)}','${id(5)}','paytr_iframe',capability,public_config,'Existing PayTR',sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,'active',1,created_at,updated_at,validation_environment,validation_adapter_version FROM saas.merchant_provider_profiles WHERE id='${id(105)}';INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)VALUES('${id(501)}','${id(5)}','provider','${id(500)}','paytr_iframe','Existing PayTR','active',0,${lit(JSON.stringify({...config,installmentMode:'all'}))}::jsonb,1,${lit(NOW)},${lit(NOW)});`);
 check('another active provider produces explicit conflict with no partial mutation',()=>{const before=profile(5);assert.equal(mark(5).outcome,'provider_already_active');assert.deepEqual(profile(5),before);assert.equal(sql(`SELECT state FROM saas.payment_methods WHERE id='${id(501)}'`),'active');assert.equal(sql(`SELECT count(*)FROM saas.merchant_provider_profile_operations WHERE operation_id='${id(205)}'`),'0');});
 check('workflow-only finalizer and private backup retain exact role separation',()=>{for(const role of ['celebix_saas_app','celebix_saas_identity','celebix_saas_host_resolver','celebix_saas_support_runtime'])assert.throws(()=>sql(`SET ROLE ${role};SELECT *FROM saas.akbank_merchant_self_service_mark_verification('${id(106)}','akbank_json','payment_processing','live',1,'worker.akbank',${lit(NOW)},'${id(206)}',1,1,'validated','validated')`),/permission denied/);sql(read(name+'_assertions.sql'));});
 check('scopes filter before LIMIT, admit all six identities, and reject stale or revoked authority',()=>verifyScopedFairness({sql,j,lit,id,NOW,EVIDENCE,config}));
 check('used native authority requires a forward fix rather than rollback',()=>assert.throws(()=>sql("SET celebix.allow_akbank275_down='on';"+read(name+'.down.sql')),/AKBANK275_USED_AUTHORITY_FORWARD_FIX_REQUIRED/));
 console.log(`Native Akbank275: ${checks} checks passed; ${Object.keys(before).length} predecessor routines checked`);
}finally{pg.stop();}
