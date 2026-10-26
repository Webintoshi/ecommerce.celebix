import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../merchant-signup-profile/disposable-postgres.mjs';

const ROOT=path.resolve(import.meta.dirname,'../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const migration='202610260280_checkout_pricing_contexts',pg=startDisposablePostgres({database:'checkout_contexts280'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`28000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const NOW=new Date().toISOString(),DAY=new Date(Date.parse(NOW)+86400000).toISOString(),TWO_DAYS=new Date(Date.parse(NOW)+172800000).toISOString(),HOST='contexts280.saas-staging.celebix.net',STORE=id(1),PRODUCT=id(2),VARIANT=id(3),CART=id(4),METHOD=id(5),PROFILE=id(6),EVIDENCE='sha256:'+hash('contexts280');
const sourceCandidates=[{keyId:'original279',digest:hash('original279')}];
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
function hostCall(query){return j(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r)FROM ${query}r`);}
function seedCart(n,quantity=1){
 const candidates=[{keyId:`fixture${n}`,digest:hash('fixture-'+n)}];
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${id(n)}','${STORE}','active',1,'${TWO_DAYS}','${NOW}','${NOW}');
  INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)VALUES('${id(n)}','${STORE}','fixture${n}','${candidates[0].digest}','${DAY}');
  INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)VALUES('${id(n)}','${STORE}','${PRODUCT}','${VARIANT}',${quantity},10000,0,'${NOW}','${NOW}');`);
 return candidates;
}
const ATTRIBUTION={firstTouch:{source:'unknown',medium:'unknown'},lastTouch:{source:'unknown',medium:'unknown'},landingPathGroup:'/unknown',deviceGroup:'unknown'};
const CUSTOMER_A=id(201),CUSTOMER_B=id(202),GLOBAL_A=[{keyId:'global_a280',digest:hash('global-a280')}],GLOBAL_B=[{keyId:'global_b280',digest:hash('global-b280')}];
const contact=n=>({firstName:'Customer',lastName:`Fixture ${n}`,email:`context-${n}@example.test`,phone:`+90555${String(n).padStart(7,'0')}`});
function prepareQuote(n,options={}){
 const s={n,hostname:HOST,now:NOW,kind:'cart',candidates:sourceCandidates,version:1,codes:[],operation:id(n),...options};
 s.delivery={contact:contact(n),shippingAddress:{line1:`Fixture street ${n}`,city:'Istanbul',country:'TR'},...s.delivery};
 s.quote=hostCall(`saas.public_storefront_checkout_prepare_quote_v4(${lit(s.hostname)},${lit(s.now)},${lit(s.kind)},${json(s.candidates)},${s.version},${json(s.delivery)},${lit(s.operation)},${json(s.codes)},${json(ATTRIBUTION)})`);
 return s;
}
function authority(prepared,options={}){
 const s={...prepared,customerCandidates:GLOBAL_A,expectedQuoteDigest:prepared.quote.result_payload?.quoteDigest,...options},n=prepared.n;
 return hostCall(`saas.public_storefront_hosted_checkout_authority_v4(${lit(s.hostname)},${lit(s.now)},${lit(s.kind)},${json(s.candidates)},${s.version},${json(s.delivery)},'${METHOD}',${json(s.customerCandidates)},${json(s.codes)},'${id(n+1000)}','${id(n+2000)}',${lit(s.operation)},${lit(s.expectedQuoteDigest)})`);
}
function beginContext(prepared,selected,options={}){
 const a=selected.result_payload,n=prepared.n,s={...prepared,customerCandidates:GLOBAL_A,authority:a.authorityDigest,pricing:a.pricingDigest,fingerprint:hash('context280-'+n),...options};
 return hostCall(`saas.public_storefront_hosted_checkout_begin_v5(${lit(s.hostname)},${lit(s.now)},${lit(s.kind)},${json(s.candidates)},${s.version},${json(s.delivery)},'${METHOD}',
 '${s.authority}',${lit(s.operation)},'${s.fingerprint}','${id(n+100)}','${hash('callback-'+n)}','${id(n+1000)}','${a.customerId}','${id(n+3000)}','${id(n+4000)}','${id(n+5000)}','${id(n+6000)}',
 'pay${n}','${hash('pay-'+n)}','receipt${n}','${hash('receipt-'+n)}','customer${n}','${hash('customer-'+n)}',${json(s.customerCandidates)},${json(s.codes)},'${a.evaluatorAuthorityDigest}','${s.pricing}')`);
}
function completeContext(prepared,options={}){
 const n=prepared.n,s={...prepared,customerCandidates:GLOBAL_A,fingerprint:hash('offline280-'+n),expectedQuoteDigest:prepared.quote.result_payload?.quoteDigest,receiptExpires:DAY,customerExpires:DAY,command:'complete',...options};
 return hostCall(`saas.public_checkout_${s.command}_v4(${lit(s.hostname)},${lit(s.now)},${lit(s.kind)},${json(s.candidates)},${json(s.customerCandidates)},
  ${lit(s.operation)},'${s.fingerprint}',${s.version},${json(s.delivery)},'cash_on_delivery','${id(n+1000)}','${id(n+2000)}','${id(n+3000)}','${id(n+4000)}','${id(n+5000)}',
  'offreceipt${n}','${hash('offreceipt-'+n)}',${lit(s.receiptExpires)},'${id(n+6000)}','offcustomer${n}','${hash('offcustomer-'+n)}',${lit(s.customerExpires)},ARRAY[]::text[],${lit(s.expectedQuoteDigest)})`);
}

try {
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=278&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 sql(`REVOKE EXECUTE ON FUNCTION
  saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb),
  saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[]),
  saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid),
  saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)
 FROM celebix_saas_host_resolver`);
 const pre278=catalog();
 sql(read('202610260279_checkout_contexts.up.sql'));
 const pre280=catalog();
 if(!process.argv.includes('--before-fix')){
  check('unused280 opt-in rollback restores the complete279 catalogue and schema',()=>{
   const schema279=j(readFileSync(path.join(ROOT,'tests/saas-phase3/checkout-contexts279/schema-readiness.sql'),'utf8'));
   sql(read(migration+'.up.sql'));assert.throws(()=>sql(read(migration+'.down.sql')),/CHECKOUT_PRICING_CONTEXT280_DOWN_OPT_IN_REQUIRED/);
   sql("SET celebix.allow_checkout_pricing_context280_down='on';"+read(migration+'.down.sql'));assert.deepEqual(catalog(),pre280);
   assert.deepEqual(j(readFileSync(path.join(ROOT,'tests/saas-phase3/checkout-contexts279/schema-readiness.sql'),'utf8')),schema279);
   assert.equal(sql("SELECT to_regclass('saas.storefront_checkout_pricing_contexts280')IS NULL"),'t');
  });
  sql(read(migration+'.up.sql'));
 }
 check('contact-scoped preparation contract exists',()=>assert.equal(sql("SELECT to_regprocedure('saas.public_storefront_checkout_prepare_quote_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb)')IS NOT NULL"),'t'));
 const envelope={algorithm:'A256GCM',ciphertext:'AA',iv:'AAAAAAAAAAAAAAAA',keyId:'profile279',tag:'AAAAAAAAAAAAAAAAAAAAAA',version:1};
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${STORE}','Checkout context fixture','contexts280','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)VALUES('${id(7)}','${STORE}','${HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)VALUES('${PRODUCT}','${STORE}','fixture','Fixture product','active','TRY',1,'2026-01-01','2026-01-01');
 SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT set_config('saas.inventory.source_id','${id(8)}',false);SELECT set_config('saas.inventory.source_time','${NOW}',false);
 INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)VALUES('${VARIANT}','${PRODUCT}','${STORE}','Standard','CTX280',10000,true,100,'active','{}',1,'2026-01-01','2026-01-01');
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

 const after280=catalog();
 check('280 preserves every279 routine and only279 changed the exact two278 predecessors',()=>{
  for(const [signature,definition]of Object.entries(pre280))assert.deepEqual(after280[signature],definition,signature);
  const changed=Object.keys(pre278).filter(signature=>JSON.stringify(pre278[signature])!==JSON.stringify(after280[signature])).sort();
  assert.equal(changed.length,2);
  assert.ok(changed.some(s=>s.startsWith('saas.public_storefront_hosted_checkout_begin_v2(')));
  assert.ok(changed.includes('saas.storefront_hosted_checkout_promotion_terminal_v2()'));
 });
 sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at)VALUES
  ('${CUSTOMER_A}','${STORE}','active','Customer','Fixture 201','${contact(201).email}','${contact(201).phone}',1,'${NOW}','${NOW}'),
  ('${CUSTOMER_B}','${STORE}','active','Customer','Fixture 202','${contact(202).email}','${contact(202).phone}',1,'${NOW}','${NOW}');
  INSERT INTO saas.storefront_customer_credentials(id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at)VALUES
  ('${id(301)}','${STORE}','${CUSTOMER_A}','global_a280','${GLOBAL_A[0].digest}','${DAY}','${NOW}','${NOW}'),
  ('${id(302)}','${STORE}','${CUSTOMER_B}','global_b280','${GLOBAL_B[0].digest}','${DAY}','${NOW}','${NOW}');`);
  const rule={schemaVersion:1,benefit:{kind:'percentage',percentageBps:1000},targets:{mode:'all',include:[],exclude:[]},audience:{mode:'customer_segments',referenceIds:[id(90)]},trigger:{kind:'automatic'},schedule:{timezone:'Europe/Istanbul'},limits:{totalUsage:null,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},conditions:{minimumBasketMinor:0,minimumQuantity:0,minimumProductQuantity:0},combinationPolicy:{kind:'none'},priority:0,marginPolicy:{kind:'warn'},progressMessagePolicy:{enabled:false}};
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
   SELECT '${id(92)}','${STORE}',id,plan_code,version,'active',valid_from,'${NOW}','${NOW}'FROM saas.plans WHERE plan_code='professional'AND status='active'AND valid_from<='${NOW}'AND(valid_until IS NULL OR valid_until>'${NOW}')ORDER BY version DESC LIMIT 1;
   INSERT INTO saas.customer_segments(id,store_id,name,created_at,updated_at)VALUES('${id(90)}','${STORE}','Fixture returning customers','${NOW}','${NOW}');
   INSERT INTO saas.customer_segment_memberships(store_id,customer_id,segment_id,assigned_at)VALUES('${STORE}','${CUSTOMER_B}','${id(90)}','${NOW}');
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

 check('segment fixture enables real customer-aware dynamic pricing',()=>assert.equal(sql(`SELECT saas.lucky_wheel_feature_enabled_v1('${STORE}','${NOW}')`),'t'));
 let a,b,aAuthority,bAuthority;
 check('known customer B receives its segment quote independently of the global A proof',()=>{
  b=prepareQuote(20,{delivery:{contact:contact(202)}});
  assert.equal(b.quote.outcome,'quoted',JSON.stringify(b.quote));assert.equal(b.quote.result_payload.quote.cart.totalCents,18000);
  const anonymous=hostCall(`saas.public_checkout_quote_v3('${HOST}','${NOW}','cart',${json(sourceCandidates)},'[]'::jsonb,ARRAY[]::text[],${json(ATTRIBUTION)})`);
  assert.equal(anonymous.outcome,'quoted');assert.equal(anonymous.result_payload.quote.cart.totalCents,20000,'the fixture must reproduce the anonymous pricing difference');
  bAuthority=authority(b);assert.equal(bAuthority.outcome,'found',JSON.stringify(bAuthority));assert.equal(bAuthority.result_payload.customerId,CUSTOMER_B);assert.equal(bAuthority.result_payload.totalMinor,18000);
 });
 check('known customer A and B can begin independent correctly priced contexts on one source',()=>{
  a=prepareQuote(21,{delivery:{contact:contact(201)}});assert.equal(a.quote.outcome,'quoted');assert.equal(a.quote.result_payload.quote.cart.totalCents,20000);
  aAuthority=authority(a,{customerCandidates:GLOBAL_B});assert.equal(aAuthority.outcome,'found');assert.equal(aAuthority.result_payload.customerId,CUSTOMER_A);
  assert.equal(beginContext(b,bAuthority).outcome,'created');assert.equal(beginContext(a,aAuthority,{customerCandidates:GLOBAL_B}).outcome,'created');
  assert.equal(sql(`SELECT count(*)FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}'AND context_version=2`),'2');
 });
 check('rotating the global customer proof replays the same hosted operation exactly once',()=>{
  const before=sql(`SELECT count(*)FROM saas.payment_attempts WHERE store_id='${STORE}'`);
  assert.equal(beginContext(b,bAuthority,{customerCandidates:GLOBAL_B}).outcome,'operation_replayed');
  assert.equal(beginContext(b,bAuthority,{customerCandidates:[]}).outcome,'operation_replayed');
  assert.equal(sql(`SELECT count(*)FROM saas.payment_attempts WHERE store_id='${STORE}'`),before);
 });
 check('repeated preparation returns the same still-valid opaque quote',()=>{
  const repeated=prepareQuote(20,{delivery:{contact:contact(202)}});assert.equal(repeated.quote.outcome,'quoted');assert.deepEqual(repeated.quote.result_payload,b.quote.result_payload);
 });
 check('split email and phone identities are rejected before creating a context',()=>{
  const selected=prepareQuote(30,{delivery:{contact:{...contact(201),phone:contact(202).phone}}});assert.equal(selected.quote.outcome,'invalid_input');
 });
 check('a prepared operation cannot be rebound to a different delivery or promotion code',()=>{
  const changed=prepareQuote(20,{delivery:{contact:contact(201)}});assert.equal(changed.quote.outcome,'operation_mismatch');
  assert.equal(authority(b,{delivery:a.delivery}).outcome,'operation_mismatch');
  assert.equal(authority(b,{codes:['OTHER']}).outcome,'operation_mismatch');
  assert.equal(authority(b,{version:2}).outcome,'operation_mismatch');
  assert.equal(authority(b,{delivery:{...b.delivery,shippingAddress:{...b.delivery.shippingAddress,line1:'Changed street'}}}).outcome,'operation_mismatch');
  assert.equal(beginContext(b,bAuthority,{delivery:a.delivery}).outcome,'operation_mismatch');
 });
 check('foreign host and invalid source credentials fail without creating payment attempts',()=>{
  const before=sql(`SELECT count(*)FROM saas.payment_attempts WHERE store_id='${STORE}'`);
  assert.equal(authority(b,{hostname:'foreign.saas-staging.celebix.net'}).outcome,'not_found');
  assert.equal(authority(b,{candidates:[{keyId:'original279',digest:hash('foreign280')}]}).outcome,'not_found');
  const alias='contexts280.saas-staging.celebix.site';
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)VALUES('${id(303)}','${STORE}','${alias}','platform_subdomain','active',false,'2026-01-01','2026-01-01','2026-01-01',1)`);
  assert.equal(authority(b,{hostname:alias}).outcome,'operation_mismatch');
  const otherSource=seedCart(79);assert.equal(authority(b,{candidates:otherSource}).outcome,'operation_mismatch');
  const changed=beginContext(b,bAuthority,{operation:id(999)});assert.ok(!['created','operation_replayed'].includes(changed.outcome),JSON.stringify(changed));
  assert.equal(sql(`SELECT count(*)FROM saas.payment_attempts WHERE store_id='${STORE}'`),before);
 });
 let offline;
 check('offlineV4 resolves B contact pricing while the global proof still belongs to A',()=>{
  const candidates=seedCart(60);offline=prepareQuote(60,{candidates,delivery:{contact:contact(202)}});assert.equal(offline.quote.outcome,'quoted');assert.equal(offline.quote.result_payload.quote.cart.totalCents,9000);
  const completed=completeContext(offline);assert.equal(completed.outcome,'committed',JSON.stringify(completed));
  assert.equal(sql(`SELECT customer_id||':'||total_cents FROM saas.orders WHERE id='${id(1060)}'`),CUSTOMER_B+':9000');
 });
 check('offline replay ignores global proof rotation but preserves delivery and business IDs',()=>{
  const later=new Date(Date.parse(NOW)+1000).toISOString(),expiry=new Date(Date.parse(DAY)+1000).toISOString();
  assert.equal(completeContext(offline,{customerCandidates:GLOBAL_B,fingerprint:hash('global-proof-rotated'),now:later,receiptExpires:expiry,customerExpires:expiry}).outcome,'operation_replayed');
  assert.equal(completeContext(offline,{customerCandidates:[]}).outcome,'operation_replayed');
  assert.equal(completeContext(offline,{delivery:a.delivery}).outcome,'operation_mismatch');
  assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE id='${id(1060)}'`),'1');
 });


 check('read-only recovery uses the same business fingerprint across ambient proof rotation',()=>{
  const witness=()=>Object.fromEntries(['orders','order_items','storefront_checkout_operations','storefront_hosted_checkout_operations','payment_attempts','storefront_customer_credentials','storefront_checkout_pricing_contexts280'].map(table=>[table,sql(`SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t)ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')FROM saas.${table} t`)]));
  const before=witness(),later=new Date(Date.parse(NOW)+2000).toISOString();
  const recovered=completeContext(offline,{command:'recover',customerCandidates:GLOBAL_B,now:later,fingerprint:hash('recover-rotated'),receiptExpires:new Date(Date.parse(DAY)+2000).toISOString()});
  assert.equal(recovered.outcome,'operation_replayed');
  assert.equal(completeContext(offline,{command:'recover',delivery:a.delivery}).outcome,'operation_mismatch');
  assert.equal(completeContext(offline,{command:'recover',operation:id(998)}).outcome,'not_found');
  assert.deepEqual(witness(),before,'recovery must not write customer, context, order or financial rows');
 });
 check('new contact without a global customer proof still prepares and starts normally',()=>{
  const candidates=seedCart(72),selected=prepareQuote(72,{candidates});assert.equal(selected.quote.outcome,'quoted');assert.equal(selected.quote.result_payload.quote.cart.totalCents,10000);
  const selectedAuthority=authority(selected,{customerCandidates:[]});assert.equal(selectedAuthority.outcome,'found');
  assert.equal(beginContext(selected,selectedAuthority,{customerCandidates:[]}).outcome,'created');
  assert.equal(sql(`SELECT customer_id IS NULL AND customer_credential_id IS NULL FROM saas.storefront_checkout_pricing_contexts280 WHERE operation_id='${id(72)}'`),'t');
 });
 check('a source credential caps the lifetime of its private pricing proof',()=>{
  const candidates=seedCart(75),deadline=new Date(Date.parse(NOW)+30000).toISOString();
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.storefront_cart_credentials SET expires_at='${deadline}'WHERE cart_id='${id(75)}'`);
  const short=prepareQuote(75,{candidates,delivery:{contact:contact(202)}});assert.equal(short.quote.outcome,'quoted');
  assert.equal(sql(`SELECT expires_at='${deadline}'::timestamptz AND quote_expires_at<=expires_at FROM saas.storefront_checkout_pricing_contexts280 WHERE operation_id='${id(75)}'`),'t');
  assert.equal(authority(short,{now:new Date(Date.parse(NOW)+31000).toISOString()}).outcome,'not_found');
 });
 check('expired cached quotes and unstarted pricing contexts fail closed',()=>{
  const candidates=seedCart(76),selected=prepareQuote(76,{candidates,delivery:{contact:contact(202)}});assert.equal(selected.quote.outcome,'quoted');
  assert.equal(prepareQuote(76,{candidates,delivery:{contact:contact(202)},now:new Date(Date.parse(NOW)+660000).toISOString()}).quote.outcome,'price_changed');
  assert.equal(authority(selected,{now:new Date(Date.parse(NOW)+2160000).toISOString()}).outcome,'price_changed');
  assert.equal(sql(`SELECT count(*)FROM saas.payment_attempts WHERE id='${id(76)}'`),'0');
 });
 check('public results never expose a source, global or private customer credential',()=>{
  const serialized=JSON.stringify([a.quote,b.quote,aAuthority,bAuthority]);
  const credentials=j(`SELECT jsonb_agg(credential_digest::text)FROM saas.storefront_customer_credentials WHERE store_id='${STORE}'`);
  for(const digest of [...credentials,sourceCandidates[0].digest])assert.ok(!serialized.includes(digest),'a public response leaked a credential digest');
  assert.ok(!serialized.includes('checkout_ctx280'));assert.ok(!serialized.includes('sealed_credentials'));
  const globals=j(`SELECT jsonb_agg(jsonb_build_object('keyId',key_id,'digest',credential_digest,'expiresAt',expires_at)ORDER BY key_id)FROM saas.storefront_customer_credentials WHERE store_id='${STORE}'AND key_id LIKE 'global_%'`);
  assert.equal(globals.length,2);assert.equal(globals[0].digest,GLOBAL_A[0].digest);assert.equal(globals[1].digest,GLOBAL_B[0].digest);
 });
 check('new tables remain private forcedRLS and all public wrappers preserve role separation',()=>{
  for(const name of ['storefront_checkout_pricing_contexts280','checkout_pricing_context280_predecessors']){
   const relation=j(`SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'policyCount',(SELECT count(*)FROM pg_policy p WHERE p.polrelid=c.oid),'otherGrants',(SELECT count(*)FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner))FROM pg_class c WHERE c.oid='saas.${name}'::regclass`);
   assert.deepEqual(relation,{owner:'celebix_saas_owner',rls:true,forceRls:true,policyCount:0,otherGrants:0});
   for(const role of ['celebix_saas_host_resolver','celebix_saas_app'])assert.throws(()=>sql(`SET ROLE ${role};SELECT *FROM saas.${name}`),/permission denied/);
  }
  const roles=j("SELECT jsonb_agg(rolname)FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'");
  for(const signature of Object.keys(after280).filter(signature=>!(signature in pre280))){
   const exposed=signature.startsWith('saas.public_');
   for(const role of roles)assert.equal(sql(`SELECT has_function_privilege(${lit(role)},${lit(signature)},'EXECUTE')`),exposed&&role==='celebix_saas_host_resolver'?'t':'f',`${role}: ${signature}`);
  }
 });
 check('private pricing contexts cannot be changed even through the owner role',()=>{
  assert.throws(()=>sql(`SET ROLE celebix_saas_owner;UPDATE saas.storefront_checkout_pricing_contexts280 SET delivery_digest='${hash('changed')}'WHERE operation_id='${id(20)}'`),/CHECKOUT_PRICING_CONTEXT280_IMMUTABLE/);
 });
 check('used280 rollback fails atomically and all assertions survive a forced planner',()=>{
  const before=catalog();assert.throws(()=>sql("SET celebix.allow_checkout_pricing_context280_down='on';"+read(migration+'.down.sql')),/CHECKOUT_PRICING_CONTEXT280_ALREADY_USED/);assert.deepEqual(catalog(),before);
  sql("SET enable_nestloop=off;"+read(migration+'_assertions.sql'));
 });
 writeFileSync(path.join(ROOT,'.tmp/checkout-contexts280-native-before.json'),JSON.stringify(pre280,null,2));
 writeFileSync(path.join(ROOT,'.tmp/checkout-contexts280-native-after.json'),JSON.stringify(catalog(),null,2));
 writeFileSync(path.join(ROOT,'.tmp/checkout-contexts280-schema.json'),JSON.stringify(j(readFileSync(path.join(import.meta.dirname,'schema-readiness.sql'),'utf8')),null,2));
 console.log(`Checkout contexts280: ${checks} checks passed; ${Object.keys(pre280).length} predecessor routines; external calls 0`);

} finally { pg.stop(); }
