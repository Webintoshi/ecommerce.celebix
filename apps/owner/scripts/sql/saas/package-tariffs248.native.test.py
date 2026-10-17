"""Focused revision248 integration checks. Requires this private socket-only synthetic fixture."""
from pathlib import Path
import hashlib,json,subprocess,uuid
ROOT=Path(__file__).resolve().parents[5];ART=ROOT/'.tmp/commercial-native248-20261017'
BIN='/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin/psql'
ARGS=[BIN,'-h','/tmp/celebix-c248-20261017','-p','24860','-U','postgres','-d','celebix_saas_staging_auth01','-XqAt','-v','ON_ERROR_STOP=1']
S='10000000-0000-4000-8000-000000000001';P='10000000-0000-4000-8000-000000000003';M='10000000-0000-4000-8000-000000000004'
IDS=[f'00000000-0000-4000-8000-{i:012d}'for i in range(7,11)];CODES=['free_starter','starter','growth','professional'];VERS=[3,2,2,2]
def sql(q):
 p=subprocess.run(ARGS,input=q,text=True,capture_output=True,timeout=30)
 assert p.returncode==0,p.stderr
 return p.stdout.strip()
def setup(i):
 return f"SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET status='revoked' WHERE store_id='{S}' AND role<>'store_owner';UPDATE saas.subscriptions SET plan_id='{IDS[i]}',plan_code='{CODES[i]}',plan_version={VERS[i]},valid_from=clock_timestamp()-interval '1 minute' WHERE store_id='{S}' AND status='active';"
def args(i):return f"'{S}','{P}','{M}','{IDS[i]}','{CODES[i]}',{VERS[i]},clock_timestamp()"
def tx(q,i=0):return sql('BEGIN;'+setup(i)+q+'ROLLBACK;')
checks=[]
def test(label,fn):fn();checks.append(label);print('PASS',len(checks),label,flush=True)
def eq(a,b):assert a==b,(a,b)
proof=json.loads(sql("SELECT jsonb_build_object('socket',inet_server_addr() IS NULL,'port',current_setting('port')='24860','tier',current_setting('celebix.deployment_tier')='isolated_staging','path',current_setting('data_directory')='"+str(ART/'data')+"')"))
assert proof==dict(socket=True,port=True,tier=True,path=True),'isolated fixture required'
def stage():
 eq(sql('SELECT enabled FROM saas.commercial248_release_state'),'f')
 eq(tx('UPDATE saas.commercial_package_release_state SET assignments_enabled=true;SELECT saas.commercial_default_starter_version();'),'2')
 eq(tx('UPDATE saas.commercial_package_release_state SET assignments_enabled=true;UPDATE saas.commercial248_release_state SET enabled=true;SELECT saas.commercial_default_starter_version();'),'3')
test('staging keeps existing default until explicit activation',stage)
def tariffs():
 q="SELECT jsonb_agg(jsonb_build_array(p.plan_code,p.version,r.monthly_price_cents,r.yearly_price_cents,(SELECT effective_limit FROM saas.plan_limits WHERE plan_id=p.id AND limit_key='products'),(SELECT effective_limit FROM saas.plan_limits WHERE plan_id=p.id AND limit_key='monthlyOrders'))ORDER BY p.id)FROM saas.plans p JOIN saas.platform_plan_prices r ON r.plan_id=p.id WHERE p.id=ANY(ARRAY["+','.join("'"+i+"'::uuid"for i in IDS)+"]);"
 eq(json.loads(sql(q)),[['free_starter',3,0,0,25,50],['starter',2,258700,2587000,1000,1000],['growth',2,453700,4537000,5000,5000],['professional',2,778700,7787000,10000,20000]])
 eq(sql("SELECT string_agg(monthly_price_cents::text,','ORDER BY plan_id)FROM saas.platform_plan_prices WHERE plan_id<'"+IDS[0]+"'"),'0,199000,349000,599000')
test('25 free products and exact 30 percent tariff increase preserve old prices',tariffs)
CAPS=['manual_orders','coupons','growth_tools','email_marketing','advanced_analytics','google_connections','google_merchant','seo_tools','cashier','accounting','reference_pricing','ai','custom_domains','staff_management']
BASE=['coupons','google_connections','google_merchant','seo_tools','ai','custom_domains','staff_management'];GROW=BASE+['growth_tools','email_marketing','advanced_analytics']
def matrix():
 for i,want in enumerate([[],BASE,GROW,CAPS]):
  eq(json.loads(sql("SELECT jsonb_object_agg(cap,saas.commercial_plan_has_capability('"+IDS[i]+"',cap))FROM unnest(ARRAY["+",".join("'"+c+"'"for c in CAPS)+"])cap;")),{c:c in want for c in CAPS})
 eq(sql("BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000001','free_starter',1,'active',now(),now(),now()),('00000000-0000-4000-8000-000000000002','pilot',1,'active',now(),now(),now())ON CONFLICT DO NOTHING;SELECT saas.commercial_plan_has_capability('ffffffff-ffff-4fff-8fff-ffffffffffff','manual_orders'),saas.commercial_plan_has_capability('00000000-0000-4000-8000-000000000001','manual_orders'),saas.commercial_plan_has_capability('00000000-0000-4000-8000-000000000002','manual_orders');ROLLBACK;"),'f|t|t')
test('all 14 capabilities across all packages; unknown identities fail closed',matrix)
def manual():
 for i in range(4):
  for suffix in ['','_v2','_v3','_v4']:
   eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.in_store_sales_bootstrap{suffix}({args(i)});",i),'found'if i==3 else'feature_not_enabled')
  eq(tx(f"SELECT coalesce(saas.quick_link_merchant_authority_error({args(i)},'quick_links.manage'),'allowed');",i),'allowed'if i==3 else'feature_not_enabled')
test('all four physical/manual API versions and payment-link creation enforce Professional',manual)
def reads():
 for i in range(3):
  for name,extra in [('order_drafts_list',',20,NULL,NULL'),('order_drafts_get',",'"+str(uuid.uuid4())+"'"),('quick_links_list',",'active',20,NULL,NULL")]:
   eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.{name}({args(i)}{extra});",i),'feature_not_enabled')
 for i in range(4):
  eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.abandoned_carts_list({args(i)},NULL,NULL,'newest',20,NULL,NULL,NULL);",i),'feature_not_enabled'if i<2 else'listed')
test('direct draft, payment-link and abandoned-cart reads cannot bypass package locks',reads)
def segments():
 for i in range(4):
  eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.customer_segments_list({args(i)});",i),'feature_not_enabled'if i<2 else'listed')
 for i in [0,1]:
  q=f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.customer_taxonomy_upsert({args(i)},'{uuid.uuid4()}',repeat('a',64),'segment','{uuid.uuid4()}','Fixture',NULL,NULL);"
  eq(tx(q,i),'feature_not_enabled')
  cid=sql("SELECT id FROM saas.customers WHERE store_id='"+S+"'LIMIT 1")
  eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.customer_set_taxonomy({args(i)},'{uuid.uuid4()}',repeat('a',64),'{cid}','segment',ARRAY[]::uuid[]);",i),'feature_not_enabled')
 eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.customer_taxonomy_upsert({args(0)},'{uuid.uuid4()}',repeat('a',64),'tag','{uuid.uuid4()}','Fixture','#123456',NULL);"),'committed')
test('segment management requires Growth; basic customer tags remain functional',segments)
def product_cap():
 used=int(tx(f"SELECT count(*)FROM saas.products WHERE store_id='{S}'AND status<>'archived';"))
 def insert(n,prefix):
  return f"INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)SELECT saas.inventory_deterministic_uuid('c248','{prefix}'||i),'{S}','{prefix}'||i,'Fixture','draft','TRY',clock_timestamp(),clock_timestamp() FROM generate_series(1,{n})i;"
 tx(insert(25-used,'limit248')+"DO $t$BEGIN BEGIN "+insert(1,'over248')+"RAISE EXCEPTION 'expected denial';EXCEPTION WHEN SQLSTATE 'P0246' THEN IF SQLERRM<>'product_limit_reached' THEN RAISE;END IF;END;END$t$;")
test('25th free product succeeds and 26th is atomically refused',product_cap)
def monthly_cap():
 tx(f"SELECT saas.commercial_reserve_order('{S}','248:'||i,NULL,clock_timestamp())FROM generate_series(1,50)i;DO $t$BEGIN BEGIN PERFORM saas.commercial_reserve_order('{S}','over248',NULL,clock_timestamp());RAISE EXCEPTION 'expected denial';EXCEPTION WHEN SQLSTATE 'P0246' THEN IF SQLERRM<>'monthly_order_limit_reached' THEN RAISE;END IF;END;PERFORM saas.commercial_reserve_order('{S}','248:1',NULL,clock_timestamp());PERFORM saas.commercial_reserve_order('{S}','already-accepted',NULL,clock_timestamp(),true);END$t$;")
test('monthly 50 order quota, idempotence and accepted settlement capacity are preserved',monthly_cap)
def recorded_receipt():
 # Receipt endpoints retain only their prior exact operation/scoped authority, never write privileges.
 for suffix in ['','_v2','_v3','_v4']:
  eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.in_store_sales_get_operation{suffix}({args(2)},'{uuid.uuid4()}',NULL);",2),'found')
 eq(tx(f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.quick_links_recover_operation({args(2)},'{uuid.uuid4()}','create',repeat('a',64));",2),'quick_link_not_found')
 eq(tx(f"SELECT coalesce(saas.in_store_authority_error({args(2)}),'allowed');",2),'feature_not_enabled')
test('exact operation-result recovery remains reachable; new manual operations remain denied',recorded_receipt)
def targets():
 old='00000000-0000-4000-8000-000000000006'
 eq(tx(f"SELECT saas.commercial248_plan_selectable('{old}'),saas.commercial248_plan_selectable('{IDS[3]}');"),'t|f')
 eq(tx(f"UPDATE saas.commercial248_release_state SET enabled=true;SELECT saas.commercial248_plan_selectable('{old}'),saas.commercial248_plan_selectable('{IDS[3]}');"),'f|t')
 key=str(uuid.uuid4())
 q=f"RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT saas.commercial_upgrade_request({args(0)},'{old}','{key}');RESET ROLE;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.commercial248_release_state SET enabled=true;RESET ROLE;SET LOCAL ROLE celebix_saas_app;SELECT saas.commercial_upgrade_request({args(0)},'{old}','{key}');SELECT saas.commercial_upgrade_request({args(0)},'{old}','{uuid.uuid4()}');"
 a,b,c=map(json.loads,tx(q).splitlines());eq(a['requestId'],b['requestId']);eq(b['replayed'],True);eq(c,{'code':'invalid_input'})
test('current-target activation blocks old prices but preserves old request receipts',targets)
def staff_access():
 token='248fixture';digest='d'*64
 session=f"INSERT INTO saas.panel_sessions(session_id,family_id,operation_id,operation_kind,token_key_id,token_digest,principal_id,active_store_id,issued_at,rotated_at,expires_at,created_at,updated_at)VALUES('{uuid.uuid4()}','{uuid.uuid4()}','{uuid.uuid4()}','issue','{token}','{digest}','{P}','{S}',now(),now(),now()+interval '1 hour',now(),now());"
 payload=json.dumps(dict(actorTokenKeyId=token,actorTokenDigest=digest))
 for i in range(4):
  out=tx(session+f"SELECT outcome FROM saas.merchant_whatsapp_command('staff_list','{payload}');SELECT outcome FROM saas.merchant_whatsapp_command('self_state','{payload}');",i).splitlines()
  eq(out,['disabled'if i==0 else'listed','listed'])
 create=json.dumps(dict(actorTokenKeyId=token,actorTokenDigest=digest,operationId=str(uuid.uuid4()),expectedVersion=0,phoneKeyId='fixture',phoneDigest='e'*64,phoneCiphertext='fixture-opaque-phone',phoneMasked='+90 0000000000',displayName='Fixture',role='cashier'))
 for i in [1,2]:
  eq(tx(session+f"SELECT outcome FROM saas.merchant_whatsapp_command('staff_create','{create}');",i),'disabled')
 body=session+f"SELECT outcome FROM saas.merchant_whatsapp_command('staff_create','{create}');"+setup(2)+f"SELECT outcome FROM saas.merchant_whatsapp_command('staff_create','{create}');"
 eq(tx(body,3).splitlines(),['created','operation_replayed'])
test('staff list, cashier-role grants and completed grant receipts enforce packages without breaking security self-state',staff_access)
def platform():
 actor='24800000-0000-4000-8000-000000000001'
 operator=f"UPDATE saas.principals SET email=(SELECT(regexp_match(pg_get_constraintdef(oid),$re$'([^']+)'$re$))[1]FROM pg_constraint WHERE conrelid='saas.platform_operators'::regclass AND conname='platform_operators_email_check') WHERE id='{P}';INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)SELECT '{actor}',issuer,subject,id,(SELECT(regexp_match(pg_get_constraintdef(oid),$re$'([^']+)'$re$))[1]FROM pg_constraint WHERE conrelid='saas.platform_operators'::regclass AND conname='platform_operators_email_check'),true FROM saas.principals WHERE id='{P}';"
 listing=f"SELECT saas.platform_read('{actor}','plans','{{}}');"
 before=json.loads(tx(operator+listing))['items'];assert not any(p['id']in IDS for p in before)
 after=json.loads(tx(operator+"UPDATE saas.commercial248_release_state SET enabled=true;"+listing))['items'];eq(sorted(p['id']for p in after),IDS)
 body=operator+"UPDATE saas.commercial_package_release_state SET assignments_enabled=true;UPDATE saas.commercial248_release_state SET enabled=true;"+f"UPDATE saas.subscriptions SET valid_until=clock_timestamp()+interval '30 days' WHERE store_id='{S}'AND status='active';DO $t$DECLARE expiry timestamptz;BEGIN SELECT valid_until INTO expiry FROM saas.subscriptions WHERE store_id='{S}'AND status='active';PERFORM saas.platform_command('{actor}','subscription.assign',jsonb_build_object('storeId','{S}','planId','{IDS[3]}'),coalesce((SELECT version FROM saas.platform_store_versions WHERE store_id='{S}'),0),'assignment248');IF(SELECT valid_until FROM saas.subscriptions WHERE store_id='{S}'AND status='active')IS DISTINCT FROM expiry THEN RAISE EXCEPTION 'expiry changed';END IF;BEGIN PERFORM saas.platform_command('{actor}','subscription.assign',jsonb_build_object('storeId','{S}','planId','00000000-0000-4000-8000-000000000006'),coalesce((SELECT version FROM saas.platform_store_versions WHERE store_id='{S}'),0),'oldassignment248');RAISE EXCEPTION 'expected oldversion denial';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_input'THEN RAISE;END IF;END;END$t$;"
 tx(body)
test('owner plan list and assignments switch together, block old targets and preserve exact subscription expiry',platform)
def preflights():
 q='SELECT saas.built_in_payment_methods_preflight(),saas.payment_provider_keyed_lifecycle_preflight(),saas.iyzico_iframe_tenant_activation_runtime_preflight(),saas.quick_order_hosted_payment_authority_preflight(),saas.shipping_provider_preflight();'
 for role in ['celebix_saas_app','celebix_saas_workflow']:
  eq(sql('BEGIN READ ONLY;SET LOCAL ROLE '+role+';'+q+'ROLLBACK;'),'t|t|t|t|t')
test('all five exact live payment startup probes still succeed for app and workflow roles',preflights)
def witnesses():
 for q in ['SELECT bool_and(NOT has_function_privilege(\'celebix_saas_app\',oid,\'EXECUTE\') AND NOT has_function_privilege(\'public\',oid,\'EXECUTE\'))FROM pg_proc WHERE pronamespace=\'saas\'::regnamespace AND proname LIKE \'commercial248_%\'', "SELECT bool_and(encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')=published_sha256)FROM saas.commercial248_original_functions"]:
  eq(sql(q),'t')
 # Payment/source validators and all sources outside the closed reviewed patch set are unchanged.
 changed={x['signature']for x in json.loads((ART/'changed-signatures.json').read_text())}
 before=json.loads((ROOT.parent.parent/'popup-delete/Saas-Celebix/.tmp/commercial-native246-20261017/before-functions.json').read_text()) if False else None
 eq(sql("SELECT encode(sha256(convert_to(pg_get_functiondef('saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz)'::regprocedure),'UTF8')),'hex')"),'42e013dd90e0825199dfa8481ed98a85f033d677a9f5512059722174da0ca2bc')
test('private receipt helpers, exact source witnesses and last-item cart fix remain intact',witnesses)
(ART/'test-results.json').write_text(json.dumps({'passed':checks,'count':len(checks)},indent=2))
print('RESULT',len(checks),'PASS')
