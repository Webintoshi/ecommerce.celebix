import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../merchant-signup-profile/disposable-postgres.mjs';
import {authenticatePaytrIframeCallback} from '../../../packages/payment-adapters/src/providers/paytr/adapter.ts';
import {createPaytrIframeCallbackHash} from '../../../packages/payment-adapters/src/providers/paytr/config.ts';

const ROOT=path.resolve(import.meta.dirname,'../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const migration='202610260279_checkout_contexts',pg=startDisposablePostgres({database:'checkout_contexts279'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`27900000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const NOW=new Date().toISOString(),DAY=new Date(Date.parse(NOW)+86400000).toISOString(),TWO_DAYS=new Date(Date.parse(NOW)+172800000).toISOString(),HOLD=new Date(Date.parse(NOW)+900000).toISOString(),CAPTURE=new Date(Date.parse(NOW)+300000).toISOString(),HOST='contexts279.saas-staging.celebix.net',STORE=id(1),PRODUCT=id(2),VARIANT=id(3),CART=id(4),METHOD=id(5),PROFILE=id(6),EVIDENCE='sha256:'+hash('contexts279');
const sourceCandidates=[{keyId:'original279',digest:hash('original279')}];
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
function hostCall(query){return j(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r)FROM ${query}r`);}
function prepare(n,options={}){
 const selected={hostname:HOST,now:NOW,kind:'cart',candidates:sourceCandidates,version:1,customerCandidates:[],codes:[],...options};
 const delivery={contact:{firstName:'Customer',lastName:`Fixture ${n}`,email:`context-${n}@example.test`,phone:`+90555${String(n).padStart(7,'0')}`},shippingAddress:{line1:`Fixture street ${n}`,city:'Istanbul',country:'TR'},...selected.delivery};
 const result=hostCall(`saas.public_storefront_hosted_checkout_authority_v3(${lit(selected.hostname)},${lit(selected.now)},${lit(selected.kind)},${json(selected.candidates)},${selected.version},${json(delivery)},'${METHOD}',${json(selected.customerCandidates)},${json(selected.codes)},'${id(n+1000)}','${id(n+2000)}','${id(n)}',${lit(selected.expectedQuoteDigest??null)})`);
 return{n,...selected,delivery,result};
}
function begin(prepared,options={}){
 const authority=prepared.result.result_payload;
 const s={hostname:prepared.hostname,now:prepared.now,kind:prepared.kind,candidates:prepared.candidates,version:prepared.version,
  delivery:prepared.delivery,authority:authority.authorityDigest,fingerprint:hash(`context-${prepared.n}`),engine:'v4',pricing:authority.pricingDigest,...options};
 const n=prepared.n;
 return hostCall(`saas.public_storefront_hosted_checkout_begin_${s.engine}(${lit(s.hostname)},${lit(s.now)},${lit(s.kind)},${json(s.candidates)},${s.version},${json(s.delivery)},'${METHOD}',
 '${s.authority}','${id(n)}','${s.fingerprint}','${id(n+100)}','${hash('callback-'+n)}','${id(n+1000)}','${authority.customerId}','${id(n+3000)}','${id(n+4000)}','${id(n+5000)}','${id(n+6000)}',
 'pay${n}','${hash('pay-'+n)}','receipt${n}','${hash('receipt-'+n)}','customer${n}','${hash('customer-'+n)}',${json(prepared.customerCandidates)},${json(prepared.codes)},'${authority.evaluatorAuthorityDigest}','${s.pricing}')`);
}
function ready(prepared){
 const n=prepared.n,candidates=[{keyId:`pay${n}`,digest:hash('pay-'+n)}],seal={algorithm:'A256GCM',ciphertext:'AA',iv:'AAAAAAAAAAAAAAAA',keyId:'presentation279',tag:'AAAAAAAAAAAAAAAAAAAAAA',version:1};
 assert.equal(hostCall(`saas.public_storefront_hosted_checkout_presentation_save('${HOST}','${NOW}',${json(candidates)},'${id(n+7000)}','${hash('presentation-'+n)}',1,'presentation279','${hash('sealed-'+n)}',${json(seal)},'${HOLD}')`).outcome,'updated');
 assert.equal(j(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.payment_attempt_mark_initialized('${id(n)}','${id(n+8000)}','${hash('initialized-'+n)}',1,1,'awaiting_customer','${hash('callback-'+n)}','iframe_ready','${NOW}')r`).outcome,'awaiting_customer');
}
function capture(prepared){
 const n=prepared.n,amount=prepared.result.result_payload.totalMinor,oid=hash('callback-'+n),credential={merchantId:'fixture279',merchantKey:'fixture-only-key279',merchantSalt:'fixture-only-salt279'};
 const form=new URLSearchParams({merchant_oid:oid,status:'success',total_amount:String(amount),hash:createPaytrIframeCallbackHash({credential,merchantOid:oid,status:'success',totalAmount:String(amount)}),payment_type:'card',payment_amount:String(amount),currency:'TL',test_mode:'1'}).toString();
 assert.equal(authenticatePaytrIframeCallback({credential,environment:'test',form:form.replace('status=success','status=failed'),expectedPaymentAmount:amount,requirePaymentContext:true}),null,'changed signed callback must not authenticate');
 const verified=authenticatePaytrIframeCallback({credential,environment:'test',form,expectedPaymentAmount:amount,requirePaymentContext:true});assert.equal(verified?.status,'success');
 return j(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.payment_attempt_apply_hosted_callback('paytr_iframe','${oid}','${id(n+9000)}','${hash('capture-'+n)}','${hash(form)}',2,1,'captured','${oid}','captured',${amount},'TRY','${CAPTURE}')r`);
}
function seedCart(n,quantity=1){
 const candidates=[{keyId:`fixture${n}`,digest:hash('fixture-'+n)}];
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${id(n)}','${STORE}','active',1,'${TWO_DAYS}','${NOW}','${NOW}');
  INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)VALUES('${id(n)}','${STORE}','fixture${n}','${candidates[0].digest}','${DAY}');
  INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)VALUES('${id(n)}','${STORE}','${PRODUCT}','${VARIANT}',${quantity},10000,0,'${NOW}','${NOW}');`);
 return candidates;
}
function convertOffline(prepared){
 const n=prepared.n,a=prepared.result.result_payload;
 const attribution={firstTouch:{source:'unknown',medium:'unknown'},lastTouch:{source:'unknown',medium:'unknown'},landingPathGroup:'/unknown',deviceGroup:'unknown'};
 const quote=hostCall(`saas.public_checkout_quote_v3('${HOST}','${NOW}','cart',${json(prepared.candidates)},'[]'::jsonb,ARRAY[]::text[],${json(attribution)})`);assert.equal(quote.outcome,'quoted');
 return hostCall(`saas.public_checkout_complete_v3('${HOST}','${NOW}','cart',${json(prepared.candidates)},'[]'::jsonb,
  '${id(n+11000)}','${hash('offline-'+n)}',1,${json(prepared.delivery)},'cash_on_delivery',
  '${id(n+12000)}','${a.customerId}','${id(n+13000)}','${id(n+14000)}','${id(n+15000)}','offreceipt${n}','${hash('offreceipt-'+n)}','${DAY}',
  '${id(n+16000)}','offcustomer${n}','${hash('offcustomer-'+n)}','${DAY}',ARRAY[]::text[],'${quote.result_payload.quoteDigest}')`);
}
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=278&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 if(!process.argv.includes('--before-fix'))check('clean forward migration and unused opt-in rollback preserve all historical ACLs',()=>{
  const clean=catalog();sql(read(migration+'.up.sql'));
  assert.throws(()=>sql(read(migration+'.down.sql')),/CHECKOUT_CONTEXT279_DOWN_OPT_IN_REQUIRED/);
  sql("SET celebix.allow_checkout_context279_down='on';"+read(migration+'.down.sql'));
  assert.deepEqual(catalog(),clean);
 });
 // The clean baseline retains historical direct V2 grants; the measured
 // production278 predecessors admit only their V3 security-definer callers.
 // Rehearse the exact production ACL instead of broadening native admission.
 sql(`REVOKE EXECUTE ON FUNCTION
  saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb),
  saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[]),
  saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid),
  saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)
 FROM celebix_saas_host_resolver`);
 const before=catalog();writeFileSync(path.join(ROOT,'.tmp/checkout-contexts279-native-before.json'),JSON.stringify(before,null,2));
 if(!process.argv.includes('--before-fix'))sql(read(migration+'.up.sql'));
 check('independent checkout source contract exists',()=>assert.equal(sql("SELECT to_regprocedure('saas.public_storefront_hosted_checkout_begin_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)')IS NOT NULL"),'t'));
 check('only exact admitted routines change and legacy source uniqueness remains',()=>{
  const after=catalog();const allowed=['saas.public_storefront_hosted_checkout_begin_v2(','saas.storefront_hosted_checkout_promotion_terminal_v2('];for(const [signature,routine]of Object.entries(before))if(!allowed.some(p=>signature.startsWith(p)))assert.deepEqual(after[signature],routine,signature);
  assert.equal(sql("SELECT count(*)FROM pg_index WHERE indexrelid IN('saas.storefront_hosted_checkout_one_active_cart_idx'::regclass,'saas.storefront_hosted_checkout_one_active_intent_idx'::regclass)AND indisunique"),'2');
 });
 const envelope={algorithm:'A256GCM',ciphertext:'AA',iv:'AAAAAAAAAAAAAAAA',keyId:'profile279',tag:'AAAAAAAAAAAAAAAAAAAAAA',version:1};
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${STORE}','Checkout context fixture','contexts279','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)VALUES('${id(7)}','${STORE}','${HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)VALUES('${PRODUCT}','${STORE}','fixture','Fixture product','active','TRY',1,'2026-01-01','2026-01-01');
 SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT set_config('saas.inventory.source_id','${id(8)}',false);SELECT set_config('saas.inventory.source_time','${NOW}',false);
 INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)VALUES('${VARIANT}','${PRODUCT}','${STORE}','Standard','CTX279',10000,true,10,'active','{}',1,'2026-01-01','2026-01-01');
 SELECT set_config('saas.inventory.source_marker','',false);SELECT set_config('saas.inventory.source_id','',false);SELECT set_config('saas.inventory.source_time','',false);
 INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${CART}','${STORE}','active',1,'${TWO_DAYS}','${NOW}','${NOW}');
 INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)VALUES('${CART}','${STORE}','original279','${sourceCandidates[0].digest}','${DAY}');
 INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)VALUES('${CART}','${STORE}','${PRODUCT}','${VARIANT}',2,10000,0,'${NOW}','${NOW}');
 INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at)VALUES('${id(9)}','${STORE}','shipping_setting','Fixture shipping','{"regions":["TR"],"estimatedDays":3,"shippingPriceCents":0}','active','2026-01-01','2026-01-01');
 INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)VALUES('paytr_iframe','payment_processing','test',1,'${EVIDENCE}','sandbox_ready',true,'${NOW}')ON CONFLICT(provider_code,environment)DO UPDATE SET adapter_version=1,evidence_digest=EXCLUDED.evidence_digest,readiness='sandbox_ready',enabled=true,approved_at=EXCLUDED.approved_at;
 INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)
 VALUES('${PROFILE}','${STORE}','paytr_iframe','payment_processing','{"environment":"test"}','Fixture merchant',${json(envelope)},'${hash('profile279')}','profile279',1,1,'active',1,'${NOW}','${NOW}','${NOW}','test',1,'${EVIDENCE}','test',1);
 INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,created_at,updated_at)VALUES('${METHOD}','${STORE}','provider','${PROFILE}','paytr_iframe','Fixture card','active',0,'{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}','${NOW}','${NOW}');
 INSERT INTO saas.payment_methods(id,store_id,kind,label,state,position,config,created_at,updated_at)VALUES('${id(12)}','${STORE}','cash_on_delivery','Fixture delivery payment','active',1,'{"instructions":""}','${NOW}','${NOW}');`);
 let first,second;
 check('independent customer A starts a future context through unchanged quote authority',()=>{
  first=prepare(20);assert.equal(first.result.outcome,'found',JSON.stringify(first.result));assert.equal(first.result.result_payload.totalMinor,20000);
  const result=begin(first);assert.equal(result.outcome,'created',JSON.stringify(result));ready(first);
  assert.equal(sql(`SELECT context_version FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(20)}'`),'2');
 });
 check('same operation replays once and changed operation payload is rejected',()=>{
  const beforeCount=sql(`SELECT count(*)FROM saas.payment_attempts WHERE store_id='${STORE}'`);
  assert.equal(begin(first).outcome,'operation_replayed');assert.equal(begin(first,{fingerprint:hash('tampered')}).outcome,'operation_mismatch');
  assert.equal(sql(`SELECT count(*)FROM saas.payment_attempts WHERE store_id='${STORE}'`),beforeCount);
 });
 check('customer B can start independently on the same cart with different frozen amount',()=>{
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.storefront_cart_items SET quantity=3,updated_at='${NOW}'WHERE cart_id='${CART}';UPDATE saas.storefront_carts SET version=version+1 WHERE id='${CART}';`);
  second=prepare(21,{version:2});assert.equal(second.result.outcome,'found',JSON.stringify(second.result));assert.equal(second.result.result_payload.totalMinor,30000);
  assert.notEqual(first.result.result_payload.customerId,second.result.result_payload.customerId);
  const result=begin(second);assert.equal(result.outcome,'created',JSON.stringify(result));ready(second);
  assert.equal(sql(`SELECT count(*)FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}'AND context_version=2 AND status='provider_ready'`),'2');
 });
 check('legacy admission still rejects a second active attempt on that source',()=>{
  const legacy=prepare(22,{version:2});assert.equal(legacy.result.outcome,'found');assert.equal(begin(legacy,{engine:'v3'}).outcome,'attempt_in_progress');
 });
 check('foreign hosts and source credentials cannot use an operation UUID',()=>{
  assert.equal(begin(first,{hostname:'foreign.saas-staging.celebix.net'}).outcome,'not_found');
  assert.equal(begin(first,{candidates:[{keyId:'original279',digest:hash('foreign')}]}).outcome,'not_found');
  assert.equal(sql(`SELECT count(*)FROM saas.storefront_checkout_contexts279 WHERE store_id='${STORE}'`),'2');
 });
 check('native customer identity collision protection remains enforced',()=>{
  const mismatch=prepare(23,{version:2,delivery:{contact:{...first.delivery.contact,phone:second.delivery.contact.phone}}});
  assert.equal(mismatch.result.outcome,'invalid_input');
 });
 check('signed B callback captures only its frozen order and converts the original source',()=>{
  assert.equal(capture(second).outcome,'captured');assert.equal(sql(`SELECT status FROM saas.storefront_carts WHERE id='${CART}'`),'converted');
  assert.equal(sql(`SELECT total_cents FROM saas.orders WHERE id='${id(1021)}'`),'30000');
  assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(20)}'`),'provider_ready');
 });
 check('out of order signed A callback captures independently after source conversion',()=>{
  assert.equal(capture(first).outcome,'captured');
  assert.deepEqual(j(`SELECT jsonb_agg(jsonb_build_object('total',total_cents,'name',customer_name)ORDER BY total_cents)FROM saas.orders WHERE store_id='${STORE}'`),[{total:20000,name:'Customer Fixture 20'},{total:30000,name:'Customer Fixture 21'}]);
  assert.equal(sql(`SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}'`),'5');
  assert.equal(sql(`SELECT count(*)FROM saas.checkout_inventory_reservations WHERE store_id='${STORE}'AND status='consumed'`),'2');
  assert.equal(sql(`SELECT count(*)||':'||bool_and(source_cart_id='${CART}')FROM saas.abandoned_carts WHERE store_id='${STORE}'`),'1:true','only the real original basket is represented');
 });
 check('context lookup is exact and retains role separation',()=>{
  for(const n of[20,21])assert.equal(sql(`SET ROLE celebix_saas_host_resolver;SELECT saas.storefront_checkout_context279_for_attempt('${STORE}','${id(n)}','${CAPTURE}')`),'t');
  assert.equal(sql(`SET ROLE celebix_saas_host_resolver;SELECT saas.storefront_checkout_context279_for_attempt('${id(999)}','${id(20)}','${NOW}')`),'f');
  assert.throws(()=>sql('SET ROLE celebix_saas_host_resolver;SELECT *FROM saas.storefront_checkout_contexts279'),/permission denied/);
  assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT saas.storefront_checkout_context279_for_attempt('${STORE}','${id(20)}','${NOW}')`),/permission denied/);
 });
 check('price confirmation and inventory limits remain authoritative with atomic failed admission',()=>{
  const candidates=[{keyId:'stock279',digest:hash('stock279')}];
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${id(50)}','${STORE}','active',1,'${TWO_DAYS}','${NOW}','${NOW}');
   INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)VALUES('${id(50)}','${STORE}','stock279','${hash('stock279')}','${DAY}');
   INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)VALUES('${id(50)}','${STORE}','${PRODUCT}','${VARIANT}',4,10000,0,'${NOW}','${NOW}');`);
  const selected=prepare(50,{candidates});assert.equal(selected.result.outcome,'found');
  assert.equal(begin(selected,{pricing:hash('changed-quote')}).outcome,'price_changed');
  assert.equal(sql(`SELECT count(*)FROM saas.storefront_checkout_contexts279 WHERE operation_id='${id(50)}'`),'0','a failed start cannot leave an admission marker');
  assert.equal(begin(selected).outcome,'created');ready(selected);
  assert.equal(prepare(51,{candidates}).result.outcome,'authority_unavailable','another tab cannot reserve inventory which no longer exists');
  assert.equal(sql(`SELECT count(*)FROM saas.storefront_checkout_contexts279 WHERE operation_id='${id(51)}'`),'0');
 });
 check('private native marker is immutable and cannot be forged by ordinary roles',()=>{
  assert.throws(()=>sql(`SET ROLE celebix_saas_owner;UPDATE saas.storefront_checkout_contexts279 SET fingerprint='${hash('forged')}'WHERE operation_id='${id(20)}'`),/CHECKOUT_CONTEXT279_IMMUTABLE/);
  assert.throws(()=>sql(`SET ROLE celebix_saas_host_resolver;INSERT INTO saas.storefront_checkout_contexts279 SELECT *FROM saas.storefront_checkout_contexts279`),/permission denied/);
 });
 check('an already issued legacy payment survives a new context capturing the same source first',()=>{
  const candidates=[{keyId:'legacy279',digest:hash('legacy279')}];
  sql(`SET ROLE celebix_saas_owner;SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT set_config('saas.inventory.source_id','${id(70)}',false);SELECT set_config('saas.inventory.source_time','${CAPTURE}',false);
   UPDATE saas.product_variants SET stock_quantity=stock_quantity+20,version=version+1,updated_at='${CAPTURE}'WHERE id='${VARIANT}';
   SELECT set_config('saas.inventory.source_marker','',false);SELECT set_config('saas.inventory.source_id','',false);SELECT set_config('saas.inventory.source_time','',false);
   INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${id(70)}','${STORE}','active',1,'${TWO_DAYS}','${NOW}','${NOW}');
   INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)VALUES('${id(70)}','${STORE}','legacy279','${hash('legacy279')}','${DAY}');
   INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)VALUES('${id(70)}','${STORE}','${PRODUCT}','${VARIANT}',1,10000,0,'${NOW}','${NOW}');`);
  const legacy=prepare(70,{candidates});assert.equal(legacy.result.outcome,'found');assert.equal(begin(legacy,{engine:'v3'}).outcome,'created');ready(legacy);
  assert.equal(sql(`SELECT context_version FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(70)}'`),'1');
  const current=prepare(71,{candidates});assert.equal(current.result.outcome,'found');assert.equal(begin(current).outcome,'created');ready(current);
  assert.equal(capture(current).outcome,'captured');assert.equal(capture(legacy).outcome,'captured');
  assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE store_id='${STORE}'AND id IN('${id(1070)}','${id(1071)}')`),'2');
  assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(70)}'`),'captured');
 });
 check('captured context provenance from a different source never authorizes a legacy converted basket',()=>{
  const candidates=seedCart(80),legacy=prepare(80,{candidates});assert.equal(legacy.result.outcome,'found');assert.equal(begin(legacy,{engine:'v3'}).outcome,'created');ready(legacy);
  assert.equal(convertOffline(legacy).outcome,'committed');
  assert.equal(capture(legacy).outcome,'captured');
  assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(80)}'`),'stock_conflict');
  assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE id='${id(1080)}'`),'0');
 });
 check('a pending marker cannot authorize legacy converted source settlement',()=>{
  const candidates=seedCart(83),legacy=prepare(83,{candidates});assert.equal(legacy.result.outcome,'found');assert.equal(begin(legacy,{engine:'v3'}).outcome,'created');ready(legacy);
  const current=prepare(84,{candidates});assert.equal(current.result.outcome,'found');assert.equal(begin(current).outcome,'created');ready(current);
  assert.equal(convertOffline(legacy).outcome,'committed');
  assert.equal(capture(legacy).outcome,'captured');
  assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(83)}'`),'stock_conflict');
  assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(84)}'`),'provider_ready');
 });
 check('a later source version cannot reuse otherwise matching captured marker provenance',()=>{
  const candidates=seedCart(86),legacy=prepare(86,{candidates});assert.equal(legacy.result.outcome,'found');assert.equal(begin(legacy,{engine:'v3'}).outcome,'created');ready(legacy);
  const current=prepare(87,{candidates});assert.equal(current.result.outcome,'found');assert.equal(begin(current).outcome,'created');ready(current);assert.equal(capture(current).outcome,'captured');
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.storefront_carts SET version=version+1 WHERE id='${id(86)}'`);
  assert.equal(capture(legacy).outcome,'captured');assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE payment_attempt_id='${id(86)}'`),'stock_conflict');
 });
 check('returning guest segment promotion cannot drift an opaque customer scoped quote into another amount',()=>{
  const candidates=seedCart(90),customer=first.result.result_payload.customerId;
  const rule={schemaVersion:1,benefit:{kind:'percentage',percentageBps:1000},targets:{mode:'all',include:[],exclude:[]},audience:{mode:'customer_segments',referenceIds:[id(90)]},trigger:{kind:'automatic'},schedule:{timezone:'Europe/Istanbul'},limits:{totalUsage:null,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},conditions:{minimumBasketMinor:0,minimumQuantity:0,minimumProductQuantity:0},combinationPolicy:{kind:'none'},priority:0,marginPolicy:{kind:'warn'},progressMessagePolicy:{enabled:false}};
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
   SELECT '${id(92)}','${STORE}',id,plan_code,version,'active',valid_from,'${NOW}','${NOW}'FROM saas.plans WHERE plan_code='professional'AND status='active'AND valid_from<='${NOW}'AND(valid_until IS NULL OR valid_until>'${NOW}')ORDER BY version DESC LIMIT 1;
   INSERT INTO saas.customer_segments(id,store_id,name,created_at,updated_at)VALUES('${id(90)}','${STORE}','Fixture returning customers','${NOW}','${NOW}');
   INSERT INTO saas.customer_segment_memberships(store_id,customer_id,segment_id,assigned_at)VALUES('${STORE}','${customer}','${id(90)}','${NOW}');
   INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)VALUES('${id(91)}','${STORE}','Segment fixture','active',1,${json(rule)},'${NOW}','${NOW}');
   INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at)VALUES('${id(91)}','${STORE}','${id(91)}',1,${json(rule)},'${NOW}');
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${id(93)}','https://fixture279.invalid','pricing279','pricing279@example.test',true,'${NOW}','${NOW}');
   INSERT INTO saas.pricing_dynamic_activation(store_id,enabled)VALUES('${STORE}',true);
   INSERT INTO saas.pricing_reference_definitions(id,store_id,kind,label,created_by,created_at)VALUES('${id(94)}','${STORE}','usd','Fixture USD','${id(93)}','${NOW}');
   INSERT INTO saas.pricing_reference_sets(id,store_id,version,created_by,created_at)VALUES('${id(95)}','${STORE}',1,'${id(93)}','${NOW}');
   INSERT INTO saas.pricing_reference_set_values(store_id,set_id,reference_id,rate_try,active)VALUES('${STORE}','${id(95)}','${id(94)}',1,true);
   INSERT INTO saas.pricing_reference_state(store_id,active_set_id,version,last_set_version,updated_at)VALUES('${STORE}','${id(95)}',1,1,'${NOW}');
   INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,source_amount,reference_id,labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at)
   VALUES('${STORE}','${VARIANT}',1,'usd',100,'${id(94)}','none',0,0,false,jsonb_build_object('method','usd','sourceAmount','100','referenceId','${id(94)}','upliftPercent','0'),'${id(93)}','${NOW}');
   INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version)VALUES('${STORE}','${VARIANT}',1);`);
  assert.equal(sql(`SELECT saas.lucky_wheel_feature_enabled_v1('${STORE}','${NOW}')`),'t','the segmented promotion must actually be enabled');
  const attribution={firstTouch:{source:'unknown',medium:'unknown'},lastTouch:{source:'unknown',medium:'unknown'},landingPathGroup:'/unknown',deviceGroup:'unknown'};
  const quote=hostCall(`saas.public_checkout_quote_v3('${HOST}','${NOW}','cart',${json(candidates)},'[]'::jsonb,ARRAY[]::text[],${json(attribution)})`);assert.equal(quote.outcome,'quoted',JSON.stringify(quote));
  assert.equal(sql(`SELECT count(*)FROM saas.merchant_checkout_quotes_233 WHERE quote_digest='${quote.result_payload.quoteDigest}'`),'1','exercise a genuinely opaque source/customer bound native233 quote');
  const selected=prepare(90,{candidates,delivery:{contact:first.delivery.contact},expectedQuoteDigest:quote.result_payload.quoteDigest});
  const retry=prepare(96,{candidates,delivery:{contact:first.delivery.contact},expectedQuoteDigest:quote.result_payload.quoteDigest});
  assert.equal(retry.result.outcome,selected.result.outcome,'report whether refreshing an anonymous customer scope can resolve a returning customer promotion');
  if(selected.result.outcome==='found'){
   assert.equal(selected.result.result_payload.totalMinor,quote.result_payload.quote.cart.totalCents);
   assert.equal(begin(selected).outcome,'created');
  }else{
   assert.equal(selected.result.outcome,'price_changed');
   assert.equal(sql(`SELECT count(*)FROM saas.payment_attempts WHERE id='${id(90)}'`),'0');
   assert.equal(sql(`SELECT count(*)FROM saas.storefront_checkout_contexts279 WHERE operation_id='${id(90)}'`),'0');
  }
 });
 check('native schema assertions pass',()=>sql(read(migration+'_assertions.sql')));
 writeFileSync(path.join(ROOT,'.tmp/checkout-contexts279-native-after.json'),JSON.stringify(catalog(),null,2));
 writeFileSync(path.join(ROOT,'.tmp/checkout-contexts279-schema.json'),JSON.stringify(j(readFileSync(path.join(import.meta.dirname,'schema-readiness.sql'),'utf8')),null,2));
 console.log(`Checkout contexts279: ${checks} checks passed; ${Object.keys(before).length} predecessor routines; external calls 0`);
}finally{pg.stop();}
