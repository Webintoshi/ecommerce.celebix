import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {parseOrderEditIntent,parseOrderEditPreview,parseOrderEditWorkspace} from '../../../../../packages/saas-contracts/src/orders/edit.ts';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,fixture=startDisposablePostgres({database:'order_edit_address276_native'}),{sql}=fixture;
const read=file=>readFileSync(path.join(dir,file),'utf8'),lit=value=>`'${String(value).replaceAll("'","''")}'`,json=value=>lit(JSON.stringify(value))+'::jsonb';
const owned=source=>sql('SET ROLE celebix_saas_owner;'+source),query=source=>JSON.parse(sql(source));
const id=n=>`27600000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const S=id(1),P=id(2),M=id(3),PRODUCT=id(4),V=id(5),O=id(6),I=id(7),PLAN='00000000-0000-4000-8000-000000000010';
const signature='saas.orders_edit_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)';
const canonicalSignature='saas.orders_detail_projection(uuid,uuid)';
const up='202610250276_order_edit_address.up.sql',down=up.replace('.up.','.down.'),assertions=up.replace('.up.','_assertions.');
const auth=`'${S}','${P}','${M}','${PLAN}','professional',2,clock_timestamp()`;
const rpc=(name,args)=>query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.${name}(${auth},${args})r`);
const workspace=order=>rpc('orders_edit_workspace',lit(order)).result_payload;
const rawAddress={line1:'Fixture Sokak 1',city:'İstanbul',district:'Kadıköy',postalCode:'34710',country:'TR'};
const catalog=()=>query("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
const business=()=>query(`SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM saas.orders o WHERE store_id='${S}'),'items',(SELECT jsonb_agg(to_jsonb(i)ORDER BY id)FROM saas.order_items i WHERE store_id='${S}'),'receivables',(SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY id),'[]')FROM saas.accounting_receivables r WHERE store_id='${S}'),'financeEvents',(SELECT coalesce(jsonb_agg(to_jsonb(e)ORDER BY id),'[]')FROM saas.accounting_events e WHERE store_id='${S}'),'cash',(SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY to_jsonb(m)::text),'[]')FROM saas.accounting_account_movements m WHERE store_id='${S}'),'edits',(SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY operation_id),'[]')FROM saas.order_edit_revisions r WHERE store_id='${S}'),'inventory',(SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY id),'[]')FROM saas.inventory_movements m WHERE store_id='${S}'))`);
let checks=0;const check=(label,fn)=>{fn();console.log(`PASS ${++checks} ${label}`);};
try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=275&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 const beforeCatalog=catalog();
 const manifest=JSON.parse(read('order-edit-address276-manifest.json'));
 assert.equal(Object.keys(beforeCatalog).length,manifest.fixturePredecessorRoutineCount);
 const {signature:manifestSignature,beforeSha256,afterSha256,...workspaceMetadata}=manifest.changedRoutine;
 assert.equal(manifestSignature,signature);
 assert.deepEqual(beforeCatalog[signature],{sha256:beforeSha256,...workspaceMetadata});
 const {signature:readerSignature,...readerMetadata}=manifest.unchangedCanonicalReader;
 assert.equal(readerSignature,canonicalSignature);
 assert.deepEqual(beforeCatalog[canonicalSignature],readerMetadata);
 if(process.argv.includes('--dump-hashes')){
  const afterHash=sql(`SELECT encode(sha256(convert_to(replace(pg_get_functiondef(${lit(signature)}::regprocedure),${lit("'shippingAddress',o.shipping_address")},${lit("'shippingAddress',CASE WHEN o.source='in_store' THEN o.shipping_address ELSE saas.orders_detail_projection(p_store_id,p_order_id)->'shippingAddress' END")}), 'UTF8')),'hex')`);
  console.log(JSON.stringify({functionCount:Object.keys(beforeCatalog).length,workspace:beforeCatalog[signature],canonical:beforeCatalog[canonicalSignature],afterHash}));
 }else{
  owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${S}','Address276','address276','active','tr','TRY','starter',now(),now());
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','fixture','address276','address276@example.test',true,now(),now());
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${M}','${P}','${S}','store_owner','active',now(),now());
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(8)}','${S}','${PLAN}','professional',2,'active',now()-interval '1 day',now(),now());
   INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)VALUES('${PRODUCT}','${S}','address276-product','Address fixture','active','TRY',now(),now());
   SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),set_config('saas.inventory.source_id','${id(9)}',false),set_config('saas.inventory.source_time',now()::text,false);
   INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at)VALUES('${V}','${PRODUCT}','${S}','Default',1000,false,0,'active','{}',now(),now());
   INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,created_at,updated_at)VALUES('${O}','${S}','WEB-276','storefront','Fixture Customer','address276@example.test','TRY',1000,100,0,1100,'confirmed','pending',${json(rawAddress)},NULL,now(),now());
   INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES('${I}','${S}','${O}','${PRODUCT}','${V}',0,'Address fixture',1000,1,0,1000,now());`);
  const transitioned=rpc('orders_transition_status',`${lit(id(10))},${lit('a'.repeat(64))},${lit(O)},1,'preparing'`);
  assert.equal(transitioned.outcome,'committed');
  const initial=business(),legacy=workspace(O);
  assert.equal(initial.orders[0].status,'preparing');
  assert.equal(Object.hasOwn(legacy.shippingAddress,'recipientName'),false);
  assert.throws(()=>parseOrderEditWorkspace(legacy),/order_edit_contract_invalid/);
  const posAddress={recipientName:'Saved POS recipient',...rawAddress};
  owned(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,created_at,updated_at)VALUES('${id(20)}','${S}','POS-276-NULL','in_store','Fixture POS',NULL,'TRY',0,0,0,0,'confirmed','pending',NULL,NULL,now(),now()),('${id(21)}','${S}','POS-276-ADDRESS','in_store','Fixture POS',NULL,'TRY',0,0,0,0,'confirmed','pending',${json(posAddress)},NULL,now(),now());`);
  const beforeBusiness=business(),posBefore=[workspace(id(20)),workspace(id(21))];
  if(!process.argv.includes('--before-fix')){
   check('changed predecessor source or ACL is rejected atomically',()=>{
    const definition=sql(`SELECT pg_get_functiondef(${lit(signature)}::regprocedure)`),drift=definition.replace('BEGIN\n','BEGIN /* isolated address276 drift */\n');
    assert.notEqual(drift,definition);
    owned(drift);assert.throws(()=>sql(read(up)),/ORDER_EDIT_ADDRESS276_PREDECESSOR_DRIFT/);owned(definition);
    owned(`GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_workflow`);assert.throws(()=>sql(read(up)),/ORDER_EDIT_ADDRESS276_PREDECESSOR_DRIFT/);owned(`REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_workflow`);
    assert.equal(sql("SELECT to_regclass('saas.order_edit_address276_function_backup')IS NULL"),'t');
    assert.deepEqual(catalog(),beforeCatalog);
    assert.deepEqual(business(),beforeBusiness);
   });
   check('canonical reader drift cannot be admitted by a matching workspace alone',()=>{
    const definition=sql(`SELECT pg_get_functiondef(${lit(canonicalSignature)}::regprocedure)`),drift=definition.replace('SELECT pg_catalog.jsonb_strip_nulls','SELECT /* isolated canonical276 drift */ pg_catalog.jsonb_strip_nulls');
    assert.notEqual(drift,definition);owned(drift);assert.throws(()=>sql(read(up)),/ORDER_EDIT_ADDRESS276_PREDECESSOR_DRIFT/);owned(definition);
    assert.deepEqual(catalog(),beforeCatalog);
    assert.equal(sql("SELECT to_regclass('saas.order_edit_address276_function_backup')IS NULL"),'t');
   });
   check('hash-join installation checks only the saved routine and preserves all existing routine authority',()=>{
    sql('SET enable_nestloop=off;'+read(up));
    const after=catalog(),changed=Object.keys(after).filter(key=>after[key].sha256!==beforeCatalog[key]?.sha256);
    assert.deepEqual(changed,[signature]);
    assert.equal(Object.keys(after).length,manifest.fixtureInstalledRoutineCount);
    assert.equal(after[signature].sha256,afterSha256);
    for(const key of Object.keys(beforeCatalog))assert.deepEqual({...after[key],sha256:beforeCatalog[key].sha256},beforeCatalog[key],key);
    assert.deepEqual(business(),beforeBusiness);
    sql('SET enable_nestloop=off;'+read(assertions));
    assert.throws(()=>sql(read(up)),/ORDER_EDIT_ADDRESS276_ALREADY_INSTALLED/);
   });
  }
  check('preparing storefront workspace with modern checkout address loads through the real edit contract',()=>{
   const current=parseOrderEditWorkspace(workspace(O));
   assert.equal(current.canEdit,true);
   assert.equal(current.shippingAddress.recipientName,'Fixture Customer');
   assert.deepEqual(current.shippingAddress,{recipientName:'Fixture Customer',...rawAddress});
   assert.equal(current.billingAddress,null);
  });
  check('canonical workspace creates a strictly validated native preview without changing stored orders or finance',()=>{
   const current=parseOrderEditWorkspace(workspace(O));
   const intent=parseOrderEditIntent({expectedVersion:current.version,customerName:current.customerName,customerEmail:current.customerEmail,customerPhone:current.customerPhone,shippingAddress:current.shippingAddress,billingAddress:current.billingAddress,shippingCents:current.shippingCents,discountCents:current.discountCents,reason:'Fixture address correction',lines:current.lines.map(({lineId,productId,variantId,quantity,unitPriceCents,discountCents})=>({lineId,productId,variantId,quantity,unitPriceCents,discountCents}))});
   const result=rpc('orders_edit_preview',`${lit(O)},${json(intent)}`);
   assert.equal(result.outcome,'previewed');
   assert.equal(parseOrderEditPreview(result.result_payload).afterTotalCents,1100);
   assert.deepEqual(business(),beforeBusiness);
   assert.deepEqual(business().orders.find(order=>order.id===O).shipping_address,rawAddress);
  });
  check('POS null and saved delivery addresses retain exactly their prior workspace semantics',()=>{
   const current=[parseOrderEditWorkspace(workspace(id(20))),parseOrderEditWorkspace(workspace(id(21)))];
   assert.deepEqual(current,posBefore);
   assert.equal(current[0].shippingAddress,null);
   assert.deepEqual(current[1].shippingAddress,posAddress);
  });
  check('read compatibility does not allow an invalid edit intent or grant private backup access',()=>{
   const current=parseOrderEditWorkspace(workspace(O));
   const intent={expectedVersion:current.version,customerName:current.customerName,customerEmail:current.customerEmail,customerPhone:current.customerPhone,shippingAddress:rawAddress,billingAddress:null,shippingCents:100,discountCents:0,reason:'Invalid address fixture',lines:current.lines.map(({lineId,productId,variantId,quantity,unitPriceCents,discountCents})=>({lineId,productId,variantId,quantity,unitPriceCents,discountCents}))};
   assert.throws(()=>parseOrderEditIntent(intent),/order_edit_contract_invalid/);
   assert.equal(rpc('orders_edit_preview',`${lit(O)},${json(intent)}`).outcome,'invalid_input');
   for(const role of ['celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_support_runtime'])assert.throws(()=>sql(`SET ROLE ${role};SELECT *FROM saas.order_edit_address276_function_backup`),/permission denied/);
   sql('SET enable_nestloop=off;'+read(assertions));
  });
  check('rollback refuses changed installed authority and restores the exact reader and all original metadata',()=>{
   assert.throws(()=>sql(read(down)),/ORDER_EDIT_ADDRESS276_DOWN_OPT_IN_REQUIRED/);
   const definition=sql(`SELECT pg_get_functiondef(${lit(signature)}::regprocedure)`),drift=definition.replace('BEGIN\n','BEGIN /* installed address276 drift */\n');
   owned(drift);assert.throws(()=>sql("SET celebix.allow_native276_down='on';"+read(down)),/ORDER_EDIT_ADDRESS276_DOWN_DRIFT/);owned(definition);
   owned(`GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_workflow`);assert.throws(()=>sql("SET celebix.allow_native276_down='on';"+read(down)),/ORDER_EDIT_ADDRESS276_DOWN_DRIFT/);owned(`REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_workflow`);
   sql("SET enable_nestloop=off;SET celebix.allow_native276_down='on';"+read(down));
   assert.deepEqual(catalog(),beforeCatalog);
   assert.deepEqual(workspace(O),legacy);
   assert.throws(()=>parseOrderEditWorkspace(workspace(O)),/order_edit_contract_invalid/);
   assert.deepEqual(business(),beforeBusiness);
   assert.equal(sql("SELECT to_regclass('saas.order_edit_address276_function_backup')IS NULL"),'t');
   sql('SET enable_nestloop=off;'+read(up));sql('SET enable_nestloop=off;'+read(assertions));
   assert.equal(parseOrderEditWorkspace(workspace(O)).shippingAddress.recipientName,'Fixture Customer');
  });
  console.log(`Native order edit address276: ${checks} checks passed; ${Object.keys(beforeCatalog).length} predecessor routines checked`);
 }
}finally{fixture.stop();}
