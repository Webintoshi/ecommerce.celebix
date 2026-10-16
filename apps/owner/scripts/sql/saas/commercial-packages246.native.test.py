"""Focused native246 tests against a synthetic, socket-only PG16 clone; never accepts network URLs."""
from pathlib import Path
import concurrent.futures,hashlib,json,subprocess,time,uuid
ROOT=Path(__file__).resolve().parents[5]
ART=ROOT/'.tmp/commercial-native246-20261017'
BIN='/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin/psql'
ARGS=[BIN,'-h','/tmp/celebix-c246-20261017','-p','24660','-U','postgres','-d','celebix_saas_staging_auth01','-XqAt','-v','ON_ERROR_STOP=1']
S='10000000-0000-4000-8000-000000000001';P='10000000-0000-4000-8000-000000000003';M='10000000-0000-4000-8000-000000000004';FREE='00000000-0000-4000-8000-000000000003';START='00000000-0000-4000-8000-000000000004';GROW='00000000-0000-4000-8000-000000000005';PRO='00000000-0000-4000-8000-000000000006'
def sql(s,ok=True):
 p=subprocess.run(ARGS,input=s,text=True,capture_output=True,timeout=40)
 if ok and p.returncode:raise AssertionError(p.stderr)
 return p.stdout.strip()if ok else p
assert json.loads(sql("SELECT jsonb_build_object('socket',inet_server_addr() IS NULL,'port',current_setting('port')='24660','tier',current_setting('celebix.deployment_tier')='isolated_staging','path',current_setting('data_directory')="+"'"+str(ART/'data')+"')"))==dict(socket=True,port=True,tier=True,path=True),'isolated fixture required'
def setup(plan=FREE,code='free_starter',version=2):return f"SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET status='revoked' WHERE store_id='{S}' AND role<>'store_owner';UPDATE saas.subscriptions SET plan_id='{plan}',plan_code='{code}',plan_version={version},valid_from=clock_timestamp()-interval '1 minute' WHERE store_id='{S}' AND status='active';"
def call(name='commercial_plan_read',plan=FREE,code='free_starter',version=2,extra=''):return f"SELECT saas.{name}('{S}','{P}','{M}','{plan}','{code}',{version},clock_timestamp(){extra});"
def tx(s,plan=FREE,code='free_starter',version=2):return sql('BEGIN;'+setup(plan,code,version)+s+'ROLLBACK;')
checks=[]
def test(name,fn):fn();checks.append(name);print('PASS',len(checks),name,flush=True)
def eq(a,b):assert a==b,(a,b)
def rpc_read():
 v=json.loads(tx('RESET ROLE;SET LOCAL ROLE celebix_saas_app;'+call()));eq(set(v),{'plan','usage'});eq(v['plan'],{'planId':FREE,'planCode':'free_starter','version':2});eq(v['usage']['staff'],1);eq(v['usage']['monthlyOrders'],0)
test('owner RPC exact current plan and owner-inclusive usage',rpc_read)
def request():
 key=str(uuid.uuid4());c=call('commercial_upgrade_request',extra=f",'{START}','{key}'")
 out=tx('RESET ROLE;SET LOCAL ROLE celebix_saas_app;'+c+c+call('commercial_upgrade_request',extra=f",'{PRO}','{key}'"));a,b,c=map(json.loads,out.splitlines());eq(a['status'],'pending');eq(a['replayed'],False);eq(b['requestId'],a['requestId']);eq(b['replayed'],True);eq(c,{'code':'operation_mismatch'})
test('upgrade request idempotence, no automatic assignment, key mismatch',request)
def role_stale():
 q=call(plan=PRO,code='professional',version=1).replace(P,'10000000-0000-4000-8000-000000000009').replace(M,'10000000-0000-4000-8000-000000000010')
 v=json.loads(tx("UPDATE saas.memberships SET status='active' WHERE id='10000000-0000-4000-8000-000000000010';RESET ROLE;SET LOCAL ROLE celebix_saas_app;"+q,PRO,'professional',1));eq(v['code'],'membership_denied')
 v=json.loads(tx('RESET ROLE;SET LOCAL ROLE celebix_saas_app;'+call(plan=PRO,code='professional',version=1)));eq(v['code'],'durable_authority_invalid')
test('roles and stale plan identities fail closed',role_stale)
def catalog():
 q="SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.plan_code,'version',p.version,'price',r.monthly_price_cents,'annual',r.yearly_price_cents,'variantLimit',c.variant_limit,'capabilities',c.capabilities,'features',(SELECT count(*)FROM saas.plan_features WHERE plan_id=p.id),'limits',(SELECT count(*)FROM saas.plan_limits WHERE plan_id=p.id))ORDER BY p.id) FROM saas.commercial_plan_policies c JOIN saas.plans p ON p.id=c.plan_id JOIN saas.platform_plan_prices r ON r.plan_id=p.id;"
 v=json.loads(sql(q));eq([x['price']for x in v],[0,199000,349000,599000]);eq([x['variantLimit']for x in v],[500,5000,25000,50000]);assert all(x['features']==13 and x['limits']==5 for x in v)
test('four exact immutable plan seeds retain legacy DTO keys',catalog)
def caps():
 v=json.loads(sql(f"SELECT jsonb_build_object('free',saas.commercial_plan_has_capability('{FREE}','manual_orders'),'starter',saas.commercial_plan_has_capability('{START}','coupons'),'growth',saas.commercial_plan_has_capability('{GROW}','growth_tools'),'professional',saas.commercial_plan_has_capability('{PRO}','accounting'),'unknown',saas.commercial_plan_has_capability('{PRO}','nonsense'),'legacy',saas.commercial_plan_has_capability('10000000-0000-4000-8000-000000000011','manual_orders'));"));eq(v,dict(free=False,starter=True,growth=True,professional=True,unknown=False,legacy=True))
test('finite capabilities and explicit legacy behavior',caps)
def products(n,prefix='product'):
 return f"INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)SELECT saas.inventory_deterministic_uuid('commercial246','{prefix}:'||i),'{S}','{prefix}-'||i,'Fixture','draft','TRY',clock_timestamp(),clock_timestamp() FROM generate_series(1,{n})i;"
def quota_products():
 body=products(100)+"DO $t$BEGIN BEGIN "+products(1,'overflow')+"RAISE EXCEPTION 'expected denial';EXCEPTION WHEN SQLSTATE 'P0246' THEN IF SQLERRM<>'product_limit_reached' THEN RAISE;END IF;END;END $t$;"
 tx(body)
test('product cap exact boundary and transactional rejection',quota_products)
def variants(n):return f"SET LOCAL saas.inventory.source_marker='catalog_adjustment';SET LOCAL saas.inventory.source_id='{S}';SET LOCAL saas.inventory.source_time='2026-10-17T00:00:00+03:00';INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)SELECT saas.inventory_deterministic_uuid('commercial246','variant:'||i),'{S}',saas.inventory_deterministic_uuid('commercial246','sku-product:1'),'SKU',100,false,0,'active',clock_timestamp(),clock_timestamp() FROM generate_series(1,{n})i;"
def quota_skus():
 tx(products(1,'sku-product')+variants(500)+"DO $t$BEGIN BEGIN "+variants(501).replace("generate_series(1,501)","generate_series(501,501)")+"RAISE EXCEPTION 'expected denial';EXCEPTION WHEN SQLSTATE 'P0246' THEN IF SQLERRM<>'variant_limit_reached' THEN RAISE;END IF;END;END $t$;")
test('aggregate SKU cap exact boundary',quota_skus)
def reserve(n,prefix='cap'):
 return f"SELECT saas.commercial_reserve_order('{S}','{prefix}:'||i,NULL,clock_timestamp()) FROM generate_series(1,{n})i;"
def quota_orders():
 tx(reserve(50)+f"DO $t$BEGIN BEGIN PERFORM saas.commercial_reserve_order('{S}','overflow',NULL,clock_timestamp());RAISE EXCEPTION 'expected denial';EXCEPTION WHEN SQLSTATE 'P0246' THEN IF SQLERRM<>'monthly_order_limit_reached' THEN RAISE;END IF;END;PERFORM saas.commercial_reserve_order('{S}','cap:1',NULL,clock_timestamp());PERFORM saas.commercial_reserve_order('{S}','accepted-legacy',NULL,clock_timestamp(),true);END $t$;")
test('payment capacity is reserved before acceptance; replay and accepted legacy settlement retained',quota_orders)
def identities_acl():
 q="SELECT jsonb_build_object('backupUnchanged',(SELECT bool_and(p.oid=b.function_oid AND p.proowner=b.function_owner AND p.proacl IS NOT DISTINCT FROM b.function_acl AND p.proconfig IS NOT DISTINCT FROM b.function_config) FROM saas.commercial246_original_functions b JOIN pg_proc p ON p.oid=to_regprocedure(b.signature)),'private',(SELECT bool_and(NOT has_table_privilege('celebix_saas_app',oid,'SELECT,INSERT,UPDATE,DELETE')) FROM pg_class WHERE relnamespace='saas'::regnamespace AND relname IN('commercial_plan_policies','commercial_upgrade_requests','commercial_order_reservations','commercial246_original_functions')),'noPublicRpc',NOT has_function_privilege('public','saas.commercial_plan_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz)','EXECUTE'))"
 v=json.loads(sql(q));assert all(v.values()),v
 # Every original outside the declared changed set remains byte/ACL/owner/config identical.
 before=json.loads((ART/'before-functions.json').read_text());after=json.loads(sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig))FROM pg_proc p WHERE pronamespace='saas'::regnamespace"));changed=set(json.loads((ART/'changed-signatures.json').read_text()));assert all(after[k]==v for k,v in before.items()if k not in changed)
test('least privilege and unchanged unrelated native authorities',identities_acl)
def release_and_expiry():
 actor='24600000-0000-4000-8000-000000000001'
 operator=f"UPDATE saas.principals SET email=(SELECT(regexp_match(pg_get_constraintdef(oid),$re$'([^']+)'$re$))[1]FROM pg_constraint WHERE conrelid='saas.platform_operators'::regclass AND conname='platform_operators_email_check') WHERE id='{P}';INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)SELECT '{actor}',issuer,subject,id,(SELECT(regexp_match(pg_get_constraintdef(oid),$re$'([^']+)'$re$))[1]FROM pg_constraint WHERE conrelid='saas.platform_operators'::regclass AND conname='platform_operators_email_check'),true FROM saas.principals WHERE id='{P}';"
 assign=lambda target,key:f"PERFORM saas.platform_command('{actor}','subscription.assign',jsonb_build_object('storeId','{S}','planId','{target}'),coalesce((SELECT version FROM saas.platform_store_versions WHERE store_id='{S}'),0),'{key}');"
 body=operator+f"UPDATE saas.subscriptions SET valid_until=clock_timestamp()+interval '30 days' WHERE store_id='{S}'AND status='active';"+f"DO $t$DECLARE expiry timestamptz;BEGIN SELECT valid_until INTO expiry FROM saas.subscriptions WHERE store_id='{S}' AND status='active';BEGIN "+assign(PRO,'disabled')+"RAISE EXCEPTION 'expected disabled';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'commercial_assignment_disabled' THEN RAISE;END IF;END;UPDATE saas.commercial_package_release_state SET assignments_enabled=true;"+assign(PRO,'assigned')+f"IF(SELECT valid_until FROM saas.subscriptions WHERE store_id='{S}'AND status='active') IS DISTINCT FROM expiry THEN RAISE EXCEPTION 'expiry changed';END IF;END$t$;"
 tx(body)
 eq(sql('SELECT saas.commercial_default_starter_version();'),'1')
 eq(tx('UPDATE saas.commercial_package_release_state SET assignments_enabled=true;SELECT saas.commercial_default_starter_version();'),'2')
 expired=operator+"UPDATE saas.commercial_package_release_state SET assignments_enabled=true;"+f"UPDATE saas.subscriptions SET valid_from=clock_timestamp()-interval '2 days',valid_until=clock_timestamp()-interval '1 day' WHERE store_id='{S}'AND status='active';DO $t$BEGIN BEGIN "+assign(PRO,'expired')+"RAISE EXCEPTION 'expected expired';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'subscription_expired' THEN RAISE;END IF;END;END$t$;"
 tx(expired)
test('native release gate and default selector; exact expiry preserved and expired subscription refused',release_and_expiry)
def quota_seats():
 tx("DO $t$BEGIN BEGIN UPDATE saas.memberships SET status='active' WHERE id='10000000-0000-4000-8000-000000000010';RAISE EXCEPTION 'expected denial';EXCEPTION WHEN SQLSTATE 'P0246' THEN IF SQLERRM<>'staff_limit_reached' THEN RAISE;END IF;END;END$t$;")
test('owner-inclusive seats reject a second active person on free',quota_seats)
def assets(n):
 return f"INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at)SELECT id,'{S}','hero','stores/{S}/storefront/hero/'||id||'.webp','https://synthetic.invalid/stores/{S}/storefront/hero/'||id||'.webp','image/webp','',1,1,5000000,'active',clock_timestamp(),clock_timestamp() FROM(SELECT saas.inventory_deterministic_uuid('commercial246','asset:'||i)id FROM generate_series(1,{n})i)ids;"
def quota_storage():
 tx(assets(200)+"DO $t$BEGIN BEGIN "+assets(201).replace('generate_series(1,201)','generate_series(201,201)')+"RAISE EXCEPTION 'expected storage denial';EXCEPTION WHEN SQLSTATE 'P0246' THEN IF SQLERRM<>'storage_limit_reached' THEN RAISE;END IF;END;END$t$;")
test('merchant storage exact 1GB boundary enforced',quota_storage)
def order_insert(order):return f"INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,shipping_address,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,created_at,updated_at)VALUES('{order}','{S}','COMMERCIAL-246-{order[-8:]}','storefront','Synthetic','synthetic@example.invalid','{{}}','TRY',100,0,0,100,'pending','pending',clock_timestamp(),clock_timestamp());"
def held_settlement():
 oid=str(uuid.uuid4());body=reserve(49)+f"SELECT saas.commercial_reserve_order('{S}','paid-target','{oid}',clock_timestamp());"+order_insert(oid)+f"UPDATE saas.orders SET updated_at=updated_at WHERE id='{oid}';DO $t$BEGIN IF(SELECT count(*)FROM saas.commercial_order_reservations WHERE store_id='{S}'AND state='consumed')<>1 THEN RAISE EXCEPTION 'consume/replay incorrect';END IF;BEGIN PERFORM saas.commercial_reserve_order('{S}','over',NULL,clock_timestamp());RAISE EXCEPTION 'expected rejection';EXCEPTION WHEN SQLSTATE 'P0246' THEN NULL;END;END$t$;"
 tx(body)
test('reserved paid target settles at capacity; historical order update consumes no extra capacity',held_settlement)
def native_fine_denials():
 q=f"SELECT outcome FROM saas.order_drafts_create('{S}','{P}','{M}','{FREE}','free_starter',2,clock_timestamp(),'{uuid.uuid4()}',repeat('a',64),'{uuid.uuid4()}','{{}}');";eq(tx(q),'feature_not_enabled')
 q=f"SELECT outcome FROM saas.commerce_analytics_snapshot('{S}','{P}','{M}','{START}','starter',1,clock_timestamp(),clock_timestamp()-interval '1 day',clock_timestamp(),'{{\"view\":\"funnel\"}}');";eq(tx(q,START,'starter',1),'feature_not_enabled')
 q=f"SELECT saas.accounting_authority_error('{S}','{P}','{M}','{GROW}','growth',1,clock_timestamp(),false);";eq(tx(q,GROW,'growth',1),'feature_not_enabled')
 q=f"SELECT saas.toshi_provider_authority_error('{S}','{P}','{M}','{FREE}','free_starter',2,clock_timestamp(),false);";eq(tx(q),'feature_not_enabled')
test('native manual, advanced analytics, accounting and AI entrypoints enforce capability',native_fine_denials)
def concurrent_capacity():
 # Committed setup exists only in this explicitly asserted private synthetic fixture.
 sql('BEGIN;'+setup()+products(99,'concurrent')+'COMMIT;')
 a='BEGIN;SET LOCAL ROLE celebix_saas_owner;'+products(1,'concurrent-a')+'SELECT pg_sleep(0.3);COMMIT;'
 b='BEGIN;SET LOCAL ROLE celebix_saas_owner;'+products(1,'concurrent-b')+'COMMIT;'
 with concurrent.futures.ThreadPoolExecutor(2)as pool:
  f1=pool.submit(sql,a,False);time.sleep(.05);f2=pool.submit(sql,b,False);results=[f1.result(),f2.result()]
 try:
  eq(sorted(p.returncode==0 for p in results),[False,True]);assert any('product_limit_reached'in p.stderr for p in results)
 finally:
  sql(f"BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.subscriptions SET plan_id='10000000-0000-4000-8000-000000000011',plan_code='fixture',plan_version=1 WHERE store_id='{S}'AND status='active';DELETE FROM saas.products WHERE store_id='{S}'AND slug LIKE 'concurrent%';UPDATE saas.memberships SET status='active' WHERE store_id='{S}';COMMIT;")
test('two real concurrent writers cannot overshoot product capacity',concurrent_capacity)
def concurrent_requests():
 sql('BEGIN;'+setup()+'COMMIT;');key=str(uuid.uuid4());q='BEGIN;SET LOCAL ROLE celebix_saas_app;'+call('commercial_upgrade_request',extra=f",'{START}','{key}'")+'COMMIT;'
 try:
  with concurrent.futures.ThreadPoolExecutor(2)as pool:results=list(pool.map(lambda _:json.loads(sql(q)),range(2)))
  eq(results[0]['requestId'],results[1]['requestId']);eq(sorted(v['replayed']for v in results),[False,True])
 finally:
  sql(f"BEGIN;SET LOCAL ROLE celebix_saas_owner;ALTER TABLE saas.commercial_upgrade_requests DISABLE TRIGGER commercial_requests_immutable;DELETE FROM saas.commercial_upgrade_requests;ALTER TABLE saas.commercial_upgrade_requests ENABLE TRIGGER commercial_requests_immutable;UPDATE saas.subscriptions SET plan_id='10000000-0000-4000-8000-000000000011',plan_code='fixture',plan_version=1 WHERE store_id='{S}'AND status='active';UPDATE saas.memberships SET status='active' WHERE store_id='{S}';COMMIT;")
test('two concurrent identical upgrade requests yield one receipt',concurrent_requests)
def nonquota_update_fast():
 run='fast-'+str(uuid.uuid4());pid=f"saas.inventory_deterministic_uuid('commercial246','{run}:1')";vid=f"saas.inventory_deterministic_uuid('commercial246','{run}-variant:1')"
 sql('BEGIN;'+setup()+products(1,run)+variants(1).replace("'variant:'",f"'{run}-variant:'").replace("'sku-product:1'",f"'{run}:1'")+'COMMIT;')
 locker=subprocess.Popen(ARGS,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 locker.stdin.write(f"BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||'{S}',0));SELECT pg_sleep(.5);COMMIT;");locker.stdin.close();time.sleep(.1)
 try:
  started=time.monotonic();sql(f"BEGIN;SET LOCAL ROLE celebix_saas_owner;SET LOCAL lock_timeout='100ms';UPDATE saas.product_variants SET price_cents=price_cents+1 WHERE id={vid};COMMIT;");assert time.monotonic()-started<.4
 finally:
  locker.wait(timeout=5)
  sql(f"BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.subscriptions SET plan_id='10000000-0000-4000-8000-000000000011',plan_code='fixture',plan_version=1 WHERE store_id='{S}'AND status='active';UPDATE saas.product_variants SET status='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp()+interval '1 second' WHERE id={vid};UPDATE saas.products SET status='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp()+interval '1 second' WHERE id={pid};UPDATE saas.memberships SET status='active' WHERE store_id='{S}';COMMIT;")
test('ordinary variant price update bypasses commercial lock and quota scans',nonquota_update_fast)
def concurrent_monthly():
 sql('BEGIN;'+setup()+reserve(49,'concurrent-month')+'COMMIT;')
 def reserve_one(key):return sql(f"BEGIN;SET LOCAL ROLE celebix_saas_owner;SELECT saas.commercial_reserve_order('{S}','{key}',NULL,clock_timestamp());SELECT pg_sleep(.2);COMMIT;",False)
 try:
  with concurrent.futures.ThreadPoolExecutor(2)as pool:results=list(pool.map(reserve_one,['concurrent-month-a','concurrent-month-b']))
  eq(sorted(p.returncode==0 for p in results),[False,True]);assert any('monthly_order_limit_reached'in p.stderr for p in results)
 finally:
  sql(f"BEGIN;SET LOCAL ROLE celebix_saas_owner;DELETE FROM saas.commercial_order_reservations WHERE store_id='{S}';UPDATE saas.subscriptions SET plan_id='10000000-0000-4000-8000-000000000011',plan_code='fixture',plan_version=1 WHERE store_id='{S}'AND status='active';UPDATE saas.memberships SET status='active' WHERE store_id='{S}';COMMIT;")
test('two concurrent payment admissions cannot overshoot monthly reservations',concurrent_monthly)
def actual_manual_create():
 variant="46b1b355-7365-5406-8274-93108e6abd12";location='10000000-0000-4000-8000-000000000015'
 intent=dict(locationId=location,items=[dict(variantId=variant,quantity=1,unitPriceOverrideCents=None)],discount=None,customerName=None,note=None,customerId=None,dueDate=None,salesChannel='manual',socialPlatform=None,socialReference=None,fulfillmentMethod='pickup',shippingAddress=None,billingAddress=None,shippingCents=0,paymentParts=[dict(partId=str(uuid.uuid4()),paymentMethod='cash',amountCents=100)])
 fixture="UPDATE saas.accounting_release_state SET manual_sales_v4_enabled=true;"+products(1,'sku-product').replace("'draft','TRY'","'active','TRY'")+variants(1)
 for plan,code,version,expected in [(START,'starter',1,'committed'),(GROW,'growth',1,'committed'),(FREE,'free_starter',2,'feature_not_enabled')]:
  q=f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload)FROM saas.in_store_sales_create_v4('{S}','{P}','{M}','{plan}','{code}',{version},clock_timestamp(),'{uuid.uuid4()}',repeat('a',64),'{uuid.uuid4()}','{json.dumps(intent)}');"
  r=json.loads(tx(fixture+q,plan,code,version));eq(r['outcome'],expected)
  if expected=='committed':eq(r['payload']['sale']['contractVersion'],4)
 old={k:intent[k]for k in ['locationId','items','discount','customerName','note']};old['items']=[dict(variantId=variant,quantity=1)]
 q=f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload)FROM saas.in_store_sales_create('{S}','{P}','{M}','{PRO}','professional',1,clock_timestamp(),'{uuid.uuid4()}',repeat('a',64),'{uuid.uuid4()}','{json.dumps(old)}');"
 r=json.loads(tx(fixture+q,PRO,'professional',1));eq(r['outcome'],'committed')
test('actual Starter/Growth v4 manual sale creates; Free denied; Professional legacy cashier creates',actual_manual_create)
def basic_analytics():
 for plan,code,version in [(FREE,'free_starter',2),(START,'starter',1)]:
  q=f"SELECT outcome FROM saas.commerce_analytics_snapshot('{S}','{P}','{M}','{plan}','{code}',{version},clock_timestamp(),clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 second','{{\"view\":\"overview\"}}');"
  eq(tx(q,plan,code,version),'resolved')
test('actual Free and Starter commerce analytics overview remains core',basic_analytics)
def applied_receipt_history():
 actor='24600000-0000-4000-8000-000000000001';key=str(uuid.uuid4())
 operator=f"UPDATE saas.principals SET email=(SELECT(regexp_match(pg_get_constraintdef(oid),$re$'([^']+)'$re$))[1]FROM pg_constraint WHERE conrelid='saas.platform_operators'::regclass AND conname='platform_operators_email_check') WHERE id='{P}';INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)SELECT '{actor}',issuer,subject,id,email,true FROM saas.principals WHERE id='{P}';UPDATE saas.commercial_package_release_state SET assignments_enabled=true;"
 body=call('commercial_upgrade_request',extra=f",'{START}','{key}'")+f"INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES(gen_random_uuid(),'{S}','{START}','starter',1,'inactive',clock_timestamp(),clock_timestamp(),clock_timestamp());UPDATE saas.subscriptions SET plan_id='{GROW}',plan_code='growth',plan_version=1 WHERE store_id='{S}'AND status='active';SELECT saas.commercial_request_projection(id)->>'status'FROM saas.commercial_upgrade_requests WHERE operation_key='{key}';"
 eq(tx(body).splitlines()[-1],'applied')
test('fulfilled upgrade request stays applied after a later upgrade',applied_receipt_history)
def pending_v4_downgrade(full_paid=False):
 ns=str(uuid.uuid4());nm=str(uuid.uuid4());nc=str(uuid.uuid4());nl=str(uuid.uuid4());sale=str(uuid.uuid4());actor=str(uuid.uuid4())
 clone=lambda table,base,updates:f"INSERT INTO saas.{table} SELECT(jsonb_populate_record(NULL::saas.{table},to_jsonb(row)||'{json.dumps(updates)}'::jsonb)).*FROM saas.{table} row WHERE id='{base}';"
 clean=clone('stores',S,dict(id=ns,slug='native246-'+ns,name='Synthetic246'))+clone('memberships',M,dict(id=nm,store_id=ns))+clone('customers','10000000-0000-4000-8000-000000000012',dict(id=nc,store_id=ns,first_name='Synthetic',last_name='Customer',phone='+905555555555'))+clone('inventory_locations','10000000-0000-4000-8000-000000000015',dict(id=nl,store_id=ns))
 clean+=f"INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES(gen_random_uuid(),'{ns}','{PRO}','professional',1,'active',clock_timestamp()-interval '1 minute',clock_timestamp(),clock_timestamp());UPDATE saas.accounting_release_state SET manual_sales_v4_enabled=true,credit_sales_enabled=true;UPDATE saas.commercial_package_release_state SET assignments_enabled=true;"
 clean+=products(1,'sku-product').replace(S,ns).replace("'draft','TRY'","'active','TRY'")+variants(1).replace(S,ns)
 intent=dict(locationId=nl,items=[dict(variantId='46b1b355-7365-5406-8274-93108e6abd12',quantity=1,unitPriceOverrideCents=None)],discount=None,customerName=None,note=None,customerId=nc,dueDate='2026-10-25',salesChannel='manual',socialPlatform=None,socialReference=None,fulfillmentMethod='pickup',shippingAddress=None,billingAddress=None,shippingCents=0,paymentParts=[dict(partId=str(uuid.uuid4()),paymentMethod='cash',amountCents=100 if full_paid else 50)])
 clean+=f"UPDATE saas.principals SET email=(SELECT(regexp_match(pg_get_constraintdef(oid),$re$'([^']+)'$re$))[1]FROM pg_constraint WHERE conrelid='saas.platform_operators'::regclass AND conname='platform_operators_email_check') WHERE id='{P}';INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)SELECT '{actor}',issuer,subject,id,email,true FROM saas.principals WHERE id='{P}';"
 prefix=f"'{ns}','{P}','{nm}','{PRO}','professional',1,clock_timestamp()"
 clean+=f"DO $t$DECLARE r record;BEGIN SELECT * INTO r FROM saas.in_store_sales_create_v4({prefix},'{uuid.uuid4()}',repeat('a',64),'{sale}','{json.dumps(intent)}');IF r.outcome<>'committed' THEN RAISE EXCEPTION 'create: %',r.outcome;END IF;SELECT * INTO r FROM saas.in_store_sales_prepare_v4({prefix},'{uuid.uuid4()}',repeat('b',64),'{sale}',1,100);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'prepare: %',r.outcome;END IF;BEGIN PERFORM saas.platform_command('{actor}','subscription.assign',jsonb_build_object('storeId','{ns}','planId','{FREE if full_paid else GROW}'),coalesce((SELECT version FROM saas.platform_store_versions WHERE store_id='{ns}'),0),'pending-v4');RAISE EXCEPTION 'expected downgrade blocked';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'{'pending_pos_blocks_downgrade' if full_paid else 'open_debt_blocks_downgrade'}' THEN RAISE;END IF;END;END$t$;"
 sql('BEGIN;SET LOCAL ROLE celebix_saas_owner;'+clean+'ROLLBACK;')
test('actual pending v4 partial-credit sale blocks downgrade before receivable creation',pending_v4_downgrade)
test('actual pending v4 fully paid sale preserves its manual recovery route on downgrade',lambda:pending_v4_downgrade(True))
(ART/'test-results.json').write_text(json.dumps({'isolatedOnly':True,'productionMutation':False,'checks':checks,'passed':len(checks)},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'isolatedOnly':True}))
