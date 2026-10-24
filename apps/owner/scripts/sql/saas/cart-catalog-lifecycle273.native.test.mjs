import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,fixture=startDisposablePostgres({database:'cart_catalog_lifecycle273_native'}),{sql}=fixture;
const read=file=>readFileSync(path.join(dir,file),'utf8'),lit=value=>value===null?'NULL':`'${String(value).replaceAll("'","''")}'`,json=value=>lit(JSON.stringify(value))+'::jsonb';
const digest=value=>createHash('sha256').update(String(value)).digest('hex'),id=n=>`27300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const S=id(1),OTHER=id(2),PRODUCT=id(3),V=id(4),P=id(5),M=id(6),OM=id(7),PLAN='00000000-0000-4000-8000-000000000010',HOST='cart273.example.test',OTHER_HOST='other273.example.test';
const up='202610240273_cart_catalog_lifecycle.up.sql',down=up.replace('.up.','.down.'),assertions=up.replace('.up.','_assertions.');
const removeSignature='saas.public_cart_mutate_without_available_stock_v090(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer)';
const deleteSignature='saas.delete_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text)';
const eligibilitySignature='saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid)';
const inventoryGuardSignature='saas.guard_inventory_movement_mutation()';
const signatures=[removeSignature,deleteSignature,eligibilitySignature,inventoryGuardSignature];
const owned=q=>sql('SET ROLE celebix_saas_owner;'+q),query=q=>JSON.parse(sql(q));
const native=f=>query('SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r)FROM '+f+' r');
const proof=n=>[{keyId:'cart_273',digest:digest('cart'+n)}],operation=()=>({id:randomUUID(),fingerprint:digest(randomUUID())});
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
let now;
const resolve=(n,host=HOST)=>native(`saas.public_cart_resolve(${lit(host)},${lit(now)},${json(proof(n))})`);
const mutate=(n,{action='add',create=false,version=1,op=operation(),host=HOST,product=PRODUCT,variant=V,quantity=1,credentials=proof(n)}={})=>native(`saas.public_cart_mutate(${lit(host)},${lit(now)},${json(create?[]:credentials)},'${id(n)}',${create?"'cart_273'":'NULL'},${create?lit(digest('cart'+n)):'NULL'},${create?lit(new Date(Date.parse(now)+86400000).toISOString()):'NULL'},'${op.id}',${lit(op.fingerprint)},${lit(action)},${create?0:version},${lit(product)},${lit(variant)},${action==='remove'?'NULL':quantity},'[]'::jsonb)`);
const state=n=>query(`SELECT jsonb_build_object('cart',(SELECT to_jsonb(c)FROM saas.storefront_carts c WHERE id='${id(n)}'),'items',(SELECT coalesce(jsonb_agg(to_jsonb(i)ORDER BY variant_id),'[]')FROM saas.storefront_cart_items i WHERE cart_id='${id(n)}'),'operations',(SELECT coalesce(jsonb_agg(to_jsonb(o)ORDER BY operation_id),'[]')FROM saas.storefront_cart_operations o WHERE cart_id='${id(n)}'))`);
const inventory=variant=>query(`SELECT jsonb_build_object('balances',(SELECT coalesce(jsonb_agg(to_jsonb(b)ORDER BY location_id),'[]')FROM saas.inventory_balances b WHERE variant_id=${lit(variant)}),'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY id),'[]')FROM saas.inventory_movements m WHERE variant_id=${lit(variant)}))`);
const sourceSnapshot=()=>query("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=272&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 for(let index=0;index<process.argv.length;index++)if(process.argv[index]==='--prior-readiness'){
  assert.ok(process.argv[index+1]);const readiness=query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'+readFileSync(path.resolve(process.argv[index+1]),'utf8')+'ROLLBACK;');
  for(const [key,value]of Object.entries(readiness))assert.equal(value,key==='nativeAuthority'?false:true,key);
  console.log('PASS read-only prior273 readiness in disposable database');
 }
 if(process.argv.includes('--dump-native')){
  console.log(sql(`SELECT jsonb_object_agg(signature,jsonb_build_object('sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef))FROM unnest(ARRAY[${signatures.map(lit).join(',')}]::text[])signature JOIN pg_proc p ON p.oid=to_regprocedure(signature)`));
  console.log(sql("SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'definition',pg_get_constraintdef(oid))ORDER BY conrelid::regclass::text,conname)FROM pg_constraint WHERE contype='f'AND confrelid IN('saas.products'::regclass,'saas.product_variants'::regclass)"));
  console.log(sql(`SELECT pg_get_functiondef(${lit(deleteSignature)}::regprocedure)`));
 }else{
  const beforeSources=sourceSnapshot();
  if(!process.argv.includes('--before-fix')){
   check('source and ACL drift reject installation atomically and explicit down restores exact metadata',()=>{
    const definition=sql(`SELECT pg_get_functiondef(${lit(removeSignature)}::regprocedure)`);
    owned(`GRANT EXECUTE ON FUNCTION ${removeSignature} TO celebix_saas_workflow`);
    assert.throws(()=>sql(read(up)),/CART_CATALOG273_PREDECESSOR_DRIFT/);
    owned(`REVOKE EXECUTE ON FUNCTION ${removeSignature} FROM celebix_saas_workflow`);
    const drift=definition.replace(/\nBEGIN\b/,'\nBEGIN /* isolated cart273 source drift */');assert.notEqual(drift,definition);
    owned(drift);assert.throws(()=>sql(read(up)),/CART_CATALOG273_PREDECESSOR_DRIFT/);owned(definition);
    assert.equal(sql("SELECT to_regclass('saas.cart_catalog_lifecycle273_functions')IS NULL"),'t');
    sql(read(up));assert.throws(()=>sql(read(up)),/CART_CATALOG273_ALREADY_INSTALLED/);
    assert.throws(()=>sql(read(down)),/CART_CATALOG273_ROLLBACK_CONFIRMATION_REQUIRED/);
    sql("SET celebix.allow_native273_down='on';"+read(down));assert.deepEqual(sourceSnapshot(),beforeSources);sql(read(up));
   });
  }
  owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${S}','Cart273','cart273','active','tr','TRY','starter',now(),now()),('${OTHER}','Other cart273','other273','active','tr','TRY','starter',now(),now());
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','fixture','cart273','cart273@example.test',true,now(),now());
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${M}','${P}','${S}','store_owner','active',now(),now()),('${OM}','${P}','${OTHER}','store_owner','active',now(),now());
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(8)}','${S}','${PLAN}','professional',2,'active',now()-interval '1 day',now(),now()),('${id(9)}','${OTHER}','${PLAN}','professional',2,'active',now()-interval '1 day',now(),now());
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)VALUES('${id(10)}','${S}','${HOST}','platform_subdomain','active',true,now(),now(),now(),1),('${id(11)}','${OTHER}','${OTHER_HOST}','platform_subdomain','active',true,now(),now(),now(),1);
   INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)VALUES('${PRODUCT}','${S}','cart273-product','Cart fixture','active','TRY',1,now(),now());
   SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),set_config('saas.inventory.source_id','${id(12)}',false),set_config('saas.inventory.source_time',now()::text,false);
   INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at)VALUES('${V}','${PRODUCT}','${S}','Default','CART273',2500,false,0,'active','{}',now(),now());`);
  now=sql("SELECT date_trunc('milliseconds',clock_timestamp())");
  assert.equal(mutate(100,{create:true}).outcome,'committed');
  owned(`UPDATE saas.product_variants SET status='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp()WHERE id='${V}';UPDATE saas.products SET status='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp()WHERE id='${PRODUCT}';`);
  check('saved archived product remains unavailable and cannot be purchased',()=>{const cart=resolve(100).result_payload;assert.equal(cart.itemCount,1);assert.equal(cart.items[0].available,false);assert.equal(cart.checkoutReady,false);assert.equal(cart.checkoutBlocker,'stock_unavailable');assert.notEqual(mutate(100,{action:'quantity',quantity:2}).outcome,'committed');});
  check('removal keeps credential tenant product and expected-version boundaries',()=>{
   const before=state(100);
   for(const options of [{host:OTHER_HOST},{credentials:proof(999)},{product:id(999)},{version:0}])assert.notEqual(mutate(100,{action:'remove',...options}).outcome,'committed');
   assert.deepEqual(state(100),before);
  });
  if(!process.argv.includes('--delete-only')){
  const removal=operation();let removed;
  check('the last archived line can be removed without an active catalog product or price',()=>{removed=mutate(100,{action:'remove',op:removal});assert.equal(removed.outcome,'committed');assert.equal(removed.result_payload.cart.version,2);assert.deepEqual(removed.result_payload.cart.items,[]);assert.equal(removed.result_payload.cart.itemCount,0);assert.equal(removed.result_payload.cart.checkoutBlocker,'empty_cart');assert.equal(sql(`SELECT count(*)FROM saas.storefront_cart_items WHERE cart_id='${id(100)}'`),'0');assert.equal(sql(`SELECT status FROM saas.abandoned_carts WHERE source_cart_id='${id(100)}'`),'archived');});
  check('exact removal replay returns its receipt without a second version or snapshot update',()=>{const before=state(100);const replay=mutate(100,{action:'remove',op:removal});assert.equal(replay.outcome,'operation_replayed');assert.deepEqual(replay.result_payload,removed.result_payload);assert.deepEqual(state(100),before);assert.equal(mutate(100,{action:'remove',op:{...removal,fingerprint:digest('changed')}}).outcome,'operation_mismatch');});
  }
  const limit=sql(`SELECT effective_limit FROM saas.plan_limits WHERE plan_id='${PLAN}'AND limit_key='products'`);
  const auth=(store=S,member=M,principal=P)=>`${lit(store)},${lit(principal)},${lit(member)},'${PLAN}','professional',2,${limit},clock_timestamp()`;
  const onboard=(product,variant,{title='Delete fixture',store=S,member=M,openingStock}={})=>{
   const intent=openingStock===undefined?{kind:'advanced',productType:'physical',title,publish:true,variants:[{title:'Default',priceCents:2500,stockTracking:false,stockQuantity:0,attributes:{},continueSellingWhenOutOfStock:false,inventory:[]}],profile:{minimumPurchaseQuantity:1},categoryIds:[],resourceIds:{collections:[],tags:[],attributes:[],extras:[],definitions:[]},channelIds:[]}:{kind:'quick',title,priceCents:2500,publish:true,stockQuantity:openingStock};
   const op=operation();const result=query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.catalog_onboard_product_with_origins(${auth(store,member)},'${op.id}','${op.fingerprint}',${lit(product)},ARRAY[${lit(variant)}]::uuid[],${json(intent)})r`);
   assert.equal(result.outcome,'created',JSON.stringify(result));
   const publication=operation(),published=query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.catalog_publish_after_media(${auth(store,member)},'${publication.id}','${publication.fingerprint}',${lit(product)},1,0)r`);
   assert.equal(published.outcome,'published',JSON.stringify(published));return result;
  };
  const deleteProduct=(product,op,{version=2,confirmation='Delete fixture',store=S,member=M,principal=P}={})=>query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.delete_product(${auth(store,member,principal)},'${op.id}','${op.fingerprint}',${lit(product)},${version},${lit(confirmation)})r`);
  const DP=id(400),DV=id(401),FP=id(402),FV=id(403),SP=id(404),SV=id(405);
  onboard(DP,DV);onboard(FP,FV,{title:'Foreign fixture',store:OTHER,member:OM});onboard(SP,SV,{title:'Surviving fixture'});
  now=sql("SELECT date_trunc('milliseconds',clock_timestamp())");
  const firstSaved=mutate(101,{create:true,product:DP,variant:DV,quantity:2});
  assert.equal(firstSaved.outcome,'committed',JSON.stringify({firstSaved,catalog:query(`SELECT jsonb_build_object('product',(SELECT to_jsonb(p)FROM saas.products p WHERE id='${DP}'),'variant',(SELECT to_jsonb(v)FROM saas.product_variants v WHERE id='${DV}'),'price',(SELECT to_jsonb(r)FROM saas.resolve_effective_variant_price('${S}','${DV}','storefront',${lit(now)},NULL)r))`)}));
  assert.equal(mutate(101,{product:SP,variant:SV}).outcome,'committed');
  assert.equal(mutate(102,{create:true,product:DP,variant:DV}).outcome,'committed');
  assert.equal(mutate(103,{create:true,host:OTHER_HOST,product:FP,variant:FV}).outcome,'committed');
  const foreignBefore=state(103),foreignInventory=inventory(FV);
  check('actual native onboarding creates the synthetic zero opening and independent display order',()=>{
   const actual=inventory(DV);assert.equal(actual.balances.length,1);assert.equal(actual.balances[0].quantity,0);assert.equal(actual.movements.length,1);assert.equal(actual.movements[0].movement_kind,'opening');assert.equal(actual.movements[0].quantity_delta,0);assert.equal(actual.movements[0].source_id,DV);
   assert.equal(sql(`SELECT count(*)FROM saas.catalog_variant_order_state WHERE product_id='${DP}'`),'1');
  });
  check('ordinary and forged-marker ledger deletion remains denied',()=>{
   const before=inventory(DV);
   assert.throws(()=>owned(`DELETE FROM saas.inventory_movements WHERE variant_id='${DV}'`),/INVENTORY_MOVEMENT_IMMUTABLE/);
   assert.throws(()=>owned(`SELECT set_config('celebix.catalog_delete_empty_inventory','${OTHER}:${DP}',false);DELETE FROM saas.inventory_movements WHERE variant_id='${DV}'`),/INVENTORY_MOVEMENT_IMMUTABLE/);
   assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT set_config('celebix.catalog_delete_empty_inventory','${S}:${DP}',false);DELETE FROM saas.inventory_movements WHERE variant_id='${DV}'`),/permission denied/);
   assert.deepEqual(inventory(DV),before);
  });
  const recoveryEpisode=id(430),recoveryToken=id(431),recoveryDigest=digest('recovery273');
  const recoveryAbandoned=sql(`SELECT id FROM saas.abandoned_carts WHERE source_cart_id='${id(102)}'`);
  owned(`UPDATE saas.abandoned_carts SET status='abandoned',abandoned_at=now(),lifecycle_status='abandoned'WHERE id='${recoveryAbandoned}';
   INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,abandoned_at,currency,value_minor,created_at,updated_at)VALUES('${recoveryEpisode}','${S}','${recoveryAbandoned}',1,now(),now(),'TRY',5000,now(),now());
   INSERT INTO saas.abandoned_cart_episode_items(store_id,episode_id,product_id,variant_id,product_name,quantity,line_total_minor,created_at)VALUES('${S}','${recoveryEpisode}','${DP}','${DV}','Delete fixture',1,2500,now()),('${S}','${recoveryEpisode}','${PRODUCT}','${V}','Archived fixture',1,2500,now());
   INSERT INTO saas.abandoned_cart_recovery_tokens(id,store_id,cart_id,episode_id,token_digest,key_version,hostname,expires_at,created_by_membership_id,created_at)VALUES('${recoveryToken}','${S}','${recoveryAbandoned}','${recoveryEpisode}','${recoveryDigest}',1,'${HOST}',now()+interval '1 day','${M}',now());`);
  now=sql("SELECT date_trunc('milliseconds',clock_timestamp())");
  const restore=()=>native(`saas.public_cart_recovery_restore('${HOST}',${lit(now)},'${recoveryDigest}','${id(104)}','cart_273','${digest('cart104')}',${lit(new Date(Date.parse(now)+86400000).toISOString())})`);
  check('restoring a frozen cart omits unavailable catalog lines and keeps eligible saved lines canonical',()=>{
   const restored=restore();assert.equal(restored.outcome,'restored');assert.equal(restored.result_payload.restoredItems,1);assert.equal(restored.result_payload.omittedItems,1);assert.deepEqual(restored.result_payload.cart.items.map(i=>i.variantId),[DV]);assert.equal(restored.result_payload.cart.items[0].available,true);
  });
  const failedOp=operation();
  check('invalid confirmation foreign membership and stale version do not clean saved cart lines',()=>{
   const before=state(101);
   for(const options of [{confirmation:'wrong'},{store:OTHER,member:OM},{principal:id(999)},{version:99}])assert.notEqual(deleteProduct(DP,operation(),options).outcome,'deleted');
   assert.deepEqual(state(101),before);
  });
  const intent=id(450);
  assert.equal(native(`saas.public_buy_now_create('${HOST}',${lit(now)},'${intent}','intent_273',${lit(digest('intent'))},${lit(new Date(Date.parse(now)+600000).toISOString())},'${DP}','${DV}',1)`).outcome,'committed');
  check('a durable checkout reference blocks deletion before cart or zero inventory cleanup',()=>{
   const carts=[state(101),state(102)],before=inventory(DV);
   assert.equal(deleteProduct(DP,failedOp).outcome,'cleanup_failed');assert.deepEqual([state(101),state(102)],carts);assert.deepEqual(inventory(DV),before);
   assert.equal(sql(`SELECT count(*)FROM saas.storefront_checkout_intents WHERE id='${intent}'`),'1');
  });
  owned(`DELETE FROM saas.storefront_checkout_intents WHERE id='${intent}';`);
  check('a final removal rejection rolls cart and synthetic inventory cleanup back together',()=>{
   const before=[state(101),state(102)],stock=inventory(DV),collision=operation();
   owned(`INSERT INTO saas.catalog_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_variant_id,result_payload,committed_at)VALUES('${collision.id}','${S}','remove_product','${digest('different')}',NULL,NULL,'{"removed":true,"productId":"${SP}"}',clock_timestamp());`);
   assert.equal(deleteProduct(DP,collision,{version:3}).outcome,'operation_mismatch');assert.deepEqual([state(101),state(102)],before);assert.deepEqual(inventory(DV),stock);
  });
  const historical=id(500),historicalItem=id(501),episode=id(502);
  owned(`INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,version,created_at,updated_at)VALUES('${historical}','${S}','${digest('historical')}','active','TRY',2500,0,2500,now(),now(),1,now(),now());
   INSERT INTO saas.abandoned_cart_items(id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES('${historicalItem}','${S}','${historical}','${DP}','${DV}',0,'Historical product','Historical variant','HISTORY273',2500,1,0,2500,clock_timestamp());
   INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,currency,value_minor,created_at,updated_at)VALUES('${episode}','${S}','${historical}',1,now(),'TRY',2500,now(),now());
   INSERT INTO saas.abandoned_cart_episode_items(store_id,episode_id,product_id,variant_id,product_name,quantity,line_total_minor,created_at)VALUES('${S}','${episode}','${DP}','${DV}','Historical product',1,2500,clock_timestamp());
   INSERT INTO saas.google_merchant_preferences(store_id,product_id,variant_id)VALUES('${S}','${DP}','${DV}');`);
  const historyBefore=query(`SELECT to_jsonb(i)FROM saas.abandoned_cart_items i WHERE id='${historicalItem}'`),episodeBefore=query(`SELECT to_jsonb(i)FROM saas.abandoned_cart_episode_items i WHERE episode_id='${episode}'`);
  let deleted;
  check('authorized permanent deletion clears saved cart references and advances each affected cart once',()=>{
   deleted=deleteProduct(DP,failedOp);assert.equal(deleted.outcome,'deleted',JSON.stringify(deleted));
   assert.equal(sql(`SELECT count(*)FROM saas.products WHERE id='${DP}'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.product_variants WHERE id='${DV}'`),'0');
   const mixed=resolve(101).result_payload,last=resolve(102).result_payload;assert.equal(mixed.version,3);assert.equal(mixed.itemCount,1);assert.deepEqual(mixed.items.map(i=>i.variantId),[SV]);assert.equal(last.version,2);assert.equal(last.itemCount,0);assert.equal(last.checkoutBlocker,'empty_cart');
   assert.deepEqual(inventory(DV),{balances:[],movements:[]});assert.deepEqual(state(103),foreignBefore);assert.deepEqual(inventory(FV),foreignInventory);
   assert.equal(resolve(104).result_payload.version,2);assert.equal(resolve(104).result_payload.itemCount,0);assert.notEqual(restore().outcome,'restored');
  });
  check('historical cart labels prices and episode facts survive catalog deletion',()=>{
   assert.deepEqual(query(`SELECT to_jsonb(i)FROM saas.abandoned_cart_items i WHERE id='${historicalItem}'`),{...historyBefore,product_id:null,variant_id:null});
   assert.deepEqual(query(`SELECT to_jsonb(i)FROM saas.abandoned_cart_episode_items i WHERE episode_id='${episode}'`),episodeBefore);
  });
  check('permanent deletion replay preserves its original receipt without a second cart write',()=>{
   const before=[state(101),state(102)],replay=deleteProduct(DP,failedOp);assert.equal(replay.outcome,'operation_replayed');assert.deepEqual(replay.result_payload,{...deleted.result_payload,replayed:true});assert.deepEqual([state(101),state(102)],before);
   assert.equal(deleteProduct(DP,{...failedOp,fingerprint:digest('altered')}).outcome,'operation_mismatch');
  });
  check('nonzero openings net-zero stock adjustments and sales remain immutable deletion blockers',()=>{
   for(const [n,quantity,adjustment]of[[600,1,null],[610,0,'catalog_adjustment'],[620,0,'checkout_sale']]){
    const product=id(n),variant=id(n+1);onboard(product,variant,{title:'History fixture',openingStock:quantity});
    if(adjustment)owned(`SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),set_config('saas.inventory.source_id','${id(n+2)}',false),set_config('saas.inventory.source_time',clock_timestamp()::text,false);UPDATE saas.product_variants SET stock_quantity=1,updated_at=clock_timestamp()WHERE id='${variant}';SELECT set_config('saas.inventory.source_marker','${adjustment}',false);UPDATE saas.product_variants SET stock_quantity=0,updated_at=clock_timestamp()WHERE id='${variant}';`);
    const before=inventory(variant);assert.equal(deleteProduct(product,operation(),{confirmation:'History fixture'}).outcome,'cleanup_failed');assert.deepEqual(inventory(variant),before);
    assert.throws(()=>owned(`SELECT set_config('celebix.catalog_delete_empty_inventory','${S}:${product}',false);DELETE FROM saas.inventory_movements WHERE variant_id='${variant}'`),/INVENTORY_MOVEMENT_IMMUTABLE/);assert.deepEqual(inventory(variant),before);
   }
  });
  if(!process.argv.includes('--before-fix')){
   check('only the four reviewed function bodies change and execution boundaries stay private',()=>{
    const after=sourceSnapshot(),canonical=query(`SELECT jsonb_agg(to_regprocedure(s)::text)FROM unnest(ARRAY[${signatures.map(lit).join(',')}]::text[])s`);
    for(const signature of canonical){delete after[signature];delete beforeSources[signature];}
    assert.deepEqual(after,beforeSources);sql(read(assertions));
   });
   if(process.argv.includes('--dump-installed'))console.log(sql("SELECT jsonb_build_object('kind','native273Installed','functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'predecessor',f.predecessor_sha256,'sha256',f.published_sha256,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text)FROM saas.cart_catalog_lifecycle273_functions f JOIN pg_proc p ON p.oid=f.function_oid),'backup',(SELECT jsonb_build_object('owner',pg_get_userbyid(relowner),'acl',relacl::text,'rls',relrowsecurity,'forceRls',relforcerowsecurity)FROM pg_class WHERE oid='saas.cart_catalog_lifecycle273_functions'::regclass),'sourceFunctionMetadataSha256',(SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text)::text,'UTF8')),'hex')FROM saas.cart_catalog_lifecycle273_functions f JOIN pg_proc p ON p.oid=f.function_oid))"));
   for(let index=0;index<process.argv.length;index++)if(process.argv[index]==='--readiness'){assert.ok(process.argv[index+1]);const readiness=query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'+readFileSync(path.resolve(process.argv[index+1]),'utf8')+'ROLLBACK;');for(const [key,value]of Object.entries(readiness))assert.equal(value,key==='nativeAuthority'?false:true,key);console.log('PASS read-only installed273 readiness in disposable database');}
  }
  console.log(`Native cart catalog lifecycle273: ${checks} checks passed`);
 }
}finally{fixture.stop();}
