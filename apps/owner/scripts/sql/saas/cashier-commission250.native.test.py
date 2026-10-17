"""Prospective cashier commission checks on a socket-only synthetic clone."""
from pathlib import Path
import hashlib,json,subprocess,uuid
ROOT=Path(__file__).resolve().parents[5];ART=ROOT/'.tmp/cashier-commission250-20261017'
BIN='/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin/psql'
ARGS=[BIN,'-h','/tmp/celebix-c250-20261017','-p','25060','-U','postgres','-d','celebix_saas_staging_auth01','-XqAt','-v','ON_ERROR_STOP=1']
def sql(q):
 r=subprocess.run(ARGS,input=q,text=True,capture_output=True,timeout=30)
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
def eq(a,b):assert a==b,(a,b)
checks=[]
def test(label,fn):fn();checks.append(label);print('PASS',len(checks),label,flush=True)
eq(json.loads(sql("SELECT jsonb_build_object('socket',inet_server_addr() IS NULL,'port',current_setting('port')='25060','tier',current_setting('celebix.deployment_tier')='isolated_staging','path',current_setting('data_directory')='"+str(ART/'data')+"')")),dict(socket=True,port=True,tier=True,path=True))
def defaults():
 eq(sql("SELECT string_agg(column_name||':'||is_nullable||':'||column_default,','ORDER BY column_name)FROM information_schema.columns WHERE table_schema='saas'AND table_name='in_store_staff_grants'AND column_name IN('commission_enabled','commission_rate_bps')"),'commission_enabled:NO:false,commission_rate_bps:NO:0')
 eq(sql('SELECT count(*)FROM saas.in_store_staff_grants WHERE commission_enabled'),'0')
 eq(sql('SELECT count(*)FROM saas.accounting_cashier_commission_sales'),'0')
test('commission is opt-in, rate defaults zero, and no completed historical sale is backfilled',defaults)
S='10000000-0000-4000-8000-000000000001';P='10000000-0000-4000-8000-000000000003';M='10000000-0000-4000-8000-000000000004'
CP='10000000-0000-4000-8000-000000000007';CM='10000000-0000-4000-8000-000000000008';LOC='10000000-0000-4000-8000-000000000015';C='10000000-0000-4000-8000-000000000012';PRO='00000000-0000-4000-8000-000000000010';GROW='00000000-0000-4000-8000-000000000009';V='0d06b0e2-fd8e-5ce0-82f6-6ae0318fca70';PRODUCT='6cde4ad1-d930-58f3-8703-078a95f93dda'
def args(owner=False,store=S,plan=PRO,code='professional'):return f"'{store}','{P if owner else CP}','{M if owner else CM}','{plan}','{code}',2,clock_timestamp()"
def owner(q):return 'RESET ROLE;SET LOCAL ROLE celebix_saas_owner;'+q
def app(q):return 'RESET ROLE;SET LOCAL ROLE celebix_saas_app;'+q
def setup():return owner(f"UPDATE saas.memberships SET status='active'WHERE id='{CM}';UPDATE saas.in_store_staff_grants SET can_sell_on_credit=true,commission_enabled=true,commission_rate_bps=1000,discount_limit_bps=5000 WHERE membership_id='{CM}';UPDATE saas.accounting_release_state SET credit_sales_enabled=true,collection_discounts_enabled=true;UPDATE saas.products SET status='active',archived_at=NULL WHERE id='{PRODUCT}';UPDATE saas.product_variants SET status='active',archived_at=NULL,price_cents=10000 WHERE id='{V}';")
def tx(q):return sql('BEGIN;'+setup()+q+'ROLLBACK;')
def uid():return str(uuid.uuid4())
def report(auth=None,filters=None):return app(f"SELECT row_to_json(r)FROM saas.accounting_commissions_read({auth or args(True)},'{json.dumps(filters or dict(dateFrom='2026-10-17',dateTo='2026-10-17'))}')r;")
def staff():
 op=uid();fp='a'*64
 params=f"'{op}','{fp}','{CM}',1,true,ARRAY['{LOC}'::uuid],1000,false,true,true,false,true,2050"
 command=app(f"SELECT outcome||':'||(result_payload->>'commissionEnabled')||':'||(result_payload->>'commissionRateBps')FROM saas.in_store_sales_set_staff_v6({args(True)},{params});")
 recovery=app(f"SELECT outcome||':'||(result_payload->>'commissionRateBps')FROM saas.in_store_sales_recover_staff_v6({args(True)},'{op}','{fp}');SELECT outcome FROM saas.in_store_sales_recover_staff_v5({args(True)},'{op}','{fp}');")
 eq(tx(command+command+recovery).splitlines(),['committed:true:2050','operation_replayed:true:2050','found:2050','operation_mismatch'])
 eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v6({args()},{params});")),'membership_denied')
 for bad in [params[:-4]+'0',params[:-4]+'10001',params.replace(',true,2050',',NULL,2050')]:eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v6({args(True)},{bad});")),'invalid_input')
 notcashier=params.replace("'"+CM+"',1", "'"+M+"',0")
 eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v6({args(True)},{notcashier});")),'invalid_input')
 changed=params.replace(fp,'b'*64).replace(',true,2050',',true,3000')
 eq(tx(command+app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v6({args(True)},{changed});")).splitlines(),['committed:true:2050','operation_mismatch'])
 eq(tx(app(f"SELECT outcome FROM saas.in_store_sales_set_staff_v6({args(True)},{params.replace(','+str(1)+',true,',',99,true,')});")),'version_conflict')
test('staff V6 is one versioned atomic save, isolated replay, strict rate and role authority',staff)
def old_contracts():
 for version,suffix,extra in [(1,'',''),(2,'_v2',',false'),(3,'_v3',',false,false,true'),(4,'_v4',',false,false,true'),(5,'_v5',',false,false,true,false')]:
  op=uid();call=app(f"SELECT outcome FROM saas.in_store_sales_set_staff{suffix}({args(True)},'{op}',repeat('c',64),'{CM}',1,true,ARRAY['{LOC}'::uuid],0{extra});SELECT (result_payload?'commissionEnabled')OR(result_payload?'commissionRateBps') FROM saas.in_store_sales_recover_staff{suffix}({args(True)},'{op}',repeat('c',64));")
  result=tx(call+owner(f"SELECT commission_enabled||':'||commission_rate_bps FROM saas.in_store_staff_grants WHERE membership_id='{CM}';"))
  eq(result.splitlines(),['committed','f','true:1000'])
  listing=json.loads(tx(app(f"SELECT result_payload FROM saas.in_store_sales_list_staff{suffix}({args(True)});")))
  assert all('commissionEnabled'not in x and 'commissionRateBps'not in x for x in listing['staff'])
test('staff V1–V5 DTOs and receipts stay exact; older saves preserve both commission fields',old_contracts)
def authority():
 for change,auth,want in [('',args(),'membership_denied'),(f"UPDATE saas.in_store_staff_grants SET can_manage_accounting=true WHERE membership_id='{CM}';",args(),'membership_denied'),(f"UPDATE saas.memberships SET role='store_owner',status='active'WHERE id='10000000-0000-4000-8000-000000000010';UPDATE saas.memberships SET status='revoked' WHERE id='{M}';",args(True),'membership_denied'),('',args(True,store='24800000-0000-4000-8000-000000000003'),'membership_denied'),('',args(True).replace(P,CP),'membership_denied'),(f"UPDATE saas.subscriptions SET plan_id='{GROW}',plan_code='growth',plan_version=2 WHERE store_id='{S}'AND status='active';",args(True,plan=GROW,code='growth'),'feature_not_enabled')]:
  eq(json.loads(tx(owner(change)+report(auth)))['outcome'],want)
 for filters in [dict(dateFrom='2026-02-30',dateTo='2026-03-01'),dict(dateFrom='2026-10-18',dateTo='2026-10-17'),dict(dateFrom='2025-01-01',dateTo='2026-01-02'),dict(dateFrom='2026-10-17',dateTo='2026-10-17',membershipId=CM),dict(dateFrom=10,dateTo='2026-10-17')]:eq(json.loads(tx(report(filters=filters)))['outcome'],'invalid_input')
 eq(json.loads(tx(report(filters=dict(dateFrom='2025-10-18',dateTo='2026-10-18'))))['outcome'],'found')
test('commission report stays manager-only, package-bound and limited to validated local dates',authority)
def create(sale,discount=None,price=10000):
 intent=json.dumps(dict(locationId=LOC,items=[dict(variantId=V,quantity=1,unitPriceOverrideCents=None)],discount=discount,customerName=None,note=None,paymentMethod=None,customerId=C,initialCollectionCents=0,dueDate=None))
 return owner(f"UPDATE saas.product_variants SET price_cents={price} WHERE id='{V}';")+app(f"SELECT outcome FROM saas.in_store_sales_create_v3({args()},'{uid()}',repeat('a',64),'{sale}','{intent}');")
def prepare(sale,total=10000):return app(f"SELECT outcome FROM saas.in_store_sales_prepare_v3({args()},'{uid()}',repeat('b',64),'{sale}',1,{total});")
def complete(sale,version=2,op=None):return app(f"SELECT outcome FROM saas.in_store_sales_complete_v3({args(True)},'{op or uid()}',repeat('c',64),'{sale}',{version});")
def completion():
 sale=uid();op=uid();q=create(sale,dict(kind='fixed_amount',amountCents=1000))+prepare(sale,9000)
 q+=owner("SELECT count(*)FROM saas.accounting_cashier_commission_sales;")
 q+=owner(f"UPDATE saas.in_store_staff_grants SET commission_rate_bps=2000 WHERE membership_id='{CM}';")
 q+=app(f"SELECT outcome FROM saas.in_store_sales_takeover_v3({args(True)},'{uid()}',repeat('d',64),'{sale}',2);")+complete(sale,3,op)+complete(sale,3,op)
 q+=owner("SELECT membership_id||':'||rate_bps||':'||merchandise_cents||':'||shipping_cents FROM saas.accounting_cashier_commission_sales;")
 q+=owner(f"UPDATE saas.in_store_staff_grants SET commission_rate_bps=9999,commission_enabled=false WHERE membership_id='{CM}';")+report()
 out=tx(q).splitlines();eq(out[:7],['committed','committed','0','committed','committed','operation_replayed',CM+':2000:9000:0'])
 result=json.loads(out[7])['result_payload'];eq(result['totals']['earnedCommissionCents'],1800);eq(result['totals']['completedSaleCount'],1)
 eq(result['rows'][0]['commissionEnabled'],False)
 # Enabling later never backfills an earlier completed sale.
 sale=uid();q=owner(f"UPDATE saas.in_store_staff_grants SET commission_enabled=false WHERE membership_id='{CM}';")+create(sale)+prepare(sale)+complete(sale)+owner(f"UPDATE saas.in_store_staff_grants SET commission_enabled=true WHERE membership_id='{CM}';SELECT count(*)FROM saas.accounting_cashier_commission_sales;")
 eq(tx(q).splitlines(),['committed','committed','committed','0'])
test('actual credit completion freezes original cashier and then-current rate once; takeover, replay and later changes cannot recalculate',completion)
def absent_eligibility():
 for change in [f"UPDATE saas.in_store_staff_grants SET enabled=false WHERE membership_id='{CM}';",f"UPDATE saas.memberships SET status='revoked' WHERE id='{CM}';",f"DELETE FROM saas.in_store_staff_grants WHERE membership_id='{CM}';"]:
  sale=uid();q=create(sale)+prepare(sale)+owner(change)+complete(sale)+owner('SELECT count(*)FROM saas.accounting_cashier_commission_sales;')
  eq(tx(q).splitlines(),['committed','committed','committed','0'])
 sale=uid();q=create(sale)+app(f"SELECT outcome FROM saas.in_store_sales_cancel_v3({args()},'{uid()}',repeat('d',64),'{sale}',1,true);")+owner('SELECT count(*)FROM saas.accounting_cashier_commission_sales;')
 eq(tx(q).splitlines(),['committed','committed','0'])
test('missing, revoked or disabled seller eligibility does not block manager settlement; canceled drafts earn nothing',absent_eligibility)
def ledger_args(sale):return owner(f"SELECT set_config('fixture.order',(SELECT order_reference_id::text FROM saas.accounting_cashier_commission_sales WHERE sale_id='{sale}'),true)IS NOT NULL;SELECT set_config('fixture.receivable',(SELECT receivable_id::text FROM saas.accounting_cashier_commission_sales WHERE sale_id='{sale}'),true)IS NOT NULL;")
def return_credit(amount,op=None):
 return owner(f"SELECT set_config('fixture.rv',(SELECT version::text FROM saas.accounting_receivables WHERE id=current_setting('fixture.receivable')::uuid),true)IS NOT NULL;")+app(f"SELECT outcome FROM saas.accounting_mutate({args(True)},'{op or uid()}',repeat('a',64),'returnCredit',jsonb_build_object('orderId',current_setting('fixture.order'),'amountCents',{amount},'reason','Synthetic return','expectedVersion',current_setting('fixture.rv')::bigint));")
def adjustments():
 sale=uid();q=create(sale)+prepare(sale)+complete(sale)+ledger_args(sale)+return_credit(1000)
 q+=owner(f"SELECT set_config('fixture.cv',(SELECT version::text FROM saas.accounting_customer_versions WHERE store_id='{S}'AND customer_id='{C}'AND currency='TRY'),true)IS NOT NULL;")
 q+=app(f"SELECT outcome FROM saas.accounting_mutate({args(True)},'{uid()}',repeat('b',64),'collect',jsonb_build_object('customerId','{C}','orderId',current_setting('fixture.order'),'amountCents',8000,'discountCents',1000,'currency','TRY','paymentMethod','cash','accountId',NULL,'expectedVersion',current_setting('fixture.cv')::bigint,'note','Synthetic discounted collection'));")+report()
 q+=return_credit(2000)+report()
 q+=owner("SELECT set_config('fixture.rv',(SELECT version::text FROM saas.accounting_receivables WHERE id=current_setting('fixture.receivable')::uuid),true)IS NOT NULL;")
 q+=app(f"SELECT outcome FROM saas.accounting_mutate({args(True)},'{uid()}',repeat('c',64),'refund',jsonb_build_object('orderId',current_setting('fixture.order'),'accountId','7431883d-403c-5f7f-82b8-e51ec138642a','amountCents',2000,'paymentMethod','cash','reason','Synthetic refund','expectedVersion',current_setting('fixture.rv')::bigint));")+report()
 out=tx(q).splitlines();reports=[json.loads(l)['result_payload']for l in out if l.startswith('{')];assert not any(l not in ['committed','t']and not l.startswith('{')for l in out),out
 eq([r['totals']['earnedCommissionCents']for r in reports],[800,600,600])
 eq(reports[-1]['totals']['collectionDiscountCents'],1000);eq(reports[-1]['totals']['returnAdjustmentCents'],3000)
test('native returns and late collection discount reduce net commission once; refunding that return does not double-cut it',adjustments)
def reversed_return():
 sale=uid();op=uid();q=create(sale)+prepare(sale)+complete(sale)+ledger_args(sale)+return_credit(2000,op)+report()
 q+=owner(f"SELECT set_config('fixture.cv',(SELECT version::text FROM saas.accounting_customer_versions WHERE store_id='{S}'AND customer_id='{C}'AND currency='TRY'),true)IS NOT NULL;SELECT set_config('fixture.event',(SELECT id::text FROM saas.accounting_events WHERE operation_id='{op}'AND kind='return_credit'),true)IS NOT NULL;")
 q+=app(f"SELECT outcome FROM saas.accounting_mutate({args(True)},'{uid()}',repeat('d',64),'reverse',jsonb_build_object('eventId',current_setting('fixture.event'),'reason','Synthetic correction','expectedVersion',current_setting('fixture.cv')::bigint));")+report()
 out=tx(q).splitlines();assert all(l in ['committed','t']or l.startswith('{')for l in out),out
 eq([json.loads(l)['result_payload']['totals']['earnedCommissionCents']for l in out if l.startswith('{')],[800,1000])
test('a native return reversal restores the current earned base without changing the original rate',reversed_return)

# Remaining report arithmetic fixtures are deliberately synthetic snapshots/counters; financial write paths above run natively.
def snapshot(sale=None,rate=1000,merch=10000,shipping=2500,returned=0,discount=0,completed='2026-10-17T12:00:00Z',member=CM):
 sale=sale or uid();rid=uid()
 return f"INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,channel,currency,sale_cents,return_cents,discount_cents,occurred_at)VALUES('{rid}','{S}','{C}','{{\"name\":\"Synthetic commission\"}}','POS','TRY',{merch+shipping},{returned},{discount},'{completed}');INSERT INTO saas.accounting_cashier_commission_sales VALUES('{S}','{sale}','{member}','{uid()}','{uid()}','{rid}','Original cashier','+90 •••••• 1234',{rate},'net_product_sales','TRY',{merch},{shipping},'{completed}');"
def arithmetic():
 out=json.loads(tx(owner(snapshot(returned=4000,discount=2000))+report()))['result_payload']['totals'];eq(out,dict(completedSaleCount=1,merchandiseSalesCents=10000,returnAdjustmentCents=4000,collectionDiscountCents=2000,eligibleBaseCents=4000,earnedCommissionCents=400))
 out=json.loads(tx(owner(snapshot(returned=11000,discount=1500))+report()))['result_payload']['totals'];eq(out['returnAdjustmentCents'],10000);eq(out['collectionDiscountCents'],0);eq(out['earnedCommissionCents'],0)
 out=json.loads(tx(owner(snapshot(rate=5000,merch=1,shipping=0)+snapshot(rate=5000,merch=1,shipping=0))+report()))['result_payload']['totals'];eq(out['earnedCommissionCents'],2)
 # local calendar day edges: 2026-10-17 is UTC+3 in the fixture timezone.
 eq(tx(owner("SELECT saas.accounting_timezone('"+S+"');")),'Europe/Istanbul')
 out=json.loads(tx(owner(snapshot(merch=100,shipping=0,completed='2026-10-16T21:00:00Z')+snapshot(merch=100,shipping=0,completed='2026-10-17T21:00:00Z'))+report()))['result_payload']['totals'];eq(out['completedSaleCount'],1)
 overflow=owner(snapshot(merch=9007199254740991,shipping=0)+snapshot(merch=1,shipping=0))+report();eq(json.loads(tx(overflow))['outcome'],'amount_overflow')
test('delivery is excluded, returns are capped before late discount, rounding is per sale, local date edges and safe totals are enforced',arithmetic)
def immutable_history():
 q=owner(snapshot()+f"DELETE FROM saas.in_store_staff_grants WHERE membership_id='{CM}';UPDATE saas.memberships SET status='revoked'WHERE id='{CM}';")+report()
 r=json.loads(tx(q))['result_payload'];eq(r['rows'][0]['displayName'],'Original cashier');eq(r['rows'][0]['phoneMasked'],'+90 •••••• 1234');eq(r['rows'][0]['commissionEnabled'],False);eq(r['totals']['earnedCommissionCents'],1000)
 for action in ['UPDATE saas.accounting_cashier_commission_sales SET rate_bps=2000','DELETE FROM saas.accounting_cashier_commission_sales']:
  r=subprocess.run(ARGS,input='BEGIN;'+setup()+owner(snapshot()+action+';')+'ROLLBACK;',text=True,capture_output=True,timeout=30);assert r.returncode!=0 and 'COMMISSION250_IMMUTABLE'in r.stderr,r.stderr
 eq(sql("SELECT count(*)FROM pg_constraint WHERE conrelid='saas.accounting_cashier_commission_sales'::regclass AND contype='f'AND confrelid<>'saas.stores'::regclass"),'0')
test('earned snapshots are immutable and retain original masked identity after staff removal without blocking order/member foreign keys',immutable_history)
def source_scope():
 before=json.loads((ART/'all-functions-before.json').read_text());after=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'sha256',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),'owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'security',prosecdef,'volatility',provolatile,'strict',proisstrict,'parallel',proparallel)ORDER BY oid::regprocedure::text)FROM pg_proc WHERE pronamespace='saas'::regnamespace AND prokind='f'"));actual={r['signature']:r for r in after}
 eq(len(before),1882);eq(len(after),1888)
 for old in before:eq({k:v for k,v in old.items()if k!='oid'},actual[old['signature']])
 eq(sql("SELECT bool_and(NOT has_function_privilege('celebix_saas_app',oid,'EXECUTE')AND NOT has_function_privilege('public',oid,'EXECUTE'))FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('accounting250_commission_guard','in_store_staff_projection_v6')"),'t')
 eq(sql("SELECT has_table_privilege('celebix_saas_app','saas.accounting_cashier_commission_sales','SELECT,INSERT,UPDATE,DELETE')"),'f')
 for role in ['celebix_saas_app','celebix_saas_workflow']:eq(sql('BEGIN READ ONLY;SET LOCAL ROLE '+role+';SELECT saas.built_in_payment_methods_preflight(),saas.payment_provider_keyed_lifecycle_preflight(),saas.iyzico_iframe_tenant_activation_runtime_preflight(),saas.quick_order_hosted_payment_authority_preflight(),saas.shipping_provider_preflight();ROLLBACK;'),'t|t|t|t|t')
 (ART/'unchanged-functions-proof.json').write_text(json.dumps(dict(before=1882,after=1888,unchanged=1882,edited=0,new=6,preflights=True),indent=2))
test('all 1882 existing function sources and authority metadata remain exact; six additions are scoped and payment probes pass',source_scope)
def rollback_guards():
 down=(ROOT/'apps/owner/scripts/sql/saas/202610170250_cashier_commissions.down.sql').read_text()
 injected=down.replace('LOCK TABLE',f"UPDATE saas.in_store_staff_grants SET commission_enabled=true,commission_rate_bps=100 WHERE membership_id='{CM}';LOCK TABLE",1)
 r=subprocess.run(ARGS,input=injected,text=True,capture_output=True,timeout=30)
 assert r.returncode!=0 and 'COMMISSION250_ROLLBACK_IN_USE'in r.stderr,r.stderr
 eq(sql('SELECT count(*)FROM saas.in_store_staff_grants WHERE commission_enabled'),'0')
test('rollback refuses any enabled commission policy and rolls back the entire unsafe attempt',rollback_guards)
(ART/'test-results.json').write_text(json.dumps({'passed':checks,'count':len(checks)},indent=2))
print('RESULT',len(checks),'PASS')
