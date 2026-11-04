import {actualBaselineOptions,applyAdmittedActualBaseline} from './loyalty-actual-baseline.mjs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import pgDriver from 'pg';
import {initializeLoyaltyProductionRuntime} from '../../../lib/native-loyalty/production.ts';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,pg=startDisposablePostgres({database:'loyalty504_native'}),{sql}=pg;
const lit=x=>`'${String(x).replaceAll("'","''")}'`,json=x=>`${lit(JSON.stringify(x))}::jsonb`,id=n=>`50410000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owned=q=>sql('SET ROLE celebix_saas_owner;'+q),query=q=>JSON.parse(sql(q)),PLAN='00000000-0000-4000-8000-000000000010';
const NOW=new Date(Date.now()+120_000).toISOString(),LATER=new Date(Date.parse(NOW)+1_000).toISOString();
const failures=[],sources={};let passed=0;
const catalogue=()=>query(`SELECT jsonb_build_object('routines',(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace),'triggers',(SELECT jsonb_object_agg(t.tgrelid::regclass::text||':'||t.tgname,pg_get_triggerdef(t.oid))FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='saas'::regnamespace AND NOT t.tgisinternal),'indexes',(SELECT jsonb_object_agg(indexname,indexdef)FROM pg_indexes WHERE schemaname='saas'))`);
async function check(label,run){try{await run();passed++;console.log(`PASS ${label}`);}catch(error){failures.push({label,message:error.message,stack:error.stack});console.error(`FAIL ${label}: ${error.message}`);}}
function setup(base,changes={}){
 const t={store:id(base),principal:id(base+1),membership:id(base+2),customer:id(base+3),account:id(base+4),otherCustomer:id(base+5),otherAccount:id(base+6),product:id(base+10),variant:id(base+11),host:`loyalty-${base}.saas-staging.celebix.site`,key:'loyalty-fixture',digest:'a'.repeat(64),otherDigest:'b'.repeat(64)};
 t.config={schemaVersion:1,template:'product_gift',target:5,eligibleProductIds:[],reward:{kind:'gift',variantId:t.variant,quantity:1},minimumBasketMinor:0,rewardMinimumBasketMinor:0,channels:['storefront','in_store','manual'],startsAt:null,endsAt:null,timezone:'Europe/Istanbul',repeat:true,maxOncePerDay:false,allowMultiplePrograms:false,allowCombination:false,progressExpiryDays:null,rewardExpiryDays:null,...changes};
 owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${t.store}','Loyalty ${base}','loyalty-${base}','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${t.principal}','fixture','loyalty-${base}','owner-${base}@test.invalid',true,'2026-01-01','2026-01-01');
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${t.membership}','${t.principal}','${t.store}','store_owner','active','2026-01-01','2026-01-01');
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(base+7)}','${t.store}','${PLAN}','professional',2,'active','2026-01-01','2026-01-01','2026-01-01');
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)VALUES('${id(base+8)}','${t.store}','${t.host}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)VALUES('${t.product}','${t.store}','coffee','Kahve','active','TRY','2026-01-01','2026-01-01');
 SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT set_config('saas.inventory.source_id','${id(base+9)}',false);SELECT set_config('saas.inventory.source_time','${NOW}',false);
 INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at)VALUES('${t.variant}','${t.product}','${t.store}','Kahve',100,40,true,10,'active','2026-01-01','2026-01-01');

 ${[[t.customer,t.account,t.digest],[t.otherCustomer,t.otherAccount,t.otherDigest]].map(([customer,account,digest],i)=>`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,created_at,updated_at)VALUES('${customer}','${t.store}','active','Müşteri','${i}','2026-01-01','2026-01-01');INSERT INTO saas.storefront_accounts(id,store_id,customer_id,email,email_normalized,phone_normalized,phone_verified_at,status,verified_at,last_login_at,created_at,updated_at)VALUES('${account}','${t.store}','${customer}',NULL,NULL,'+905${String(base+i).padStart(9,'0')}','2026-01-01','active','2026-01-01','2026-01-01','2026-01-01','2026-01-01');INSERT INTO saas.storefront_account_sessions(id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,created_at,last_seen_at,idle_expires_at,absolute_expires_at)VALUES('${id(base+20+i)}','${t.store}','${account}','full','${t.key}','${digest}','${'c'.repeat(64)}','Fixture','${'d'.repeat(64)}','${NOW}','${NOW}','${new Date(Date.parse(NOW)+30*86_400_000).toISOString()}','${new Date(Date.parse(NOW)+30*86_400_000).toISOString()}');`).join('')}`);
 const save=admin(t,'save',{name:'Sadakat',enabled:true,config:t.config});assert.equal(save.outcome,'committed',JSON.stringify(save));t.program=save.result_payload.program.id;return t;
}
function admin(t,action,payload,op=randomUUID()){return query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.loyalty_admin_command_v1('${t.store}','${t.principal}','${t.membership}','${PLAN}','professional',2,'${NOW}',${lit(action)},'${op}',${json(payload)})r`);}
function customer(t,action,payload={},digest=t.digest,now=LATER){return query(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r)FROM saas.loyalty_customer_command_v1('${t.host}','${now}',${json([{keyId:t.key,digest}])},${lit(action)},'${randomUUID()}',${json(payload)})r`);}
function issue(t,amount=5){const result=admin(t,'adjust',{programId:t.program,customerId:t.customer,delta:amount,reason:'Yetkili düzeltmesi'});assert.equal(result.outcome,'committed',JSON.stringify(result));return query(`SELECT to_jsonb(r)FROM saas.loyalty_rewards r WHERE store_id='${t.store}'ORDER BY sequence DESC LIMIT 1`);}
function normalHosted(t,base,{ordinary=false,noReward=false,verified=true}={}){
 const cart=id(base),profile=id(base+1),method=id(base+2),op=id(base+3),session=id(base+4),orderId=id(base+5),cartDigest='e'.repeat(64),now=LATER,oneDay=new Date(Date.parse(LATER)+86400000).toISOString();
 const sealed={algorithm:'A256GCM',ciphertext:'AA',iv:'AAAAAAAAAAAAAAAA',keyId:'loyalty-hosted',tag:'AAAAAAAAAAAAAAAAAAAAAA',version:1};
 owned(`INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)VALUES('paytr_iframe','payment_processing','test',1,'sha256:${'8'.repeat(64)}','sandbox_ready',true,'${NOW}')ON CONFLICT(provider_code,environment)DO UPDATE SET enabled=true,adapter_version=EXCLUDED.adapter_version,evidence_digest=EXCLUDED.evidence_digest,readiness=EXCLUDED.readiness,approved_at=EXCLUDED.approved_at;
 INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)VALUES('${profile}','${t.store}','paytr_iframe','payment_processing','{"environment":"test"}','fixture-***',${json(sealed)},'${'7'.repeat(64)}','loyalty-hosted',1,1,'active',1,'${NOW}','${NOW}','${NOW}','test',1,'sha256:${'8'.repeat(64)}','test',1);
 INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)VALUES('${method}','${t.store}','provider','${profile}','paytr_iframe','Hosted fixture','active',9100,'{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',1,'${NOW}','${NOW}');
 INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,status,config,version,created_at,updated_at)VALUES('${id(base+15)}','${t.store}','shipping_setting','Standart','active','{"regions":["TR"],"estimatedDays":3,"shippingPriceCents":40}',1,'${NOW}','${NOW}');
 UPDATE saas.customers SET phone=(SELECT phone_normalized FROM saas.storefront_accounts WHERE store_id='${t.store}'AND customer_id='${t.customer}'),email='member-${base}@test.invalid'WHERE store_id='${t.store}'AND id='${t.customer}';

 UPDATE saas.products SET tax_treatment='taxable',tax_rate_bps=1000 WHERE store_id='${t.store}'AND id='${t.product}';
 INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${cart}','${t.store}','active',1,'${oneDay}','${now}','${now}');
 INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)VALUES('${cart}','${t.store}','cart504','${cartDigest}','${oneDay}');
 INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)VALUES('${cart}','${t.store}','${t.product}','${t.variant}',3,100,0,'${now}','${now}');`);
 const reward=noReward?null:issue(t);if(ordinary){const promotion=id(base+17),codeId=id(base+18),rule=query(`SET ROLE celebix_saas_owner;SELECT saas.loyalty_rule_v1(${json({...t.config})},'TRY')`);rule.trigger={kind:'code',codes:['ORDINARY504']};owned(`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)VALUES('${promotion}','${t.store}','Normal kampanya','active',1,${json(rule)},'${NOW}','${NOW}');INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at)VALUES('${randomUUID()}','${t.store}','${promotion}',1,${json(rule)},'${NOW}');INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at)VALUES('${codeId}','${t.store}','${promotion}','ORDINARY504','active','${NOW}');`);reward.code='ORDINARY504';reward.code_id=codeId;}
 const cartCandidates=[{keyId:'cart504',digest:cartDigest}],accountCandidates=verified?[{keyId:t.key,digest:t.digest}]:[],codes=reward?[reward.code]:[];
 const delivery={contact:{firstName:'Müşteri',lastName:'0',email:`member-${base}@test.invalid`,phone:sql(`SELECT phone FROM saas.customers WHERE id='${t.customer}'`)},shippingAddress:{line1:'Deneme Caddesi 1',city:'Istanbul',country:'TR'}};
 const rpc=(name,args)=>query(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r)FROM saas.${name}(${args})r`);
 const quoted=rpc('public_checkout_quote_v3',`${lit(t.host)},'${now}','cart',${json(cartCandidates)},${json(accountCandidates)},ARRAY[${codes.map(lit).join(',')}]::text[],'{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}'`);
 assert.equal(quoted.outcome,'quoted',JSON.stringify(quoted));
 const authority=rpc('public_storefront_hosted_checkout_authority_v4',`${lit(t.host)},'${now}','cart',${json(cartCandidates)},1,${json(delivery)},'${method}',${json(accountCandidates)},${json(codes)},'${orderId}','${t.customer}','${op}',${lit(quoted.result_payload.quoteDigest)}`);
 if(authority.outcome!=='found'){const raw=rpc('public_storefront_hosted_checkout_authority_v2',`${lit(t.host)},'${now}','cart',${json(cartCandidates)},1,${json(delivery)},'${method}',${json(accountCandidates)},${json(codes)},'${orderId}','${t.customer}','${op}'`);throw Error(JSON.stringify({authority,quoted,raw}));}const a=authority.result_payload;
 const beginArgs=`${lit(t.host)},'${now}','cart',${json(cartCandidates)},1,${json(delivery)},'${method}',${lit(a.authorityDigest)},'${op}','${'1'.repeat(64)}','${session}','${createHash('sha256').update('callback:'+base).digest('hex')}','${orderId}','${a.customerId}','${id(base+6)}','${id(base+7)}','${id(base+8)}','${id(base+9)}','pay504','${'3'.repeat(64)}','receipt504','${'4'.repeat(64)}','customer504','${'5'.repeat(64)}',${json(accountCandidates)},${json(codes)},${lit(a.evaluatorAuthorityDigest)},${lit(a.pricingDigest)}`;
 const begun=rpc('public_storefront_hosted_checkout_begin_v5',beginArgs);assert.equal(begun.outcome,'created',JSON.stringify(begun));
 const attempt=sql(`SELECT payment_attempt_id FROM saas.storefront_hosted_checkout_sessions WHERE id='${session}'`),expires=sql(`SELECT saas.loyalty_iso_v1(coalesce(promotion_reservation_expires_at,receipt_expires_at))FROM saas.storefront_hosted_checkout_sessions WHERE id='${session}'`);
 const unknown=query(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.payment_attempt_mark_unknown('${attempt}','${randomUUID()}','${'7'.repeat(64)}',1,1,NULL,'provider_outcome_unknown','${now}')r`);assert.equal(unknown.outcome,'provider_outcome_unknown',JSON.stringify(unknown));
 return{cart,session,attempt,orderId,reward,expires,beginArgs,authority:a};
}
function reconcile(h,status,now,amount=null,currency='TRY'){
 const expectedVersion=Number(sql(`SELECT version FROM saas.payment_attempts WHERE id='${h.attempt}'`)),lease=randomUUID(),leaseEnd=new Date(Date.parse(now)+60000).toISOString();
 const claim=query(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.payment_attempt_claim_reconciliation('${h.attempt}','${randomUUID()}','${'8'.repeat(64)}',${expectedVersion},'loyalty504','${lease}','${now}','${leaseEnd}','test',1,'sha256:${'8'.repeat(64)}')r`);assert.equal(claim.outcome,'claimed',JSON.stringify(claim));
 const op=randomUUID(),fp='9'.repeat(64),args=`'${h.attempt}','${op}','${fp}',${expectedVersion+1},'loyalty504','${lease}',1,'${status}',NULL,'${status==='captured'?'payment_captured':'provider_declined'}',${amount??h.authority.totalMinor},'${currency}','${now}'`;
 return{result:query(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.payment_attempt_finalize_reconciliation_guarded(${args})r`),args};
}
const projectionDirectory=process.argv.includes('--write-release-projections')?path.resolve(dir,'../../../../../.tmp/loyalty-release-20261104'):null;
const projection=projectionDirectory?spawnSync('python3',[path.join(projectionDirectory,'native_operator.py'),'projection'],{encoding:'utf8',timeout:20000}):null;
if(projection&&projection.status!==0)throw Error('release_projection_source_unavailable');
const captureStage=stage=>{if(!projectionDirectory)return;const entries=[];for(const version of[502,503,504]){if(stage==='before'||Number(stage.slice(5))<version)continue;const table=version===502?'loyalty_migration_baseline':`loyalty${version}_functions`;entries.push(`'${version}',(SELECT coalesce(jsonb_agg(jsonb_build_object('identity',identity,'definition',definition,'patched_hash',patched_hash)ORDER BY identity),'[]'::jsonb)FROM saas.${table})`);}const baselines=entries.length?`jsonb_build_object(${entries.join(',')})`:`'{}'::jsonb`,source=projection.stdout.trim().replace(/;$/,'')+`||jsonb_build_object('migrationBaselines',${baselines});`,file=path.join(projectionDirectory,`fixture-${stage}.json`);writeFileSync(file,sql(source)+'\n',{mode:0o600});chmodSync(file,0o600);};
try{
 const actualOptions=actualBaselineOptions();if(actualOptions){sources.actualBaseline=applyAdmittedActualBaseline(pg,dir,actualOptions);}else{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=501&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(readFileSync(path.join(dir,f),'utf8'));
 }
 captureStage('before');
 for(const [version,stem]of[[502,'loyalty_programs'],[503,'loyalty_checkout_pos']]){const source=readFileSync(path.join(dir,`202611040${version}_${stem}.up.sql`),'utf8');sources[`native${version}Up`]=createHash('sha256').update(source).digest('hex');sql(source);captureStage(`after${version}`);} 
 const up=readFileSync(path.join(dir,'202611040504_loyalty_bank_settlement.up.sql'),'utf8'),down=readFileSync(path.join(dir,'202611040504_loyalty_bank_settlement.down.sql'),'utf8');sources.native504Up=createHash('sha256').update(up).digest('hex');sources.native504Down=createHash('sha256').update(down).digest('hex');
 const before=catalogue();
 if(!process.argv.includes('--baseline-red'))await check('pristine 504 rollback/reapply restores every routine, ACL, trigger and index exactly twice',()=>{
  sql(up);captureStage('after504');const once=catalogue();sql(up);assert.deepEqual(catalogue(),once);sql(readFileSync(path.join(dir,'202611040504_loyalty_bank_settlement_assertions.sql'),'utf8'));
  assert.throws(()=>sql(down),/LOYALTY504_DOWN_OPT_IN_REQUIRED/);
  sql("SET celebix.allow_loyalty504_down='on';"+down);assert.deepEqual(catalogue(),before);sql(up);assert.deepEqual(catalogue(),once);
  sql("SET celebix.allow_loyalty504_down='on';"+down);assert.deepEqual(catalogue(),before);
 });
 await check('real non-superuser worker remains disabled when 503 exists but settlement capability 504 is absent',async()=>{
  sql('CREATE ROLE loyalty_runtime504 LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;GRANT celebix_saas_workflow TO loyalty_runtime504;');
  const pool=new pgDriver.Pool({...pg.poolOptions,user:'loyalty_runtime504'}),database={name:pg.database,url:`postgresql://unused:unused@localhost/${pg.database}`,ca:'fixture-only'};
  await assert.rejects(initializeLoyaltyProductionRuntime(database,{createPool:()=>pool,now:()=>new Date(LATER)}),/loyalty_production_preflight_failed/);
 });
 // GIVEN a completed platform release, before creating the pre-504 expired hold.
 // Catalog exports above deliberately retain the native default of ready=false.
 assert.equal(owned('SELECT ready FROM saas.loyalty_release_state WHERE singleton'),'f');
 assert.equal(owned(`UPDATE saas.loyalty_release_state SET ready=true,completed_at='${NOW}' WHERE singleton RETURNING ready`),'t');
 const legacy=setup(100),legacyH=normalHosted(legacy,10000),legacyLate=new Date(Date.parse(legacyH.expires)+1000).toISOString();
 owned(`SELECT saas.promotion_expire_due_reservations_v1('${legacyLate}',500)`);assert.equal(sql(`SELECT min(status)FROM saas.promotion_usage_reservations WHERE store_id='${legacy.store}'`),'expired');
 if(!process.argv.includes('--baseline-red')){sql(up);}
 await check('full public checkout repairs actually expired reservation only after exact guarded late bank capture',()=>{
  assert.equal(customer(legacy,'prepare-reward',{rewardId:legacyH.reward.id},legacy.digest,legacyLate).outcome,'reward_unavailable');
  const captured=reconcile(legacyH,'captured',legacyLate);assert.equal(captured.result.outcome,'captured',JSON.stringify(captured.result));
  assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='${legacyH.session}'`),'captured');
  assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE store_id='${legacy.store}'AND id='${legacyH.orderId}'AND payment_status='completed'AND total_cents=240 AND discount_cents=100 AND shipping_cents=40`),'1');
  assert.equal(sql(`SELECT count(*)FROM saas.promotion_redemptions WHERE store_id='${legacy.store}'AND code_id='${legacyH.reward.code_id}'AND order_id='${legacyH.orderId}'`),'1');
  assert.equal(sql(`SELECT status FROM saas.loyalty_rewards WHERE id='${legacyH.reward.id}'`),'used');
  const boundGroup=sql(`SELECT promotion_reservation_group_id FROM saas.storefront_hosted_checkout_sessions WHERE id='${legacyH.session}'`);assert.equal(owned(`SELECT saas.loyalty504_captured_group_v1('${legacy.store}','${boundGroup}','${id(99999)}','${legacyLate}')`),'f');assert.equal(owned(`SELECT saas.loyalty504_hosted_proof_v1('${legacy.store}','${id(99998)}','${boundGroup}','${legacyH.orderId}','${legacyLate}',true)`),'f');
  assert.equal(sql(`SELECT stock_quantity FROM saas.product_variants WHERE store_id='${legacy.store}'AND id='${legacy.variant}'`),'7');
  assert.equal(sql(`SELECT count(*)FROM saas.checkout_inventory_reservations WHERE store_id='${legacy.store}'AND storefront_hosted_session_id='${legacyH.session}'AND status='consumed'AND quantity=3 AND stock_tracked`),'1');
  assert.equal(sql(`SELECT count(*)FROM saas.accounting_events WHERE store_id='${legacy.store}'AND kind='collection'`),'0');
  const financial=query(`SELECT jsonb_build_object('tax',(SELECT to_jsonb(r)FROM saas.product_tax_order_revisions r WHERE store_id='${legacy.store}'AND order_id='${legacyH.orderId}'ORDER BY order_version DESC LIMIT 1),'receivable',(SELECT to_jsonb(r)FROM saas.accounting_receivables r WHERE store_id='${legacy.store}'AND order_id='${legacyH.orderId}'))`);assert.equal(financial.receivable,null);
  assert.ok(financial.tax);assert.equal(financial.tax.total_gross_cents,200);assert.equal(financial.tax.vat_cents,18);
  const memberProof=query(`SELECT to_jsonb(member)FROM saas.loyalty_order_members member WHERE store_id='${legacy.store}'AND order_id='${legacyH.orderId}'`);assert.equal(memberProof.account_id,legacy.account);assert.equal(memberProof.customer_id,legacy.customer);assert.equal(memberProof.source_kind,'account_session');
  const earned=query(`SET ROLE celebix_saas_workflow;SELECT saas.loyalty_process_pending_v1('${new Date(Date.parse(legacyLate)+10).toISOString()}',20)`);assert.equal(earned.failed,0);assert.equal(sql(`SELECT amount FROM saas.loyalty_order_effects WHERE store_id='${legacy.store}'AND order_id='${legacyH.orderId}'`),'2');
  const replay=query(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.payment_attempt_finalize_reconciliation_guarded(${captured.args})r`);assert.equal(replay.outcome,'operation_replayed');
  assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE store_id='${legacy.store}'`),'1');assert.equal(sql(`SELECT count(*)FROM saas.promotion_redemptions WHERE store_id='${legacy.store}'`),'1');assert.equal(sql(`SELECT stock_quantity FROM saas.product_variants WHERE id='${legacy.variant}'`),'7');
  const status=query(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r)FROM saas.public_storefront_hosted_checkout_status('${legacy.host}','${legacyLate}','[{"keyId":"pay504","digest":"${'3'.repeat(64)}"}]')r`);assert.equal(status.outcome,'found');assert.equal(status.result_payload.status,'captured');
 });
 await check('later legitimate refund callback preserves the original late-capture promotion history',()=>{
  const refundAt=new Date(Date.parse(legacyLate)+1000).toISOString(),version=Number(sql(`SELECT version FROM saas.payment_attempts WHERE id='${legacyH.attempt}'`)),digest=createHash('sha256').update('callback:10000').digest('hex');
  const callback=query(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.payment_attempt_settle_callback('paytr_iframe','${digest}','${randomUUID()}','${'a'.repeat(64)}','${'b'.repeat(64)}',${version},1,'partially_refunded',NULL,'payment_partially_refunded',240,'TRY','${refundAt}')r`);assert.equal(callback.outcome,'partially_refunded',JSON.stringify(callback));
  const redemption=sql(`SELECT redemption_group_id FROM saas.promotion_redemptions WHERE store_id='${legacy.store}'AND order_id='${legacyH.orderId}'`);assert.equal(owned(`SELECT saas.promotion_commit_integrity_valid_v1('${legacy.store}','${redemption}')`),'t');
  assert.equal(sql(`SELECT status FROM saas.loyalty_rewards WHERE id='${legacyH.reward.id}'`),'used');assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE store_id='${legacy.store}'`),'1');
 });
 await check('verified earning-only checkout survives late capture after logout without any reward code',()=>{
  const t=setup(900),h=normalHosted(t,14000,{noReward:true}),late=new Date(Date.parse(h.expires)+1000).toISOString();owned(`UPDATE saas.storefront_account_sessions SET revoked_at='${new Date(Date.parse(LATER)+1000).toISOString()}',revocation_reason='logout'WHERE store_id='${t.store}'AND account_id='${t.account}'`);
  assert.equal(sql(`SELECT saas.storefront_available_stock('${t.store}','${t.variant}','${late}',NULL)`),'7');const captured=reconcile(h,'captured',late);assert.equal(captured.result.outcome,'captured');
  assert.equal(sql(`SELECT total_cents FROM saas.orders WHERE store_id='${t.store}'AND id='${h.orderId}'`),'340');assert.equal(sql(`SELECT count(*)FROM saas.promotion_redemptions WHERE store_id='${t.store}'`),'0');
  const member=query(`SELECT to_jsonb(member)FROM saas.loyalty_order_members member WHERE store_id='${t.store}'AND order_id='${h.orderId}'`);assert.equal(member.account_id,t.account);assert.equal(member.customer_id,t.customer);assert.equal(member.source_kind,'account_session');
  const earned=query(`SET ROLE celebix_saas_workflow;SELECT saas.loyalty_process_pending_v1('${late}',20)`);assert.equal(earned.failed,0);assert.equal(sql(`SELECT amount FROM saas.loyalty_order_effects WHERE store_id='${t.store}'AND order_id='${h.orderId}'`),'3');assert.equal(sql(`SELECT stock_quantity FROM saas.product_variants WHERE id='${t.variant}'`),'7');
 });
 await check('ordinary guest bank payment succeeds but never earns from matching verified-account contact',()=>{
  const t=setup(1100),h=normalHosted(t,15000,{noReward:true,verified:false}),early=new Date(Date.parse(LATER)+5000).toISOString();const captured=reconcile(h,'captured',early);assert.equal(captured.result.outcome,'captured');assert.equal(sql(`SELECT count(*)FROM saas.loyalty_order_members WHERE store_id='${t.store}'`),'0');
  const earned=query(`SET ROLE celebix_saas_workflow;SELECT saas.loyalty_process_pending_v1('${early}',20)`);assert.equal(earned.failed,0);assert.equal(sql(`SELECT count(*)FROM saas.loyalty_order_effects WHERE store_id='${t.store}'`),'0');
 });
 await check('unknown bank stock and reward holds survive both TTLs; definitive decline releases both',()=>{
  const t=setup(300),h=normalHosted(t,11000),late=new Date(Date.parse(h.expires)+1000).toISOString();
  assert.equal(sql(`SELECT saas.storefront_available_stock('${t.store}','${t.variant}','${late}',NULL)`),'7');
  assert.equal(owned(`SELECT saas.promotion_expire_due_reservations_v1('${late}',500)`),'0');assert.equal(sql(`SELECT min(status)FROM saas.promotion_usage_reservations WHERE store_id='${t.store}'`),'reserved');
  const group=sql(`SELECT promotion_reservation_group_id FROM saas.storefront_hosted_checkout_sessions WHERE id='${h.session}'`),fp=sql(`SET ROLE celebix_saas_owner;SELECT saas.promotion_operation_fingerprint_v2('release','${t.store}',jsonb_build_object('reservationGroupId','${group}'::uuid))`);
  const released=query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.promotion_release_reservation_group_v1('${t.store}','${randomUUID()}','${fp}','${group}','${late}')r`);assert.equal(released.outcome,'invalid_transition');
  const declined=reconcile(h,'failed',late);assert.equal(declined.result.outcome,'failed');assert.equal(sql(`SELECT saas.storefront_available_stock('${t.store}','${t.variant}','${late}',NULL)`),'10');assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='${h.session}'`),'failed');assert.equal(sql(`SELECT min(status)FROM saas.promotion_usage_reservations WHERE store_id='${t.store}'`),'released');
  assert.equal(customer(t,'prepare-reward',{rewardId:h.reward.id},t.digest,late).outcome,'committed');assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE store_id='${t.store}'`),'0');
 });
 await check('unproved late calls, unrelated order, wrong currency and runtime direct helper access stay denied',()=>{
  const t=setup(500),h=normalHosted(t,12000),late=new Date(Date.parse(h.expires)+1000).toISOString(),group=sql(`SELECT promotion_reservation_group_id FROM saas.storefront_hosted_checkout_sessions WHERE id='${h.session}'`);
  const proof=(store,order)=>owned(`SELECT saas.loyalty504_captured_group_v1('${store}','${group}','${order}','${late}')`);assert.equal(proof(t.store,h.orderId),'f');assert.equal(proof(t.store,id(999)),'f');assert.equal(proof(legacy.store,h.orderId),'f');
  const fp=sql(`SET ROLE celebix_saas_owner;SELECT saas.promotion_operation_fingerprint_v2('commit','${t.store}',jsonb_build_object('reservationGroupId','${group}'::uuid,'orderId','${h.orderId}'::uuid))`),unproved=query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.promotion_commit_reservation_group_v1('${t.store}','${randomUUID()}','${fp}','${group}','${h.orderId}','${late}')r`);assert.equal(unproved.outcome,'reservation_expired');
  const wrong=reconcile(h,'captured',late,240,'USD');assert.notEqual(wrong.result.outcome,'captured');assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE store_id='${t.store}'`),'0');
  for(const role of['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow'])assert.throws(()=>sql(`SET ROLE ${role};SELECT saas.loyalty504_captured_group_v1('${t.store}','${group}','${h.orderId}','${late}')`),/permission denied/);
 });
 await check('ordinary promotion TTL and offline authority are not relaxed by loyalty bank settlement',()=>{
  const t=setup(700),h=normalHosted(t,13000,{ordinary:true}),late=new Date(Date.parse(h.expires)+1000).toISOString(),group=sql(`SELECT promotion_reservation_group_id FROM saas.storefront_hosted_checkout_sessions WHERE id='${h.session}'`);
  assert.equal(owned(`SELECT saas.loyalty504_pending_group_v1('${t.store}','${group}','${late}')`),'f');
  assert.equal(owned(`SELECT saas.promotion_expire_due_reservations_v1('${late}',500)`),'1');assert.equal(sql(`SELECT min(status)FROM saas.promotion_usage_reservations WHERE store_id='${t.store}'`),'expired');
  assert.throws(()=>reconcile(h,'captured',late),/STOREFRONT_HOSTED_CHECKOUT_V2_PROMOTION_EXPIRED/);assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE store_id='${t.store}'`),'0');
 });
 await check('real non-superuser workflow starts only after all three native capabilities are present',async()=>{
  const pool=new pgDriver.Pool({...pg.poolOptions,user:'loyalty_runtime504'}),database={name:pg.database,url:`postgresql://unused:unused@localhost/${pg.database}`,ca:'fixture-only'};
  const runtime=await initializeLoyaltyProductionRuntime(database,{createPool:()=>pool,now:()=>new Date(LATER)});try{const processed=await runtime.runOnce();assert.equal(processed.failed,0);}finally{await runtime.close();}
 });
 if(!process.argv.includes('--baseline-red'))sql(readFileSync(path.join(dir,'202611040504_loyalty_bank_settlement_assertions.sql'),'utf8'));
 console.log(JSON.stringify({passed,failed:failures.length,postgresqlMajor:16,externalConnections:0,productionMutations:0,sources,failures}));if(failures.length)process.exitCode=1;
}finally{pg.stop();}
