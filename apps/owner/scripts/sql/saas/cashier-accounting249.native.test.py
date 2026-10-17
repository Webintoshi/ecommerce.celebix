"""Bounded permission249 integration tests, against a socket-only synthetic clone."""
from pathlib import Path
import hashlib,json,subprocess,uuid
ROOT=Path(__file__).resolve().parents[5];ART=ROOT/'.tmp/cashier-accounting249-20261017'
BIN='/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin/psql'
ARGS=[BIN,'-h','/tmp/celebix-c249-20261017','-p','24960','-U','postgres','-d','celebix_saas_staging_auth01','-XqAt','-v','ON_ERROR_STOP=1']
def sql(q):
 r=subprocess.run(ARGS,input=q,text=True,capture_output=True,timeout=30)
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
def eq(a,b):assert a==b,(a,b)
checks=[]
def test(label,fn):fn();checks.append(label);print('PASS',len(checks),label,flush=True)
eq(json.loads(sql("SELECT jsonb_build_object('socket',inet_server_addr() IS NULL,'port',current_setting('port')='24960','tier',current_setting('celebix.deployment_tier')='isolated_staging','path',current_setting('data_directory')='"+str(ART/'data')+"')")),dict(socket=True,port=True,tier=True,path=True))
def defaults():
 eq(sql("SELECT is_nullable||':'||column_default FROM information_schema.columns WHERE table_schema='saas' AND table_name='in_store_staff_grants' AND column_name='can_manage_accounting'"),'NO:false')
 eq(sql('SELECT count(*) FROM saas.in_store_staff_grants WHERE can_manage_accounting'),'0')
test('new accounting permission defaults false for every existing and new grant',defaults)
S='10000000-0000-4000-8000-000000000001';P='10000000-0000-4000-8000-000000000003';M='10000000-0000-4000-8000-000000000004'
CP='10000000-0000-4000-8000-000000000007';CM='10000000-0000-4000-8000-000000000008';LOC='10000000-0000-4000-8000-000000000015';C='10000000-0000-4000-8000-000000000012'
PRO='00000000-0000-4000-8000-000000000010';GROW='00000000-0000-4000-8000-000000000009'
def args(owner=False,store=S,plan=PRO,code='professional',version=2):return f"'{store}','{P if owner else CP}','{M if owner else CM}','{plan}','{code}',{version},clock_timestamp()"
def setup(manage=False,collect=True,enabled=True):return f"SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET status='active' WHERE id='{CM}';UPDATE saas.in_store_staff_grants SET can_manage_accounting={str(manage).lower()},can_collect_receivables={str(collect).lower()},enabled={str(enabled).lower()} WHERE store_id='{S}' AND membership_id='{CM}';"
def tx(q,manage=False,collect=True,enabled=True):return sql('BEGIN;'+setup(manage,collect,enabled)+q+'ROLLBACK;')
def app(q):return 'RESET ROLE;SET LOCAL ROLE celebix_saas_app;'+q
def access(**kw):return json.loads(tx(app(f"SELECT result_payload FROM saas.accounting_access_read({args()});"),**kw))
def access_matrix():
 eq(access(),dict(canManageAccounting=False,canCollectReceivables=True))
 eq(access(manage=True,collect=False),dict(canManageAccounting=True,canCollectReceivables=True))
 eq(access(manage=False,collect=False),dict(canManageAccounting=False,canCollectReceivables=False))
 eq(access(manage=True,enabled=False),dict(canManageAccounting=False,canCollectReceivables=False))
 no_grant=f"DELETE FROM saas.in_store_staff_grants WHERE store_id='{S}' AND membership_id='{CM}';"
 eq(json.loads(tx(no_grant+app(f"SELECT result_payload FROM saas.accounting_access_read({args()});"))),dict(canManageAccounting=False,canCollectReceivables=False))
 no_locations=f"UPDATE saas.in_store_staff_grants SET location_ids='{{}}' WHERE membership_id='{CM}';"
 eq(json.loads(tx(no_locations+app(f"SELECT result_payload FROM saas.accounting_access_read({args()});"),manage=True)),dict(canManageAccounting=True,canCollectReceivables=True))
test('explicit full flag, collection fallback, disabled and absent grant, no POS bootstrap requirement',access_matrix)
def scoped():
 for q,want in [(f"UPDATE saas.memberships SET status='revoked' WHERE id='{CM}';",'membership_denied'),(f"UPDATE saas.subscriptions SET plan_id='{GROW}',plan_code='growth',plan_version=2 WHERE store_id='{S}' AND status='active';",'feature_not_enabled')]:
  authority=args(plan=GROW,code='growth')if want=='feature_not_enabled'else args()
  eq(tx(q+app(f"SELECT outcome FROM saas.accounting_access_read({authority});"),manage=True),want)
 eq(tx(app(f"SELECT outcome FROM saas.accounting_access_read({args(store='24800000-0000-4000-8000-000000000003')});"),manage=True),'membership_denied')
 bad=args().replace("'"+CP+"'","'"+P+"'")
 eq(tx(app(f"SELECT outcome FROM saas.accounting_access_read({bad});"),manage=True),'membership_denied')
 eq(tx(app(f"SELECT outcome FROM saas.accounting_access_read({args(owner=True)});")),'found')
test('revoked membership, other store, forged principal and package restriction remain denied',scoped)
def families():
 calls=[('accounting_read',",'overview','{}'"),('accounting_read',",'accounts','{}'"),('accounting_read',",'expenses','{}'"),('accounting_profitability_read',",'{\"dateFrom\":\"2026-10-01\",\"dateTo\":\"2026-10-17\"}'"),('accounting_suppliers_read',",'{}',NULL"),('accounting_cash_session_list',",'7431883d-403c-5f7f-82b8-e51ec138642a'"),('accounting_schedule_list',",'{}'"),('merchant_admin_list',",'accounting_profile'"),('merchant_admin_list',",'invoice_integration'")]
 for name,tail in calls:
  statement=app(f"SELECT outcome FROM saas.{name}({args()}{tail});")
  full=tx(statement,manage=True)
  assert full in ['found','listed'],(name,full)
  off=tx(statement,collect=False)
  eq(off,'membership_denied')
 # Enabling accounting never grants any unrelated integration or settings family.
 for kind in ['marketplace_connection','ai_setting','payment_setting','seo_geo_profile']:
  eq(tx(app(f"SELECT outcome FROM saas.merchant_admin_list({args()},'{kind}');"),manage=True),'membership_denied')
test('all accounting read families and both accounting metadata kinds use the scoped grant only',families)
def staff_atomic():
 operation=str(uuid.uuid4());finger='a'*64
 params=f"'{operation}','{finger}','{CM}',1,true,ARRAY['{LOC}'::uuid],0,false,false,false,true"
 command=f"SELECT outcome||':'||(result_payload->>'canManageAccounting') FROM saas.in_store_sales_set_staff_v5({args(owner=True)},{params});"
 replay=f"SELECT outcome||':'||(result_payload->>'canManageAccounting') FROM saas.in_store_sales_recover_staff_v5({args(owner=True)},'{operation}','{finger}');"
 q=app(command+command+replay+f"SELECT outcome FROM saas.in_store_sales_recover_staff_v4({args(owner=True)},'{operation}','{finger}');")
 eq(tx(q).splitlines(),['committed:true','operation_replayed:true','found:true','operation_mismatch'])
 eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v5({args()},{params});"),manage=True),'membership_denied')
 changed=params.replace("'"+finger+"'","'"+'b'*64+"'").replace(',false,true',',false,false')
 eq(tx(app(command+f"SELECT outcome FROM saas.in_store_sales_set_staff_v5({args(owner=True)},{changed});")).splitlines(),['committed:true','operation_mismatch'])
 # Optimistic version conflict writes neither the flag nor a receipt.
 conflict=params.replace(f"'{CM}',1,true",f"'{CM}',99,true")
 eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v5({args(owner=True)},{conflict});")),'version_conflict')
 # A true flag is valid only for a real cashier in this store; role cannot be widened by payload.
 notcashier=params.replace("'"+CM+"',1", "'"+M+"',0")
 eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v5({args(owner=True)},{notcashier});")),'invalid_input')
 nullflag=params[:-4]+'NULL'
 eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v5({args(owner=True)},{nullflag});")),'invalid_input')
test('one staff save is atomic, versioned, replayable, role-safe and isolated from old receipt DTOs',staff_atomic)
def staff_manager_and_receipts():
 ep='10000000-0000-4000-8000-000000000009';em='10000000-0000-4000-8000-000000000010'
 operator=args(owner=True).replace(P,ep).replace(M,em)
 operation=str(uuid.uuid4());nextop=str(uuid.uuid4());finger='9'*64
 enabled=f"'{operation}','{finger}','{CM}',1,true,ARRAY['{LOC}'::uuid],0,false,false,false,true"
 disabled=f"'{nextop}',repeat('0',64),'{CM}',2,true,ARRAY['{LOC}'::uuid],0,false,false,false,false"
 admin=f"UPDATE saas.memberships SET role='admin',status='active' WHERE id='{em}';"
 commands=app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v5({operator},{enabled});SELECT outcome FROM saas.in_store_sales_set_staff_v5({operator},{disabled});SELECT result_payload->>'canManageAccounting' FROM saas.in_store_sales_recover_staff_v5({operator},'{operation}','{finger}');")
 eq(tx(admin+commands).splitlines(),['committed','committed','true'])
 # Recorded permission result survives a package change, without granting new accounting access.
 saved=app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v5({args(owner=True)},{enabled});")
 switch=f"RESET ROLE;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.subscriptions SET plan_id='{GROW}',plan_code='growth',plan_version=2 WHERE store_id='{S}' AND status='active';"
 receipt=app(f"SELECT outcome FROM saas.in_store_sales_recover_staff_v5({args(owner=True,plan=GROW,code='growth')},'{operation}','{finger}');SELECT outcome FROM saas.accounting_access_read({args(plan=GROW,code='growth')});")
 eq(tx(saved+switch+receipt).splitlines(),['committed','found','feature_not_enabled'])
test('owner/admin can grant and revoke; frozen permission receipts survive later edits and package transitions',staff_manager_and_receipts)
def old_contracts():
 for version,suffix,extra in [(1,'',''),(2,'_v2',',false'),(3,'_v3',',false,false,true'),(4,'_v4',',false,false,true')]:
  operation=str(uuid.uuid4());finger='c'*64
  call=f"SELECT outcome FROM saas.in_store_sales_set_staff{suffix}({args(owner=True)},'{operation}','{finger}','{CM}',1,true,ARRAY['{LOC}'::uuid],0{extra});"
  out=tx(app(call+f"SELECT result_payload?'canManageAccounting' FROM saas.in_store_sales_recover_staff{suffix}({args(owner=True)},'{operation}','{finger}');")+f"RESET ROLE;SET LOCAL ROLE celebix_saas_owner;SELECT can_manage_accounting FROM saas.in_store_staff_grants WHERE membership_id='{CM}';",manage=True)
  eq(out.splitlines(),['committed','f','t'])
  listed=json.loads(tx(app(f"SELECT result_payload FROM saas.in_store_sales_list_staff{suffix}({args(owner=True)});"),manage=True))
  assert all('canManageAccounting'not in x for x in listed['staff'])
test('old staff versions 1–4 keep their exact DTOs and preserve the new flag on writes',old_contracts)
def save_and_recover():
 operation=str(uuid.uuid4());body=json.dumps(dict(name='Isolated cash',type='cash',currency='TRY'))
 call=f"SELECT outcome||':'||(result_payload->'account'IS NOT NULL AND result_payload->'account'<>'null'::jsonb)::text FROM saas.accounting_mutate({args()},'{operation}',repeat('d',64),'saveAccount','{body}');"
 recover=f"SELECT outcome||coalesce(':'||(result_payload->>'replayed'),'') FROM saas.accounting_get_operation({args()},'{operation}',repeat('d',64));"
 eq(tx(app(call+recover),manage=True).splitlines(),['committed:true','found:true'])
 eq(tx(app(call),collect=False),'membership_denied:false')
 q=app(call)+f"RESET ROLE;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.in_store_staff_grants SET can_manage_accounting=false WHERE membership_id='{CM}';"+app(recover)
 eq(tx(q,manage=True).splitlines(),['committed:true','membership_denied'])
test('full grant creates account and recovers its own noncollection receipt; revocation is immediate',save_and_recover)
def discounted_collection():
 # 2,400 debt, 2,000 real receipt, 400 discount; only the received amount enters cash.
 opening=str(uuid.uuid4());collect=str(uuid.uuid4())
 debt=f"jsonb_build_object('customerId','{C}','amountCents',240000,'currency','TRY','occurredOn','2026-10-16','note','Isolated debt','expectedVersion',current_setting('fixture.customer.version')::bigint)"
 payment=f"jsonb_build_object('customerId','{C}','orderId',NULL,'amountCents',200000,'discountCents',40000,'currency','TRY','paymentMethod','cash','accountId',NULL,'expectedVersion',current_setting('fixture.customer.version')::bigint+1,'note','Isolated payment')"
 q=f"UPDATE saas.accounting_release_state SET collection_discounts_enabled=true;DO $x$BEGIN PERFORM set_config('fixture.customer.version',coalesce((SELECT version FROM saas.accounting_customer_versions WHERE store_id='{S}' AND customer_id='{C}' AND currency='TRY'),0)::text,true);END$x$;"+app(f"SELECT outcome FROM saas.accounting_mutate({args()},'{opening}',repeat('e',64),'openingDebt',{debt});SELECT outcome||':'||(result_payload->'account'<>'null'::jsonb)::text FROM saas.accounting_mutate({args()},'{collect}',repeat('f',64),'collect',{payment});")
 q+=f"RESET ROLE;SET LOCAL ROLE celebix_saas_owner;SELECT sum(amount_cents)FILTER(WHERE kind='collection')||':'||max(metadata->>'discountCents')FROM saas.accounting_events WHERE operation_id='{collect}';"
 eq(tx(q,manage=True,collect=False).splitlines(),['committed','committed:true','200000:40000'])
 # Existing collection-only cashier still cannot apply a discount.
 eq(tx("DO $x$BEGIN PERFORM set_config('fixture.customer.version','0',true);END$x$;"+app(f"SELECT outcome FROM saas.accounting_mutate({args()},'{collect}',repeat('f',64),'collect',{payment});")),'membership_denied')
test('discounted collection accounts for received money separately and keeps the collection-only restriction',discounted_collection)
def other_mutation_families():
 supplier=str(uuid.uuid4());supplier_body=json.dumps(dict(supplierName='Synthetic supplier',currency='TRY',amountCents=1000,occurredOn='2026-10-16',dueOn=None,documentNumber=None,note='Synthetic only'))
 supplier_call=f"SELECT outcome FROM saas.accounting_suppliers_mutate({args()},'{supplier}',repeat('4',64),'createDebt','{supplier_body}');"
 supplier_receipt=f"SELECT outcome FROM saas.accounting_suppliers_get_operation({args()},'{supplier}',repeat('4',64));"
 eq(tx(app(supplier_call+supplier_receipt),manage=True).splitlines(),['committed','found'])
 eq(tx(app(supplier_call)),'membership_denied')
 account_op=str(uuid.uuid4());opening=str(uuid.uuid4());closing=str(uuid.uuid4())
 newaccount=f"SELECT outcome FROM saas.accounting_mutate({args()},'{account_op}',repeat('5',64),'saveAccount','{{\"name\":\"Counting fixture\",\"type\":\"cash\",\"currency\":\"TRY\"}}');"
 config=f"DO $x$BEGIN PERFORM set_config('fixture.account.id',saas.inventory_deterministic_uuid('accounting','saas.accounting.account:{account_op}')::text,true);END$x$;"
 opencall=f"SELECT outcome FROM saas.accounting_cash_session_mutate({args()},'{opening}',repeat('6',64),'open',jsonb_build_object('accountId',current_setting('fixture.account.id'),'expectedVersion',1,'expectedLastSessionId',NULL,'countedCents',0,'note',NULL));"
 closecall=f"SELECT outcome FROM saas.accounting_cash_session_mutate({args()},'{closing}',repeat('7',64),'close',jsonb_build_object('accountId',current_setting('fixture.account.id'),'sessionId','{opening}','expectedVersion',1,'countedCents',0,'note',NULL));"
 receipt=f"SELECT outcome FROM saas.accounting_cash_session_get_operation({args()},'{closing}',repeat('7',64));"
 eq(tx(config+app(newaccount+opencall+closecall+receipt),manage=True).splitlines(),['committed','committed','committed','found'])
 eq(tx(config+app(opencall)),'membership_denied')
 receivable=str(uuid.uuid4());operation=str(uuid.uuid4())
 debt=f"INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,channel,currency,sale_cents,occurred_at)VALUES('{receivable}','{S}','{C}','{{\"name\":\"Synthetic schedule\"}}','POS','TRY',1000,clock_timestamp());"
 body=json.dumps(dict(receivableId=receivable,expectedVersion=1,installments=[dict(dueDate='2026-11-01',amountCents=1000)]))
 command=f"SELECT outcome FROM saas.accounting_schedule_mutate({args()},'{operation}',repeat('8',64),'{body}');"
 receipt=f"SELECT outcome FROM saas.accounting_schedule_get_operation({args()},'{operation}',repeat('8',64));"
 eq(tx(debt+app(command+receipt),manage=True).splitlines(),['committed','found'])
 eq(tx(debt+app(command)),'membership_denied')
test('supplier debt, cash opening/closing and payment schedule writes and receipts follow the same permission',other_mutation_families)
PROFILE='24900000-0000-4000-8000-000000000101';OTHER_PROFILE='24900000-0000-4000-8000-000000000102';FOREIGN_PROFILE='24900000-0000-4000-8000-000000000103';RECORD='24900000-0000-4000-8000-000000000201';JOB='24900000-0000-4000-8000-000000000301'
def provider_fixture():
 envelope=json.dumps(dict(algorithm='A256GCM',ciphertext='AA',iv='A'*16,keyId='fixture',tag='A'*22,version=1))
 q="INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,created_at)VALUES('fixture_invoice','invoice_reconciliation',true,clock_timestamp()),('fixture_market','marketplace_sync',true,clock_timestamp());"
 for pid,store,provider,capability in [(PROFILE,S,'fixture_invoice','invoice_reconciliation'),(OTHER_PROFILE,S,'fixture_market','marketplace_sync'),(FOREIGN_PROFILE,'24800000-0000-4000-8000-000000000003','fixture_invoice','invoice_reconciliation')]:
  q+=f"INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,created_at,updated_at)VALUES('{pid}','{store}','{provider}','{capability}','{{}}','Synthetic only','{envelope}',repeat('a',64),'fixture',1,1,'active',1,clock_timestamp(),clock_timestamp());"
 q+=f"INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)VALUES('{RECORD}','{S}','invoice_integration','Synthetic invoice','{{\"provider\":\"fixture_invoice\",\"accountReference\":\"fixture\",\"enabled\":true}}','active',1,clock_timestamp(),clock_timestamp());"
 q+=f"INSERT INTO saas.merchant_provider_jobs(id,store_id,record_id,record_kind,action_kind,status,version,requested_at,updated_at)VALUES('{JOB}','{S}','{RECORD}','invoice_integration','reconciliation','awaiting_provider_activation',1,clock_timestamp(),clock_timestamp());"
 return q

def invoice_scope():
 query=app(f"SELECT result_payload FROM saas.accounting_invoice_profiles_read({args()},NULL);")
 result=json.loads(tx(provider_fixture()+query,manage=True));eq([x['id']for x in result['items']],[PROFILE])
 assert not any(k in result['items'][0]for k in ['sealedCredentials','credentialDigest','credentialKeyId'])
 eq(tx(provider_fixture()+app(f"SELECT outcome FROM saas.accounting_invoice_profiles_read({args()},NULL);")),'membership_denied')
 # The global list and all credential profile helpers remain restricted.
 eq(tx(provider_fixture()+app(f"SELECT outcome FROM saas.merchant_provider_profile_list({args()},NULL);"),manage=True),'membership_denied')
 eq(tx(provider_fixture()+app(f"SELECT outcome FROM saas.accounting_invoice_profiles_read({args()},'bogus');"),manage=True),'invalid_input')
 operation=str(uuid.uuid4());finger='1'*64
 queue=f"SELECT outcome FROM saas.merchant_provider_queue({args()},'{operation}','{finger}','{JOB}',1,'{PROFILE}',1);"
 recover=f"SELECT outcome FROM saas.merchant_provider_recover_operation({args()},'{operation}','{finger}');"
 eq(tx(provider_fixture()+app(queue+recover),manage=True).splitlines(),['queued','operation_replayed'])
 eq(tx(provider_fixture()+app(queue)),'membership_denied')
 for profile,want in [(OTHER_PROFILE,'provider_capability_mismatch'),(FOREIGN_PROFILE,'profile_not_found')]:
  eq(tx(provider_fixture()+app(queue.replace(PROFILE,profile)),manage=True),want)
 # Revocation is rechecked even for a completed queue receipt.
 q=provider_fixture()+app(queue)+f"RESET ROLE;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.in_store_staff_grants SET can_manage_accounting=false WHERE membership_id='{CM}';"+app(recover)
 eq(tx(q,manage=True).splitlines(),['queued','membership_denied'])
 # Prepare, list, cancel use the same narrow accounting kind authority.
 prepare=f"SELECT outcome FROM saas.merchant_provider_prepare({args()},'{uuid.uuid4()}',repeat('2',64),'{uuid.uuid4()}','{RECORD}',1,'invoice_integration');"
 cancel=f"SELECT outcome FROM saas.merchant_provider_cancel({args()},'{uuid.uuid4()}',repeat('3',64),'{JOB}',1,'invoice_integration');"
 listing=f"SELECT outcome FROM saas.merchant_provider_list({args()},'invoice_integration');"
 eq(tx(provider_fixture().split('INSERT INTO saas.merchant_provider_jobs',1)[0]+app(prepare+listing),manage=True).splitlines(),['prepared','listed'])
 eq(tx(provider_fixture()+app(cancel),manage=True),'cancelled')
test('invoice profiles, prepare/list/queue/cancel and ambiguous-commit recovery stay isolated to accounting',invoice_scope)
def source_and_acl():
 before=json.loads((ART/'all-functions-before.json').read_text())
 changed={x['signature']for x in json.loads(sql("SELECT jsonb_agg(jsonb_build_object('signature',signature))FROM saas.accounting249_original_functions"))}
 after=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'sha256',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),'owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'security',prosecdef,'volatility',provolatile,'strict',proisstrict,'parallel',proparallel)ORDER BY oid::regprocedure::text)FROM pg_proc WHERE pronamespace='saas'::regnamespace AND prokind='f'"))
 actual={x['signature']:x for x in after}
 eq(len(before),1874);eq(len(after),1882);eq(len(changed),5)
 for old in before:
  if old['signature']in changed:continue
  value=actual[old['signature']]
  eq({k:v for k,v in old.items()if k!='oid'},value)
 private=['accounting249_base_authority_error','accounting249_can_manage','in_store_staff_projection_v5']
 eq(sql("SELECT bool_and(NOT has_function_privilege('celebix_saas_app',oid,'EXECUTE') AND NOT has_function_privilege('public',oid,'EXECUTE'))FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname=ANY(ARRAY["+','.join("'"+x+"'"for x in private)+"]);"),'t')
 eq(sql("SELECT has_table_privilege('celebix_saas_app','saas.in_store_staff_grants','UPDATE'),has_table_privilege('celebix_saas_app','saas.accounting249_original_functions','SELECT')"),'f|f')
 for role in ['celebix_saas_app','celebix_saas_workflow']:
  eq(sql("BEGIN READ ONLY;SET LOCAL ROLE "+role+";SELECT saas.built_in_payment_methods_preflight(),saas.payment_provider_keyed_lifecycle_preflight(),saas.iyzico_iframe_tenant_activation_runtime_preflight(),saas.quick_order_hosted_payment_authority_preflight(),saas.shipping_provider_preflight();ROLLBACK;"),'t|t|t|t|t')
 (ART/'unrelated-functions-proof.json').write_text(json.dumps(dict(before=len(before),after=len(after),changed=sorted(changed),unchanged=len(before)-len(changed),new=len(after)-len(before),preflights=True),indent=2))
test('exactly five source changes and eight new functions; all unrelated sources/ACLs/payment probes unchanged',source_and_acl)
def rollback_guard():
 down=(ROOT/'apps/owner/scripts/sql/saas/202610170249_cashier_accounting.down.sql').read_text()
 injected=down.replace('LOCK TABLE',f"UPDATE saas.in_store_staff_grants SET can_manage_accounting=true WHERE membership_id='{CM}';LOCK TABLE",1)
 r=subprocess.run(ARGS,input=injected,text=True,capture_output=True,timeout=30)
 assert r.returncode!=0 and 'ACCOUNTING249_ROLLBACK_IN_USE'in r.stderr,r.stderr
 eq(sql('SELECT count(*) FROM saas.in_store_staff_grants WHERE can_manage_accounting'),'0')
 eq(sql("SELECT count(*) FROM saas.accounting249_original_functions"),'5')
test('rollback refuses an enabled full-accounting grant and leaves its schema and authority intact',rollback_guard)
(ART/'test-results.json').write_text(json.dumps({'passed':checks,'count':len(checks)},indent=2))
print('RESULT',len(checks),'PASS')
