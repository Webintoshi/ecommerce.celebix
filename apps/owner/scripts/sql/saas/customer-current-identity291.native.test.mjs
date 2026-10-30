import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {parseInStoreSale} from '../../../../../packages/saas-contracts/src/in-store-sales/validation.ts';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,fixture=startDisposablePostgres({database:'customer_current_identity291_native'}),{sql}=fixture;
const read=file=>readFileSync(path.join(dir,file),'utf8'),lit=value=>`'${String(value).replaceAll("'","''")}'`,json=value=>lit(JSON.stringify(value))+'::jsonb';
const owned=source=>sql('SET ROLE celebix_saas_owner;'+source),query=source=>JSON.parse(sql(source));
const id=n=>`29100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const S=id(1),OTHER=id(2),P=id(3),M=id(4),C=id(5),FOREIGN=id(6),R=id(7),CART=id(8),SALE=id(9),LOCATION=id(10);
const up='202610300291_customer_current_identity.up.sql',down=up.replace('.up.','.down.'),assertions=up.replace('.up.','_assertions.');
const backup='saas.customer_current_identity291_function_backup',manifest=JSON.parse(read('customer-current-identity291-manifest.json'));
const projection=(name,record,store=S)=>query(`SET ROLE celebix_saas_owner;SELECT coalesce(saas.${name}('${store}','${record}'),'null'::jsonb)`);
const list=search=>query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r) FROM saas.abandoned_carts_list('${S}','${P}','${M}','00000000-0000-4000-8000-000000000010','professional',2,clock_timestamp(),NULL,${lit(search)},'newest',100,NULL,NULL,NULL)r`);
const business=()=>{
 const tables=['customers','customer_addresses','orders','in_store_sales','accounting_receivables','accounting_events','accounting_allocations','accounting_account_movements','abandoned_carts','abandoned_cart_items'];
 return query('SELECT jsonb_object_agg(name,rows) FROM('+tables.map(table=>`SELECT ${lit(table)} name,(SELECT coalesce(jsonb_agg(to_jsonb(t)ORDER BY to_jsonb(t)::text),'[]') FROM saas.${table} t)rows`).join(' UNION ALL ')+') snapshots');
};
const catalog=()=>query("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('oid',p.oid,'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel)ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
let checks=0;const check=(label,fn)=>{fn();console.log(`PASS ${++checks} ${label}`);};
try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=289&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 if(process.argv.includes('--dump-hashes')){
  console.log(sql("SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel)ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('accounting_receivable_projection','in_store_sales_projection_v3','abandoned_carts_projection','abandoned_carts_list_without_durable_reconciliation_v101')"));
  console.log(sql("SELECT jsonb_object_agg(c.relname,(SELECT jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relname IN('in_store_sales','inventory_locations','abandoned_carts')"));
 }else{
  owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${S}','Current291','current291','active','tr','TRY','starter',now(),now()),('${OTHER}','Other291','other291','active','tr','TRY','starter',now(),now());
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','fixture','current291','current291@example.test',true,now(),now());
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${M}','${P}','${S}','store_owner','active',now(),now());
   INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,created_at,updated_at)VALUES('${C}','${S}','active','Current','Customer','current291@example.test','+905550000291',now(),now()),('${FOREIGN}','${OTHER}','active','Foreign','Private','foreign291@example.test','+905550009999',now(),now());
   INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,channel,currency,sale_cents,collected_cents,occurred_at)VALUES('${R}','${S}','${C}',${json({name:'Historic Customer',phone:'+905550000001'})},'POS','TRY',10000,1000,now());
   INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,created_at,updated_at)VALUES('${CART}','${S}','${'a'.repeat(64)}','active','${C}','Historic Customer','historic291@example.test','+905550000001','TRY',10000,0,10000,now(),now(),now(),now());
   INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,created_at,updated_at)VALUES('${LOCATION}','${S}','Fixture location',false,'active',now(),now());
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(11)}','${S}','00000000-0000-4000-8000-000000000010','professional',2,'active',now()-interval '1 day',now(),now());`);
  owned(`INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,channel,currency,sale_cents,collected_cents,occurred_at)VALUES('${id(40)}','${S}',NULL,${json({name:'Anonymous Saved',phone:'+905550000040'})},'WEB','TRY',5000,0,now()),('${id(41)}','${S}','${C}',${json({name:'Historic Null Phone',phone:null})},'POS','TRY',5000,0,now());
   INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,customer_name,customer_email,customer_phone,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,created_at,updated_at)VALUES('${id(42)}','${S}','${'b'.repeat(64)}','active','Anonymous Saved','anonymous291@example.test','+905550000042','TRY',5000,0,5000,now(),now(),now(),now());
   INSERT INTO saas.abandoned_cart_items(id,store_id,cart_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES('${id(43)}','${S}','${CART}',0,'Unique historic product',10000,1,0,10000,now());`);
  const historic={id:C,name:'Historic Customer',firstName:'Historic',lastName:'Customer',email:'historic291@example.test',phone:'+905550000001',archived:false};
  const saleLine={productId:id(100),variantId:id(101),productName:'Historic item',variantName:'Default',sku:null,barcode:null,imageUrl:null,unitPriceCents:10000,quantity:1,discountEligible:true,lineSubtotalCents:10000,allocatedDiscountCents:0,lineNetCents:10000,catalogUnitPriceCents:10000,unitPriceOverrideCents:null,priceOverrideActorMembershipId:null};
  const savedAddress={recipientName:'Historic Customer',line1:'Historic street',city:'İstanbul',country:'TR'};
  const seedSale=(record,status,customer=C,version=3)=>owned(`INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,payment_received_at,completed_at,order_number,created_at,updated_at,payment_method,contract_version,customer_id,customer_snapshot,initial_collection_cents,fulfillment_method,shipping_address,billing_address)VALUES('${record}','${S}',${lit('SALE-'+record.slice(-3))},${lit(status)},'${M}','${LOCATION}','Fixture location',${json({customerName:'Historic Customer',note:null,discount:null})},${json([saleLine])},10000,10000,0,10000,${version!==4&&['completed','payment_received'].includes(status)?'now()':'NULL'},${status==='completed'?'now()':'NULL'},${status==='completed'?lit('POS-'+record.slice(-3)):'NULL'},now(),now(),'cash',${version},${customer?lit(customer):'NULL'},${customer?json({...historic,id:customer}):'NULL'},${version===4?0:customer?1000:10000},${lit(version===4?'shipping':'pickup')},${version===4?json(savedAddress):'NULL'},${version===4?json(savedAddress):'NULL'})`);
  seedSale(SALE,'completed');seedSale(id(12),'completed',C,4);
  for(const [index,status] of ['draft','held','payment_pending','payment_received','cancelled'].entries())seedSale(id(20+index),status);
  seedSale(id(30),'completed',id(999));seedSale(id(31),'completed',FOREIGN);seedSale(id(32),'completed',null);
  const beforeCatalog=catalog();
  const beforeBusiness=business(),legacy={receivable:projection('accounting_receivable_projection',R),cart:projection('abandoned_carts_projection',CART),sale:projection('in_store_sales_projection_v3',SALE),drafts:[20,21,22,23,24].map(n=>projection('in_store_sales_projection_v3',id(n))),fallbacks:[30,31,32].map(n=>projection('in_store_sales_projection_v3',id(n)))};
  const anonymous={receivable:projection('accounting_receivable_projection',id(40)),cart:projection('abandoned_carts_projection',id(42))};
  if(!process.argv.includes('--before-fix')){
   check('source or authority drift rejects the entire migration',()=>{
    const signature=manifest.changedRoutines[0].signature,definition=sql(`SELECT pg_get_functiondef(${lit(signature)}::regprocedure)`);
    owned(definition.replace('DECLARE authority_error text;','DECLARE authority_error text; -- fixture drift'));
    assert.throws(()=>sql(read(up)),/CUSTOMER_CURRENT_IDENTITY291_PREDECESSOR_DRIFT/);owned(definition);
    owned(`GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_workflow`);
    assert.throws(()=>sql(read(up)),/CUSTOMER_CURRENT_IDENTITY291_PREDECESSOR_DRIFT/);owned(`REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_workflow`);
    assert.equal(sql(`SELECT to_regclass('${backup}') IS NULL`),'t');assert.deepEqual(catalog(),beforeCatalog);assert.deepEqual(business(),beforeBusiness);
   });
   check('installation changes only the four reviewed readers and preserves OIDs, authority and business rows',()=>{
    sql('SET enable_nestloop=off;'+read(up));sql(read(assertions));
    const after=catalog(),changed=Object.keys(after).filter(signature=>after[signature].sha256!==beforeCatalog[signature]?.sha256).sort();
    assert.deepEqual(changed,manifest.changedRoutines.map(row=>row.signature).sort());
    assert.equal(Object.keys(after).length,Object.keys(beforeCatalog).length);
    for(const signature of Object.keys(beforeCatalog))assert.deepEqual({...after[signature],sha256:beforeCatalog[signature].sha256},beforeCatalog[signature],signature);
    for(const row of manifest.changedRoutines){assert.equal(beforeCatalog[row.signature].sha256,row.sha256);assert.equal(after[row.signature].sha256,row.afterSha256);}
    assert.deepEqual(business(),beforeBusiness);assert.throws(()=>sql(read(up)),/CUSTOMER_CURRENT_IDENTITY291_ALREADY_INSTALLED/);
   });
  }
  check('accounting uses the current linked customer name and phone',()=>{
   const value=projection('accounting_receivable_projection',R);
   assert.equal(value.customerName,'Current Customer');assert.equal(value.customerPhone,'+905550000291');
   assert.equal(projection('accounting_receivable_projection',id(41)).customerPhone,'+905550000291');
   assert.deepEqual(Object.keys(value).sort(),Object.keys(legacy.receivable).sort());
  });
  check('completed V3 and V4 sales expose a current name while preserving valid frozen transaction contacts',()=>{
   for(const [name,record,version] of [['in_store_sales_projection_v3',SALE,3],['in_store_sales_projection_v4',id(12),4]]){
    const value=projection(name,record);assert.equal(value.customerName,'Current Customer');
    assert.deepEqual(value.customer,historic);assert.equal(parseInStoreSale(value,version).customerName,'Current Customer');
   }
  });
  check('draft, held and payment states retain their exact quoted customer snapshots',()=>{
   assert.deepEqual([20,21,22,23,24].map(n=>projection('in_store_sales_projection_v3',id(n))),legacy.drafts);
  });
  check('cart list and detail expose current identity without altering saved contact fields',()=>{
   for(const name of ['abandoned_carts_projection','abandoned_carts_detail_projection']){
    const value=projection(name,CART);assert.equal(value.customerName,'Current Customer');assert.equal(value.customerEmail,'current291@example.test');assert.equal(value.customerPhone,'+905550000291');
   }
   assert.deepEqual(business(),beforeBusiness);
  });
  check('real cart-list RPC finds current identity and preserves historical identity search without fanout',()=>{
   for(const search of ['Current Customer','current291@example.test','+905550000291','Historic Customer','Unique historic product']){
    const value=list(search);assert.equal(value.outcome,'listed');assert.deepEqual(value.result_payload.items.map(item=>item.id),[CART]);
   }
   assert.deepEqual(list('Foreign Private').result_payload.items,[]);
  });
  check('orphan, unlinked and cross-store sale identities retain historical fallback and never expose foreign rows',()=>{
   assert.deepEqual([30,31,32].map(n=>projection('in_store_sales_projection_v3',id(n))),legacy.fallbacks);
   for(const [name,record] of [['accounting_receivable_projection',R],['abandoned_carts_projection',CART],['in_store_sales_projection_v3',SALE]])assert.equal(projection(name,record,OTHER),null);
  });
  check('unlinked accounting and cart records preserve their exact historical fallback',()=>{
   assert.deepEqual(projection('accounting_receivable_projection',id(40)),anonymous.receivable);
   assert.deepEqual(projection('abandoned_carts_projection',id(42)),anonymous.cart);
   assert.equal(list('Anonymous Saved').result_payload.items[0].id,id(42));
  });
  check('clearing current contacts never revives old snapshot phone or email',()=>{
   owned(`UPDATE saas.customers SET email=NULL,phone=NULL,version=version+1,updated_at=now() WHERE store_id='${S}' AND id='${C}'`);
   assert.equal(projection('accounting_receivable_projection',R).customerPhone,null);
   const cart=projection('abandoned_carts_projection',CART);assert.equal(Object.hasOwn(cart,'customerEmail'),false);assert.equal(Object.hasOwn(cart,'customerPhone'),false);
   for(const [name,record,version] of [['in_store_sales_projection_v3',SALE,3],['in_store_sales_projection_v4',id(12),4]]){
    const sale=projection(name,record);assert.deepEqual(sale.customer,historic);assert.equal(parseInStoreSale(sale,version).customerName,'Current Customer');
   }
   // Existing historical-search behavior is preserved even when current display omits a cleared contact.
   assert.equal(list('historic291@example.test').result_payload.items.length,1);
   assert.deepEqual(list('current291@example.test').result_payload.items,[]);
  });
  check('archived customers retain current identity and archived status without changing history',()=>{
   owned(`UPDATE saas.customers SET first_name='Archived',status='archived',archived_at=now(),version=version+1,updated_at=now() WHERE store_id='${S}' AND id='${C}'`);
   assert.equal(projection('accounting_receivable_projection',R).customerName,'Archived Customer');assert.equal(projection('accounting_receivable_projection',R).customerArchived,true);
   assert.equal(projection('in_store_sales_projection_v3',SALE).customerName,'Archived Customer');assert.deepEqual(projection('in_store_sales_projection_v3',SALE).customer,historic);assert.equal(projection('abandoned_carts_projection',CART).customerName,'Archived Customer');
   assert.equal(list('Archived Customer').result_payload.items.length,1);
   const current=business();
   assert.deepEqual(current.in_store_sales,beforeBusiness.in_store_sales);assert.deepEqual(current.accounting_receivables,beforeBusiness.accounting_receivables);assert.deepEqual(current.abandoned_carts,beforeBusiness.abandoned_carts);
  });
  check('private readers and rollback evidence gain no public or application privileges',()=>{
   for(const role of ['celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_support_runtime']){
    assert.throws(()=>sql(`SET ROLE ${role};SELECT * FROM ${backup}`),/permission denied/);
    assert.throws(()=>sql(`SET ROLE ${role};SELECT saas.accounting_receivable_projection('${S}','${R}')`),/permission denied/);
   }
   sql(read(assertions));
  });
  check('rollback refuses changed installed source or authority and restores exact prior definitions and OIDs',()=>{
   const currentBusiness=business(),signature=manifest.changedRoutines[0].signature,definition=sql(`SELECT pg_get_functiondef(${lit(signature)}::regprocedure)`);
   assert.throws(()=>sql(read(down)),/CUSTOMER_CURRENT_IDENTITY291_DOWN_OPT_IN_REQUIRED/);
   owned(definition.replace('DECLARE authority_error text;','DECLARE authority_error text; -- installed drift'));
   assert.throws(()=>sql("SET celebix.allow_native291_down='on';"+read(down)),/CUSTOMER_CURRENT_IDENTITY291_DOWN_DRIFT/);owned(definition);
   owned(`GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_workflow`);
   assert.throws(()=>sql("SET celebix.allow_native291_down='on';"+read(down)),/CUSTOMER_CURRENT_IDENTITY291_DOWN_DRIFT/);owned(`REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_workflow`);
   sql("SET enable_nestloop=off;SET celebix.allow_native291_down='on';"+read(down));
   assert.deepEqual(catalog(),beforeCatalog);assert.deepEqual(business(),currentBusiness);
   assert.deepEqual(projection('accounting_receivable_projection',R),{...legacy.receivable,customerArchived:true});
   assert.deepEqual(projection('in_store_sales_projection_v3',SALE),legacy.sale);assert.deepEqual(projection('abandoned_carts_projection',CART),legacy.cart);
   assert.equal(sql(`SELECT to_regclass('${backup}') IS NULL`),'t');
   sql(read(up));sql(read(assertions));assert.equal(projection('accounting_receivable_projection',R).customerName,'Archived Customer');
   assert.deepEqual(business(),currentBusiness);
  });
  console.log(`Native customer current identity291: ${checks} checks passed; ${Object.keys(beforeCatalog).length} predecessor routines checked`);
 }
}finally{fixture.stop();}
