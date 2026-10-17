"""Commission payout checks on a socket-only synthetic clone; no live access."""
from pathlib import Path
import hashlib,json,subprocess,uuid,concurrent.futures,time
ROOT=Path(__file__).resolve().parents[5];ART=ROOT/'.tmp/cashier-commission251-20261017'
BIN='/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin/psql'
ARGS=[BIN,'-h','/tmp/celebix-c251-20261017','-p','25160','-U','postgres','-d','celebix_saas_staging_auth01','-XqAt','-v','ON_ERROR_STOP=1']
def sql(q):
 r=subprocess.run(ARGS,input=q,text=True,capture_output=True,timeout=30)
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
def eq(a,b):assert a==b,(a,b)
checks=[]
def test(label,fn):fn();checks.append(label);print('PASS',len(checks),label,flush=True)
S='10000000-0000-4000-8000-000000000001';P='10000000-0000-4000-8000-000000000003';M='10000000-0000-4000-8000-000000000004';CP='10000000-0000-4000-8000-000000000007';CM='10000000-0000-4000-8000-000000000008';C='10000000-0000-4000-8000-000000000012';PRO='00000000-0000-4000-8000-000000000010';ACCOUNT='7431883d-403c-5f7f-82b8-e51ec138642a'
def uid():return str(uuid.uuid4())
def args(manager=True,store=S):return f"'{store}','{P if manager else CP}','{M if manager else CM}','{PRO}','professional',2,clock_timestamp()"
def owner(q):return 'RESET ROLE;SET LOCAL ROLE celebix_saas_owner;'+q
def app(q):return 'RESET ROLE;SET LOCAL ROLE celebix_saas_app;'+q
def setup():return owner(f"UPDATE saas.memberships SET status='active'WHERE id='{CM}';UPDATE saas.in_store_staff_grants SET enabled=true,commission_enabled=true,commission_rate_bps=1000,can_manage_accounting=true WHERE membership_id='{CM}';UPDATE saas.accounting_accounts SET balance_cents=100000,version=1 WHERE id='{ACCOUNT}';")
def tx(q):return sql('BEGIN;'+setup()+q+'ROLLBACK;')
def snapshot(merch=10000,rate=1000,returned=0,discount=0,member=CM):
 rid=uid();return f"INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,channel,currency,sale_cents,return_cents,discount_cents,occurred_at)VALUES('{rid}','{S}','{C}','{{}}','POS','TRY',{merch},{returned},{discount},clock_timestamp());INSERT INTO saas.accounting_cashier_commission_sales VALUES('{S}','{uid()}','{member}','{uid()}','{uid()}','{rid}','Original cashier','+90 •••••• 1234',{rate},'net_product_sales','TRY',{merch},0,clock_timestamp());"
def balance():return owner(f"SELECT set_config('fixture.token',(saas.accounting_commission251_balance_projection('{S}','{CM}')->>'balanceToken'),true)IS NOT NULL;")
def pay(amount=400,op=None,fp='a',account=ACCOUNT,token="current_setting('fixture.token')",version=1,auth=None):return app(f"SELECT row_to_json(r)FROM saas.accounting_commission_payment_mutate({auth or args()},'pay','{op or uid()}',repeat('{fp}',64),jsonb_build_object('membershipId','{CM}','accountId','{account}','amountCents',{amount},'currency','TRY','occurredOn',(clock_timestamp()AT TIME ZONE 'Europe/Istanbul')::date,'note','Synthetic commission payment','expectedBalanceToken',{token},'expectedAccountVersion',{version}))r;")
def report():return app(f"SELECT row_to_json(r)FROM saas.accounting_commission_balances_read({args()})r;")
def detail():return app(f"SELECT row_to_json(r)FROM saas.accounting_commission_payments_read({args()},'{CM}')r;")
eq(json.loads(sql("SELECT jsonb_build_object('socket',inet_server_addr() IS NULL,'port',current_setting('port')='25160','tier',current_setting('celebix.deployment_tier')='isolated_staging','path',current_setting('data_directory')='"+str(ART/'data')+"')")),dict(socket=True,port=True,tier=True,path=True))
def defaults():
 eq(sql('SELECT count(*)FROM saas.accounting_commission_payments'),'0')
 eq(sql('SELECT count(*)FROM saas.accounting_commission_payment_operations'),'0')
 r=json.loads(tx(report()))['result_payload'];eq(r['totals'],dict(earnedCommissionCents=0,paidCents=0,dueCents=0,overpaidCents=0))
test('no payments or backfill are created and all-time balances start empty',defaults)
def partial():
 op=uid();q=owner(snapshot())+balance()+pay(op=op)+pay(op=op)+app(f"SELECT row_to_json(r)FROM saas.accounting_commission_payment_operation({args()},'{op}')r;")+detail()
 out=tx(q).splitlines();data=[json.loads(x)for x in out if x.startswith('{')];eq([r['outcome']for r in data],['committed','operation_replayed','found','found'])
 result=data[0]['result_payload'];eq(result['previousDueCents'],1000);eq(result['balance']['paidCents'],400);eq(result['balance']['dueCents'],600);eq(result['account']['balanceCents'],99600);eq(result['account']['version'],2)
 eq(data[1]['result_payload'],result|{'replayed':True});eq(data[2]['result_payload'],result|{'replayed':True});eq(data[3]['result_payload']['payments'][0]['amountCents'],400)
 q=owner(snapshot())+balance()+pay(amount=400)+balance()+pay(amount=600,version=2)+detail()+owner(f"SELECT count(*)||':'||sum(-amount_cents)FROM saas.accounting_account_movements WHERE account_id='{ACCOUNT}'AND amount_cents<0 AND event_id IN(SELECT id FROM saas.accounting_events WHERE category='Kasiyer primi');")
 out=tx(q).splitlines();data=[json.loads(x)for x in out if x.startswith('{')];eq(data[-1]['result_payload']['balance']['dueCents'],0);eq(data[-1]['result_payload']['balance']['paidCents'],1000);eq(out[-1],'2:1000')
test('partial and final payments post one expense and account movement; exact replay and recovery never pay twice',partial)
def no_write_guards():
 for amount,token,version,want in [(1001,"current_setting('fixture.token')",1,'overpayment'),(1,"repeat('0',64)",1,'version_conflict'),(1,"current_setting('fixture.token')",2,'version_conflict')]:
  r=json.loads(tx(owner(snapshot())+balance()+pay(amount=amount,token=token,version=version)).splitlines()[-1]);eq(r['outcome'],want)
 r=json.loads(tx(owner(snapshot()+f"UPDATE saas.accounting_accounts SET balance_cents=0 WHERE id='{ACCOUNT}';")+balance()+pay()).splitlines()[-1]);eq(r['outcome'],'insufficient_funds')
 # Payment cannot target another store's account or a card settlement account.
 r=json.loads(tx(owner(snapshot())+balance()+pay(account=uid())).splitlines()[-1]);eq(r['outcome'],'not_found')
 r=json.loads(tx(owner(snapshot()+f"UPDATE saas.accounting_accounts SET account_type='card'WHERE id='{ACCOUNT}';")+balance()+pay()).splitlines()[-1]);eq(r['outcome'],'invalid_input')
 r=json.loads(tx(owner(snapshot()+f"UPDATE saas.accounting_accounts SET currency='USD'WHERE id='{ACCOUNT}';")+balance()+pay()).splitlines()[-1]);eq(r['outcome'],'currency_mismatch')
 for mutation in ["'pay','"+uid()+"',repeat('a',64),'{}'::jsonb", "'other','"+uid()+"',repeat('a',64),'{}'::jsonb"]:
  eq(tx(app(f"SELECT outcome FROM saas.accounting_commission_payment_mutate({args()},{mutation});")),'invalid_input')
test('overpay, stale token/account, missing or foreign account, card, currency and insufficient balance fail before writing',no_write_guards)
def authority():
 for call in [f"saas.accounting_commission_balances_read({args(False)})",f"saas.accounting_commission_payments_read({args(False)},'{CM}')",f"saas.accounting_commission_payment_operation({args(False)},'{uid()}')"]:eq(tx(app('SELECT outcome FROM '+call+';')),'membership_denied')
 r=json.loads(tx(owner(snapshot())+balance()+pay(auth=args(False))).splitlines()[-1]);eq(r['outcome'],'membership_denied')
 eq(tx(app(f"SELECT outcome FROM saas.accounting_commission_balances_read({args(store=uid())});")),'membership_denied')
 eq(tx(app(f"SELECT outcome FROM saas.accounting_commission_payments_read({args()},'{uid()}');")),'not_found')
 q=owner(snapshot()+f"UPDATE saas.memberships SET status='revoked'WHERE id='{CM}';DELETE FROM saas.in_store_staff_grants WHERE membership_id='{CM}';")+balance()+pay()+detail()
 out=[json.loads(x)for x in tx(q).splitlines()if x.startswith('{')];eq(out[0]['outcome'],'committed');eq(out[1]['result_payload']['balance']['displayName'],'Original cashier')
test('cashiers cannot read or pay commissions even with accounting grant; historical revoked sellers remain payable',authority)
def reverse(payment,version=2,op=None):return app(f"SELECT row_to_json(r)FROM saas.accounting_commission_payment_mutate({args()},'reversePayment','{op or uid()}',repeat('d',64),jsonb_build_object('membershipId','{CM}','paymentId','{payment}','reason','Synthetic correction','expectedBalanceToken',current_setting('fixture.token'),'expectedAccountVersion',{version}))r;")
def reversal():
 payid=uid();revid=uid();q=owner(snapshot())+balance()+pay(op=payid)+balance()+reverse(payid,op=revid)+reverse(payid,op=revid)+detail()
 out=[json.loads(x)for x in tx(q).splitlines()if x.startswith('{')];eq([x['outcome']for x in out],['committed','committed','operation_replayed','found']);b=out[-1]['result_payload']['balance'];eq(b['paidCents'],0);eq(b['dueCents'],1000);eq(out[1]['result_payload']['account']['balanceCents'],100000);eq(out[-1]['result_payload']['payments'][0]['reversed'],True)
 # The existing journal may reverse the expense directly; payment status derives from that actual ledger reversal.
 payid=uid();q=owner(snapshot())+balance()+pay(op=payid)+owner(f"SELECT set_config('fixture.event',(SELECT event_id::text FROM saas.accounting_commission_payments WHERE id='{payid}'),true)IS NOT NULL;")+app(f"SELECT outcome FROM saas.accounting_mutate({args()},'{uid()}',repeat('b',64),'reverse',jsonb_build_object('eventId',current_setting('fixture.event'),'reason','Journal correction','expectedVersion',2));")+detail()+balance()+reverse(payid,version=3)
 out=tx(q).splitlines();data=[json.loads(x)for x in out if x.startswith('{')];eq(data[-2]['result_payload']['balance']['paidCents'],0);eq(data[-2]['result_payload']['payments'][0]['reversalReason'],'Journal correction');eq(data[-1]['outcome'],'invalid_transition')
test('partial payment reversal restores account and debt once, including corrections made through the existing journal',reversal)
def return_after_payment():
 payid=uid();q=owner(snapshot())+balance()+pay(amount=1000,op=payid)+owner(f"UPDATE saas.accounting_receivables SET return_cents=6000,version=version+1 WHERE id IN(SELECT receivable_id FROM saas.accounting_cashier_commission_sales WHERE store_id='{S}'AND membership_id='{CM}');")+detail()+balance()+pay(amount=1,version=2)+reverse(payid,version=2)+detail()
 data=[json.loads(x)for x in tx(q).splitlines()if x.startswith('{')];b=data[1]['result_payload']['balance'];eq((b['earnedCommissionCents'],b['paidCents'],b['dueCents'],b['overpaidCents']),(400,1000,0,600));eq(data[2]['outcome'],'overpayment');b=data[-1]['result_payload']['balance'];eq((b['paidCents'],b['dueCents'],b['overpaidCents']),(0,400,0))
 # Equal totals do not permit a stale token: changing which sale/adjustment sources generated them invalidates it.
 q=owner(snapshot(merch=100,returned=1)+snapshot(merch=100,returned=2))+balance()+owner(f"UPDATE saas.accounting_receivables SET return_cents=CASE return_cents WHEN 1 THEN 2 ELSE 1 END,version=version+1 WHERE id IN(SELECT receivable_id FROM saas.accounting_cashier_commission_sales WHERE store_id='{S}'AND membership_id='{CM}');")+pay(amount=1)
 eq(json.loads(tx(q).splitlines()[-1])['outcome'],'version_conflict')
 # A new entitlement snapshot also invalidates the prior balance token.
 q=owner(snapshot())+balance()+owner(snapshot())+pay(amount=1);eq(json.loads(tx(q).splitlines()[-1])['outcome'],'version_conflict')
test('returns after payment expose excess paid without cash mutation; source changes invalidate even equal-total tokens',return_after_payment)
def adoption_and_recovery():
 op=uid();q=owner(snapshot())+balance()+pay(op=op)+pay(op=op,fp='b');out=[json.loads(x)for x in tx(q).splitlines()if x.startswith('{')];eq(out[-1]['outcome'],'operation_mismatch')
 op=uid();q=owner(snapshot())+app(f"SELECT outcome FROM saas.accounting_mutate({args()},'{op}',repeat('a',64),'expense',jsonb_build_object('accountId','{ACCOUNT}','amountCents',10,'currency','TRY','category','Other','note','Unrelated expense','documentNumber',NULL,'occurredOn',(clock_timestamp()AT TIME ZONE 'Europe/Istanbul')::date,'expectedVersion',1));")+balance()+pay(op=op,version=2)
 eq(json.loads(tx(q).splitlines()[-1])['outcome'],'operation_mismatch')
 eq(tx(app(f"SELECT outcome||':'||(result_payload IS NULL)::text FROM saas.accounting_commission_payment_operation({args()},'{uid()}');")),'found:true')
test('operation collisions cannot adopt generic expenses, changed commands fail, and missing recovery stays absent',adoption_and_recovery)
def bounded_detail_and_overflow():
 # Read clipping remains explicit after 100 rows, while all-time balance includes all payments.
 q=owner(snapshot(merch=100000)+f"""DO $x$DECLARE i int;op uuid;e uuid;BEGIN FOR i IN 1..101 LOOP op:=gen_random_uuid();e:=gen_random_uuid();INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,account_id,note,category,actor_membership_id,occurred_at,created_at,metadata)VALUES(e,'{S}',op,'expense','TRY',1,'{ACCOUNT}','Synthetic','Kasiyer primi','{M}',clock_timestamp(),clock_timestamp(),'{{}}');INSERT INTO saas.accounting_commission_payments VALUES(op,'{S}','{CM}',e,(clock_timestamp()AT TIME ZONE 'Europe/Istanbul')::date,clock_timestamp(),'{M}');END LOOP;END $x$;""")+detail()
 r=json.loads(tx(q).splitlines()[-1])['result_payload'];eq(len(r['payments']),100);eq(r['hasMore'],True);eq(r['balance']['paidCents'],101)
 r=json.loads(tx(owner(snapshot(merch=9007199254740991,rate=10000)+snapshot(merch=1,rate=10000))+report()));eq(r['outcome'],'amount_overflow')
test('100-row history limit is explicit and safe-cent overflow refuses misleading totals',bounded_detail_and_overflow)
def local_day_and_intents():
 r=json.loads(tx(detail()))['result_payload'];eq(r['today'],sql("SELECT(clock_timestamp()AT TIME ZONE 'Europe/Istanbul')::date"))
 # Server-provided local date remains authoritative when the store timezone differs.
 eq(sql("SELECT position('AT TIME ZONE tz'IN pg_get_functiondef('saas.accounting_commission_payments_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)'::regprocedure))>0"),'t')
 base=dict(membershipId=CM,accountId=ACCOUNT,amountCents=1,currency='TRY',occurredOn='2026-10-17',note='Test',expectedBalanceToken='a'*64,expectedAccountVersion=1)
 for mutation in [dict(amountCents=0),dict(amountCents=1.5),dict(note=''),dict(expectedAccountVersion=0),dict(expectedBalanceToken='A'*64),dict(occurredOn='2026-02-30'),dict(extra=True),dict(currency='USD')]:
  v=base|mutation;eq(sql("SELECT saas.accounting_commission251_intent_valid('pay','"+json.dumps(v)+"');"),'f')
 # Future recording is refused without touching the account.
 q=owner(snapshot())+balance()+pay().replace("'occurredOn',(clock_timestamp()AT TIME ZONE 'Europe/Istanbul')::date", "'occurredOn',((clock_timestamp()AT TIME ZONE 'Europe/Istanbul')::date+1)")
 eq(json.loads(tx(q).splitlines()[-1])['outcome'],'invalid_input')
test('store-local recording date is supplied by the server; native intents reject future dates and malformed fields',local_day_and_intents)
def rollback_roundtrip():
 down=(ROOT/'apps/owner/scripts/sql/saas/202610170251_cashier_commission_payments.down.sql').read_text();up=(ROOT/'apps/owner/scripts/sql/saas/202610170251_cashier_commission_payments.up.sql').read_text();asserts=(ROOT/'apps/owner/scripts/sql/saas/202610170251_cashier_commission_payments_assertions.sql').read_text()
 # A valid payment created inside the down transaction must force rollback, never erase history.
 op=uid();injected=down.replace('LOCK TABLE',setup()+owner(snapshot())+balance()+pay(op=op)+'RESET ROLE;SET LOCAL ROLE celebix_saas_owner;LOCK TABLE',1)
 r=subprocess.run(ARGS,input=injected,text=True,capture_output=True,timeout=30);assert r.returncode!=0 and 'COMMISSION251_ROLLBACK_IN_USE'in r.stderr,r.stderr;eq(sql('SELECT count(*)FROM saas.accounting_commission_payments'),'0')
 sql(down);eq(sql("SELECT count(*)FROM pg_proc WHERE pronamespace='saas'::regnamespace AND prokind='f'"),'1888');sql(up);sql(asserts)
 (ART/'roundtrip-proof.json').write_text(json.dumps(dict(down=0,up=0,assertions=0,rollbackRefusesPayments=True),indent=2))
test('down/up/assertions roundtrip preserves native250, and any recorded payment prevents destructive rollback',rollback_roundtrip)
def concurrent_payment():
 global ARGS
 # Use a separate disposable database in the already verified socket-only clone.
 original=list(ARGS);database='commission251_race';sql('CREATE DATABASE '+database+' TEMPLATE celebix_saas_staging_auth01;');ARGS[ARGS.index('-d')+1]=database
 try:
  sql('BEGIN;'+setup()+owner(snapshot())+'COMMIT;')
  token=sql(owner(f"SELECT saas.accounting_commission251_balance_projection('{S}','{CM}')->>'balanceToken';").replace('SET LOCAL ROLE','SET ROLE'))
  def writer(op):return sql('BEGIN;'+pay(amount=600,op=op,token="'"+token+"'")+owner('SELECT pg_sleep(0.2);')+'COMMIT;')
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(writer,[uid(),uid()]))
  outcomes=sorted(json.loads(next(line for line in x.splitlines()if line.startswith('{')))['outcome']for x in results);eq(outcomes,['committed','version_conflict'])
  b=json.loads(sql(owner(f"SELECT saas.accounting_commission251_balance_projection('{S}','{CM}');").replace('SET LOCAL ROLE','SET ROLE')));eq((b['paidCents'],b['dueCents']),(600,400));eq(sql('SELECT count(*)FROM saas.accounting_commission_payments'),'1')
  (ART/'concurrency-proof.json').write_text(json.dumps(dict(database='disposable-local-clone',results=outcomes,paidCents=600,dueCents=400,payments=1),indent=2))
 finally:
  ARGS=original;sql('DROP DATABASE '+database+' WITH(FORCE);')
test('two simultaneous payments with the same entitlement token serialize; only one real debit commits',concurrent_payment)
def source_scope():
 before=json.loads((ART/'all-functions-before.json').read_text());after=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'sha256',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),'owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'security',prosecdef,'volatility',provolatile,'strict',proisstrict,'parallel',proparallel)ORDER BY oid::regprocedure::text)FROM pg_proc WHERE pronamespace='saas'::regnamespace AND prokind='f'"));actual={r['signature']:r for r in after};eq(len(before),1888);eq(len(after),1895)
 for old in before:eq(old,actual[old['signature']])
 eq(sql("SELECT bool_and(NOT has_function_privilege('celebix_saas_app',oid,'EXECUTE')AND NOT has_function_privilege('public',oid,'EXECUTE'))FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_commission251_%'"),'t')
 for table in ['accounting_commission_payments','accounting_commission_payment_operations']:eq(sql("SELECT relrowsecurity AND relforcerowsecurity AND NOT has_table_privilege('celebix_saas_app',oid,'SELECT,INSERT,UPDATE,DELETE')FROM pg_class WHERE oid='saas."+table+"'::regclass"),'t')
 for role in ['celebix_saas_app','celebix_saas_workflow']:eq(sql('BEGIN READ ONLY;SET LOCAL ROLE '+role+';SELECT saas.built_in_payment_methods_preflight(),saas.payment_provider_keyed_lifecycle_preflight(),saas.iyzico_iframe_tenant_activation_runtime_preflight(),saas.quick_order_hosted_payment_authority_preflight(),saas.shipping_provider_preflight();ROLLBACK;'),'t|t|t|t|t')
 (ART/'unchanged-functions-proof.json').write_text(json.dumps(dict(before=1888,after=1895,unchanged=1888,edited=0,new=7,preflights=True),indent=2))
test('all 1888 old functions and ACLs remain exact; seven additions are scoped and payment probes pass',source_scope)
(ART/'test-results.json').write_text(json.dumps({'passed':checks,'count':len(checks)},indent=2))
print('RESULT',len(checks),'PASS')
