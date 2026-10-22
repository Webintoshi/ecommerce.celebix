import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,fixture=startDisposablePostgres({database:'order_delete_debt261_native'}),{sql}=fixture;
const id=n=>`26100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const S=id(1),P=id(2),M=id(3),OTHER=id(4),OTHER_M=id(5),CASH_P=id(6),CASH_M=id(7),PRODUCT=id(8),V=id(9),PLAN='00000000-0000-4000-8000-000000000010';
const lit=x=>`'${String(x).replaceAll("'","''")}'`,j=x=>lit(JSON.stringify(x))+'::jsonb',read=f=>readFileSync(path.join(dir,f),'utf8');
const auth=(store=S,principal=P,member=M)=>`'${store}','${principal}','${member}','${PLAN}','professional',2,clock_timestamp()`;
const owned=q=>sql(`SET ROLE celebix_saas_owner;${q}`),query=q=>JSON.parse(sql(q));
const rpc=(name,args='',store=S,principal=P,member=M)=>query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.${name}(${auth(store,principal,member)}${args?','+args:''})r`);
const address={recipientName:'Debt Fixture',line1:'Test Sokak 1',city:'İstanbul',country:'TR'};
const due=r=>Math.max(r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents,0),credit=r=>Math.max(r.collected_cents-r.sale_cents+r.return_cents+r.discount_cents-r.refunded_cents,0);
const receivable=order=>query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.accounting_receivables r WHERE r.store_id='${S}'AND coalesce(r.order_id,r.deleted_order_id)='${order}'`);
const customerVersion=customer=>Number(sql(`SELECT version FROM saas.accounting_customer_versions WHERE store_id='${S}'AND customer_id='${customer}'AND currency='TRY'`));
const moneyStock=()=>query(`SELECT jsonb_build_object('accounts',(SELECT coalesce(jsonb_agg(to_jsonb(a)ORDER BY id),'[]')FROM saas.accounting_accounts a WHERE store_id='${S}'),'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY event_id,account_id),'[]')FROM saas.accounting_account_movements m WHERE store_id='${S}'),'stock',(SELECT coalesce(jsonb_agg(to_jsonb(b)ORDER BY variant_id,location_id),'[]')FROM saas.inventory_balances b WHERE store_id='${S}'),'inventory',(SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY id),'[]')FROM saas.inventory_movements m WHERE store_id='${S}'))`);
const markedEvents=order=>query(`SELECT coalesce(jsonb_agg(to_jsonb(e)ORDER BY id),'[]')FROM saas.accounting_events e WHERE e.store_id='${S}'AND coalesce(e.order_id,e.deleted_order_id)='${order}'AND e.metadata->>'permanentOrderDebtClosure'='true'`);
const remove=(order,{operation=randomUUID(),fingerprint='d'.repeat(64),version=Number(sql(`SELECT version FROM saas.orders WHERE id='${order}'`)),confirmation=sql(`SELECT order_number FROM saas.orders WHERE id='${order}'`),store=S,principal=P,member=M}={})=>rpc('delete_order',`${lit(operation)},${lit(fingerprint)},${lit(order)},${version},${lit(confirmation)}`,store,principal,member);
const mutate=(kind,intent)=>rpc('accounting_mutate',`${lit(randomUUID())},${lit(createHash('sha256').update(JSON.stringify([kind,intent])).digest('hex'))},${lit(kind)},${j(intent)}`);
let next=100,checks=0;const check=(name,work)=>{work();console.log(`PASS ${++checks} ${name}`);};
function order(total=1000,initial=0,{customer=null,source='in_store',ledger=true}={}){
 const orderId=id(next++),customerId=customer??id(next++),item=id(next++),operation=id(next++),number='D261-'+orderId;
 if(customer===null)owned(`INSERT INTO saas.customers(id,store_id,first_name,last_name,email,phone,status,created_at,updated_at)VALUES('${customerId}','${S}','Debt','Fixture','customer-${next}@example.test','+90555${String(next).padStart(7,'0')}','active',now(),now())`);
 owned(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,created_at,updated_at)VALUES('${orderId}','${S}','${number}','${source}','Debt Fixture','debt@example.test','+905551110001','${customerId}','TRY',${total},0,0,${total},'${source==='in_store'?'delivered':'pending'}','pending',${source==='in_store'?'NULL':j(address)},${source==='in_store'?'NULL':j(address)},now(),now());
 INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES('${item}','${S}','${orderId}','${PRODUCT}','${V}',0,'Debt Product','Default',${total},1,0,${total},now());
 ${ledger?`SELECT saas.accounting_post_pos_sale('${S}','${orderId}','${operation}','${customerId}',${j({name:'Debt Fixture',phone:'+905551110001'})},${total},${initial},'TRY',${initial?"'cash'":'NULL'},'2026-12-01','${M}',clock_timestamp(),${initial?'clock_timestamp()':'NULL'},'${M}');`:''}`);
 return{id:orderId,customerId,item,number:sql(`SELECT order_number FROM saas.orders WHERE id='${orderId}'`)};
}
function assertClosed(saved,before,{closed=due(before),expectedCredit=credit(before)}={}){
 const after=receivable(saved.id);assert.equal(after.order_id,null);assert.equal(after.deleted_order_id,saved.id);assert.equal(after.deleted_order_number,saved.number);
 assert.equal(due(after),0,'deleting an order must close its remaining customer debt');assert.equal(after.collected_cents,before.collected_cents);assert.equal(after.discount_cents,before.discount_cents+closed);assert.equal(after.refunded_cents,before.refunded_cents);assert.equal(after.return_cents,before.return_cents);assert.equal(credit(after),expectedCredit);
 const events=markedEvents(saved.id);assert.equal(events.length,closed>0?1:0);
 if(closed>0){const e=events[0];assert.equal(e.kind,'collection');assert.equal(e.amount_cents,0);assert.equal(e.metadata.discountCents,closed);assert.deepEqual(e.metadata.discountAllocations,[{receivableId:after.id,orderId:saved.id,amountCents:closed}]);assert.equal(e.note,'Silinen siparişin kalan borcu otomatik kapatıldı.');assert.equal(e.account_id,null);assert.equal(e.payment_method,null);assert.equal(e.deleted_order_id,saved.id);assert.equal(e.actor_membership_id,M);assert.equal(sql(`SELECT amount_cents FROM saas.accounting_allocations WHERE event_id='${e.id}'AND receivable_id='${after.id}'AND effect='discount'`),String(closed));}
 const account=rpc('accounting_read',`'customerAccount',${j({customerId:saved.customerId,currency:'TRY'})}`);assert.equal(account.outcome,'found');const row=account.result_payload.receivables.find(r=>r.id===after.id);assert.equal(row.dueCents,0);assert.equal(row.refundDueCents,expectedCredit);assert.equal(row.orderNumber,saved.number);
 return after;
}

try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=260&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 if(process.argv.includes('--dump-hashes')){
  console.log(sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('delete_order','accounting_mutate','accounting_read','accounting_schedule_list')"));
 }else{
  let candidate,down;
  if(!process.argv.includes('--before-fix')){
   const files=readdirSync(dir).filter(f=>/^202610220261.*\.up\.sql$/.test(f));assert.equal(files.length,1,'exact native261 candidate is required');candidate=files[0];down=candidate.replace('.up.','.down.');
   check('migration refuses source drift and restores exact function definitions on a clean guarded rollback',()=>{
    const signature='saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text)',before=sql(`SELECT pg_get_functiondef('${signature}'::regprocedure)`),changed=before.replace(/\nBEGIN\b/,'\nBEGIN /* unreviewed debt261 fixture drift */');assert.notEqual(changed,before);owned(changed);assert.throws(()=>sql(read(candidate)),/ORDER_DELETE_DEBT261_PREDECESSOR_DRIFT/);owned(before);
    sql(read(candidate));assert.equal(sql('SELECT count(*)FROM saas.order_delete_debt261_restore'),'4');assert.throws(()=>sql(read(down)),/ORDER_DELETE_DEBT261_DOWN_REQUIRES_EXPLICIT_OPERATOR/);sql("SET celebix.allow_native261_down='on';"+read(down));assert.equal(sql(`SELECT pg_get_functiondef('${signature}'::regprocedure)`),before);sql(read(candidate));
   });
  }
  owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${S}','Debt261 fixture','debt261-fixture','active','tr','TRY','starter',now(),now()),('${OTHER}','Debt261 other','debt261-other','active','tr','TRY','starter',now(),now());
  INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','fixture','debt261','debt261@example.test',true,now(),now()),('${CASH_P}','fixture','debt261-cashier','cashier-debt261@example.test',true,now(),now());
  INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${M}','${P}','${S}','store_owner','active',now(),now()),('${OTHER_M}','${P}','${OTHER}','store_owner','active',now(),now()),('${CASH_M}','${CASH_P}','${S}','cashier','active',now(),now());
  INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(10)}','${S}','${PLAN}','professional',2,'active',now()-interval '1 day',now(),now()),('${id(11)}','${OTHER}','${PLAN}','professional',2,'active',now()-interval '1 day',now(),now());
  INSERT INTO saas.in_store_staff_grants(store_id,membership_id,enabled,location_ids,discount_limit_bps,version,updated_at,can_manage_orders)SELECT '${S}','${CASH_M}',true,ARRAY[id],1000,1,now(),true FROM saas.inventory_locations WHERE store_id='${S}'AND is_default;
  SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),set_config('saas.inventory.source_id','${id(12)}',false),set_config('saas.inventory.source_time',now()::text,false);
  INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)VALUES('${PRODUCT}','${S}','debt261-product','Debt Product','active','TRY',now(),now());INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at)VALUES('${V}','${PRODUCT}','${S}','Default',1000,400,true,20,'active','{}',now(),now());
  UPDATE saas.accounting_release_state SET collection_discounts_enabled=true;`);
  check('unpaid native order deletion closes debt while preserving money and stock',()=>{const saved=order(),before=receivable(saved.id),stable=moneyStock();assert.equal(due(before),1000);assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,before);assert.deepEqual(moneyStock(),stable);});
  check('automatic deletion closure works when the optional manual collection discount rollout is disabled',()=>{
   const saved=order(1000,200),before=receivable(saved.id),stable=moneyStock();owned('UPDATE saas.accounting_release_state SET collection_discounts_enabled=false');
   try{assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,before);assert.deepEqual(moneyStock(),stable);}finally{owned('UPDATE saas.accounting_release_state SET collection_discounts_enabled=true');}
  });
  let partial,partialOperation,partialFingerprint,partialVersion,partialBefore,partialReceipt;
  check('partial-paid deletion closes only remaining due and leaves sibling and other customer debt intact',()=>{
   partial=order(1000,400);const sibling=order(700,0,{customer:partial.customerId}),other=order(900,0),siblingBefore=receivable(sibling.id),otherBefore=receivable(other.id),stable=moneyStock();
   partialBefore=receivable(partial.id);partialReceipt=sql(`SELECT id FROM saas.accounting_events WHERE order_id='${partial.id}'AND kind='collection'AND amount_cents>0`);partialOperation=randomUUID();partialFingerprint='a'.repeat(64);partialVersion=Number(sql(`SELECT version FROM saas.orders WHERE id='${partial.id}'`));
   assert.equal(remove(partial.id,{operation:partialOperation,fingerprint:partialFingerprint,version:partialVersion,confirmation:partial.number}).outcome,'deleted');assertClosed(partial,partialBefore);
   assert.deepEqual(receivable(sibling.id),siblingBefore);assert.deepEqual(receivable(other.id),otherBefore);assert.deepEqual(moneyStock(),stable);
   assert.equal(rpc('accounting_read',`'customerAccount',${j({customerId:partial.customerId,currency:'TRY'})}`).result_payload.dueCents,700);
  });
  check('same deletion operation replays and recovers its exact receipt without closing debt twice',()=>{
   const before=receivable(partial.id),events=markedEvents(partial.id),stable=moneyStock();
   const replay=remove(partial.id,{operation:partialOperation,fingerprint:partialFingerprint,version:partialVersion,confirmation:partial.number});assert.equal(replay.outcome,'operation_replayed');assert.equal(replay.result_payload.auditId,partialOperation);assert.equal(replay.result_payload.resourceId,partial.id);
   const recovery=rpc('delete_order_recover',`${lit(partialOperation)},${lit(partialFingerprint)}`);assert.deepEqual(recovery,replay);
   assert.equal(remove(partial.id,{operation:partialOperation,fingerprint:'b'.repeat(64),version:partialVersion,confirmation:partial.number}).outcome,'operation_mismatch');assert.deepEqual(receivable(partial.id),before);assert.deepEqual(markedEvents(partial.id),events);assert.deepEqual(moneyStock(),stable);
  });
  check('generated closure and old receipt cannot be reversed to reopen a deleted order debt',()=>{
   const closure=markedEvents(partial.id)[0],before=receivable(partial.id),stable=moneyStock();
   for(const eventId of[closure.id,partialReceipt])assert.equal(mutate('reverse',{eventId,reason:'Debt must remain closed',expectedVersion:customerVersion(partial.customerId)}).outcome,'invalid_transition');
   assert.deepEqual(receivable(partial.id),before);assert.deepEqual(moneyStock(),stable);
  });
  check('prior collection discount and return are retained while only authoritative outstanding debt closes',()=>{
   const saved=order(1000,300);
   assert.equal(mutate('returnCredit',{orderId:saved.id,amountCents:200,reason:'Existing return',expectedVersion:receivable(saved.id).version}).outcome,'committed');
   assert.equal(mutate('collect',{customerId:saved.customerId,orderId:saved.id,amountCents:0,discountCents:100,currency:'TRY',paymentMethod:'cash',accountId:null,expectedVersion:customerVersion(saved.customerId),note:'Existing settlement discount'}).outcome,'committed');
   const before=receivable(saved.id),stable=moneyStock();assert.equal(due(before),400);assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,before);assert.deepEqual(moneyStock(),stable);
  });
  check('fully paid deletion never creates a writeoff or a new refund',()=>{
   const saved=order(1000,1000),before=receivable(saved.id),stable=moneyStock();assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,before);assert.deepEqual(moneyStock(),stable);
  });
  check('existing real refund and remaining customer credit survive deletion unchanged',()=>{
   const saved=order(1000,1000);assert.equal(mutate('returnCredit',{orderId:saved.id,amountCents:400,reason:'Existing partial return',expectedVersion:receivable(saved.id).version}).outcome,'committed');
   const accountId=sql(`SELECT account_id FROM saas.accounting_events WHERE order_id='${saved.id}'AND kind='collection'AND amount_cents>0`);
   assert.equal(mutate('refund',{orderId:saved.id,accountId,amountCents:150,paymentMethod:'cash',reason:'Existing actual refund',expectedVersion:receivable(saved.id).version}).outcome,'committed');
   const before=receivable(saved.id),stable=moneyStock(),refundCount=sql(`SELECT count(*)FROM saas.accounting_events WHERE store_id='${S}'AND kind='refund'`);assert.equal(credit(before),250);
   assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,before,{closed:0,expectedCredit:250});assert.equal(sql(`SELECT count(*)FROM saas.accounting_events WHERE store_id='${S}'AND kind='refund'`),refundCount);assert.deepEqual(moneyStock(),stable);
  });
  check('a real receipt correction that leaves deleted debt at zero remains authorized',()=>{
   const saved=order(1000,900),collected=mutate('collect',{customerId:saved.customerId,orderId:saved.id,amountCents:100,currency:'TRY',paymentMethod:'cash',accountId:null,expectedVersion:customerVersion(saved.customerId),note:'Final receipt'});assert.equal(collected.outcome,'committed');
   assert.equal(mutate('returnCredit',{orderId:saved.id,amountCents:300,reason:'Existing credit',expectedVersion:receivable(saved.id).version}).outcome,'committed');const before=receivable(saved.id);assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,before,{closed:0,expectedCredit:300});
   assert.equal(mutate('reverse',{eventId:collected.result_payload.event.id,reason:'Actual receipt correction',expectedVersion:customerVersion(saved.customerId)}).outcome,'committed');const after=receivable(saved.id);assert.equal(due(after),0);assert.equal(credit(after),200);assert.equal(after.collected_cents,900);
  });
  check('wrong tenant cashier stale version and wrong confirmation cannot close or detach any debt',()=>{
   const saved=order(1000,200),before=receivable(saved.id),stable=moneyStock(),version=Number(sql(`SELECT version FROM saas.orders WHERE id='${saved.id}'`));
   assert.equal(sql(`SELECT saas.orders259_can_manage('${S}','${CASH_M}')`),'t','cashier really has Orders management permission');
   for(const [options,outcome]of[[{store:OTHER,member:OTHER_M},'order_not_found'],[{principal:CASH_P,member:CASH_M},'membership_denied'],[{version:version+1},'version_conflict'],[{confirmation:'Wrong confirmation'},'invalid_confirmation']])assert.equal(remove(saved.id,options).outcome,outcome);
   assert.deepEqual(receivable(saved.id),before);assert.deepEqual(moneyStock(),stable);assert.deepEqual(markedEvents(saved.id),[]);assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE id='${saved.id}'`),'1');
  });
  check('closure insertion failure rolls back deletion reference changes and accounting atomically',()=>{
   const saved=order(1000,250),before=receivable(saved.id),stable=moneyStock(),operation=randomUUID();
   owned(`CREATE FUNCTION saas.debt261_test_fail_closure()RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN IF NEW.metadata->>'permanentOrderDebtClosure'='true'THEN RAISE EXCEPTION 'DEBT261_INJECTED_CLOSURE_FAILURE';END IF;RETURN NEW;END$f$;CREATE TRIGGER debt261_test_fail_closure BEFORE INSERT ON saas.accounting_events FOR EACH ROW EXECUTE FUNCTION saas.debt261_test_fail_closure();`);
   try{assert.throws(()=>remove(saved.id,{operation}),/DEBT261_INJECTED_CLOSURE_FAILURE/);}finally{owned('DROP TRIGGER debt261_test_fail_closure ON saas.accounting_events;DROP FUNCTION saas.debt261_test_fail_closure();');}
   assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE id='${saved.id}'`),'1');assert.deepEqual(receivable(saved.id),before);assert.deepEqual(markedEvents(saved.id),[]);assert.deepEqual(moneyStock(),stable);assert.equal(sql(`SELECT count(*)FROM saas.record_deletion_operations WHERE operation_id='${operation}'`),'0');
  });
  check('late delete failure rolls back completed closure discount event and financial detachment together',()=>{
   const saved=order(1000,250),before=receivable(saved.id),stable=moneyStock(),operation=randomUUID(),version=customerVersion(saved.customerId),events=()=>query(`SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM saas.accounting_events e WHERE store_id='${S}'AND coalesce(order_id,deleted_order_id)='${saved.id}'`),originalEvents=events();
   owned(`CREATE FUNCTION saas.debt261_test_fail_late()RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN IF OLD.id='${saved.id}'::uuid THEN RAISE EXCEPTION 'DEBT261_INJECTED_LATE_DELETE_FAILURE';END IF;RETURN OLD;END$f$;CREATE TRIGGER zz_debt261_test_fail_late BEFORE DELETE ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.debt261_test_fail_late();`);
   try{assert.throws(()=>remove(saved.id,{operation}),/DEBT261_INJECTED_LATE_DELETE_FAILURE/);}finally{owned('DROP TRIGGER zz_debt261_test_fail_late ON saas.orders;DROP FUNCTION saas.debt261_test_fail_late();');}
   assert.equal(sql(`SELECT count(*)FROM saas.orders WHERE id='${saved.id}'`),'1');assert.deepEqual(receivable(saved.id),before);assert.deepEqual(events(),originalEvents);assert.equal(customerVersion(saved.customerId),version);assert.deepEqual(markedEvents(saved.id),[]);assert.deepEqual(moneyStock(),stable);assert.equal(sql(`SELECT count(*)FROM saas.record_deletion_operations WHERE operation_id='${operation}'`),'0');
  });
  check('edited260 debt uses current effective amount while original edit money evidence survives',()=>{
   const saved=order(1000,400,{source:'manual_import'}),w=rpc('orders_edit_workspace',lit(saved.id)).result_payload;
   const intent={expectedVersion:w.version,customerName:w.customerName,customerEmail:w.customerEmail,customerPhone:w.customerPhone,shippingAddress:w.shippingAddress,billingAddress:w.billingAddress,shippingCents:0,discountCents:0,reason:'Current edited balance',lines:w.lines.map(line=>({lineId:line.lineId,productId:line.productId,variantId:line.variantId,quantity:2,unitPriceCents:1000,discountCents:0}))};
   const p=rpc('orders_edit_preview',`${lit(saved.id)},${j(intent)}`);assert.equal(p.outcome,'previewed');const applied=rpc('orders_edit_apply',`${lit(saved.id)},${lit(randomUUID())},${lit('e'.repeat(64))},${j(intent)},${lit(p.result_payload.fingerprint)}`);assert.equal(applied.outcome,'committed');
   const before=receivable(saved.id),stable=moneyStock(),history=sql(`SELECT count(*)FROM saas.order_edit_revisions WHERE order_id='${saved.id}'`);assert.equal(due(before),1600);assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,before);assert.deepEqual(moneyStock(),stable);assert.equal(sql(`SELECT count(*)FROM saas.order_edit_revisions WHERE order_id='${saved.id}'`),history);
  });
  check('legacy POS without a receivable deletes without inventing sale collection or debt evidence',()=>{
   const saved=order(1000,0,{ledger:false}),stable=moneyStock();assert.equal(sql(`SELECT count(*)FROM saas.accounting_receivables WHERE order_id='${saved.id}'`),'0');assert.equal(remove(saved.id).outcome,'deleted');assert.deepEqual(markedEvents(saved.id),[]);assert.deepEqual(moneyStock(),stable);assert.equal(sql(`SELECT count(*)FROM saas.accounting_receivables WHERE deleted_order_id='${saved.id}'`),'0');
  });
  check('existing installment plan becomes covered without erasing its immutable schedule',()=>{
   const saved=order(1000,200),before=receivable(saved.id),schedule=rpc('accounting_schedule_mutate',`${lit(randomUUID())},${lit('f'.repeat(64))},${j({receivableId:before.id,expectedVersion:before.version,installments:[{dueDate:'2026-12-01',amountCents:800}]})}`);assert.equal(schedule.outcome,'committed');const plans=sql(`SELECT count(*)FROM saas.accounting_schedule_plans WHERE receivable_id='${before.id}'`);
   const current=receivable(saved.id);assert.equal(remove(saved.id).outcome,'deleted');assertClosed(saved,current);const read=rpc('accounting_schedule_read',lit(before.id));assert.equal(read.outcome,'found');assert.equal(read.result_payload.receivable.dueCents,0);assert.equal(read.result_payload.unplannedCents,0);assert.deepEqual(read.result_payload.installments.map(p=>p.dueCents),[0]);assert.equal(sql(`SELECT count(*)FROM saas.accounting_schedule_plans WHERE receivable_id='${before.id}'`),plans);
  });
  check('known-cost profit classifies closure as allocated discount with zero cash or return change',()=>{
   const saved=order(1000,400),day=sql("SELECT(clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text"),filters={dateFrom:day,dateTo:day,profitScope:'known_cost'},report=()=>{const r=rpc('accounting_profitability_read',j(filters));assert.equal(r.outcome,'found');return r.result_payload.currencies.find(c=>c.currency==='TRY');};
   const before=report(),cash=moneyStock();assert.equal(remove(saved.id).outcome,'deleted');const after=report();
   assert.equal(after.knownProfit.includedOrderCount,before.knownProfit.includedOrderCount);assert.equal(after.knownProfit.excludedOrderCount,before.knownProfit.excludedOrderCount);assert.equal(after.knownProfit.discountCents-before.knownProfit.discountCents,600);assert.equal(after.knownProfit.netSalesCents-before.knownProfit.netSalesCents,-600);assert.equal(after.knownProfit.grossProfitCents-before.knownProfit.grossProfitCents,-600);assert.equal(after.knownProfit.costCents,before.knownProfit.costCents);assert.equal(after.returnCents,before.returnCents);assert.equal(after.netCashCents,before.netCashCents);assert.deepEqual(moneyStock(),cash);
  });
  check('closed deleted rows disappear from actual debt and schedule lists while credit and other debt stay visible',()=>{
   const settled=order(1000,1000),settledRow=receivable(settled.id),historical=order(500,0);
   // A pre261 historical deletion retained a live debt. Reproduce its native216
   // detach boundary rather than treating all deleted receivables as closed.
   owned(`BEGIN;SELECT set_config('saas.permanent_delete_order','${S}:${historical.id}',true);SELECT saas.accounting_detach_deleted_order('${S}','${historical.id}');DELETE FROM saas.order_items WHERE order_id='${historical.id}';DELETE FROM saas.orders WHERE id='${historical.id}';COMMIT;`);
   const debts=rpc('accounting_read',`'receivables','{}'::jsonb`),schedules=rpc('accounting_schedule_list',`'{}'::jsonb`);assert.equal(debts.outcome,'found');assert.equal(schedules.outcome,'found');
   const closedIds=query(`SELECT coalesce(jsonb_agg(id),'[]')FROM saas.accounting_receivables WHERE store_id='${S}'AND deleted_order_id IS NOT NULL AND sale_cents-return_cents-discount_cents-collected_cents<=0 AND collected_cents-sale_cents+return_cents+discount_cents-refunded_cents<=0`);
   for(const closed of closedIds){assert.equal(debts.result_payload.receivables.some(r=>r.id===closed),false);assert.equal(schedules.result_payload.schedules.some(p=>p.receivable.id===closed),false);}
   assert.ok(debts.result_payload.receivables.some(r=>r.id===settledRow.id),'settled but undeleted receivables are retained');
   assert.ok(debts.result_payload.receivables.some(r=>r.id===receivable(historical.id).id&&r.dueCents===500),'historical detached positive debt is retained');
   assert.ok(debts.result_payload.receivables.some(r=>r.orderId===null&&r.refundDueCents>0),'deleted customer credit remains visible');assert.ok(schedules.result_payload.schedules.some(p=>p.receivable.refundDueCents>0&&p.receivable.orderId===null));
  });
  check('closed deleted history is filtered before the schedule page limit',()=>{
   const open=order(777,0),row=receivable(open.id);owned(`UPDATE saas.accounting_receivables SET due_date=NULL WHERE id='${row.id}';INSERT INTO saas.accounting_receivables(id,store_id,customer_snapshot,deleted_order_id,deleted_order_number,channel,currency,sale_cents,collected_cents,occurred_at)SELECT saas.inventory_deterministic_uuid('debt261-pagination-receivable',n::text),'${S}','{"name":"Closed historical fixture"}',saas.inventory_deterministic_uuid('debt261-pagination-order',n::text),'closed-page-'||n,'POS','TRY',1000,1000,now()-interval '100 days'FROM generate_series(1,201)n;`);
   const listed=rpc('accounting_schedule_list',`'{}'::jsonb`);assert.equal(listed.outcome,'found');assert.equal(listed.result_payload.schedules.some(p=>p.receivable.id===row.id),true,'an open undated debt must not be displaced by 201 closed historical rows');assert.equal(listed.result_payload.schedules.some(p=>p.receivable.customerName==='Closed historical fixture'),false);assert.equal(listed.result_payload.hasMore,false);
  });
  check('private closure helper requires deletion context and cannot rewrite immutable event evidence',()=>{
   const saved=order(1000,0),before=receivable(saved.id);assert.throws(()=>owned(`SELECT saas.permanent_order_close_debt('${S}','${saved.id}','${M}','${randomUUID()}',clock_timestamp())`),/ORDER_DELETE_DEBT261_CONTEXT_REQUIRED/);assert.deepEqual(receivable(saved.id),before);
   for(const role of['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow','celebix_saas_identity'])assert.equal(sql(`SELECT has_function_privilege('${role}','saas.permanent_order_close_debt(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')`),'f');assert.equal(sql("SELECT has_table_privilege('celebix_saas_app','saas.order_delete_debt261_restore','SELECT')"),'f');
   const event=markedEvents(partial.id)[0];assert.throws(()=>owned(`UPDATE saas.accounting_events SET metadata=metadata||'{"changed":true}'WHERE id='${event.id}'`),/ACCOUNTING_IMMUTABLE/);
  });
  check('rollback refuses to discard committed noncash debt closures',()=>{assert.throws(()=>sql("SET celebix.allow_native261_down='on';"+read(down)),/ORDER_DELETE_DEBT261_COMMITTED_CLOSURES/);});
  console.log(`PASS order delete debt native261: ${checks} scenarios`);
 }
}finally{fixture.stop();}
