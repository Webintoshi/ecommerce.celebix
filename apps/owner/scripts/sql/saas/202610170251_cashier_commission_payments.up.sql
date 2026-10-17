-- Recorded cashier commission payments; earned entitlements remain in native250.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $pre$BEGIN
 IF to_regclass('saas.accounting_cashier_commission_sales')IS NULL OR to_regclass('saas.accounting_commission_payments')IS NOT NULL
  OR to_regprocedure('saas.accounting_commissions_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb)')IS NULL
  OR to_regprocedure('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,jsonb)')IS NULL
 THEN RAISE EXCEPTION 'COMMISSION251_PREDECESSOR';END IF;
END $pre$;
CREATE TABLE saas.accounting_commission_payments(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),membership_id uuid NOT NULL,event_id uuid NOT NULL UNIQUE,
 occurred_on date NOT NULL CHECK(occurred_on BETWEEN DATE '0001-01-01'AND DATE '9999-12-31'),created_at timestamptz NOT NULL CHECK(isfinite(created_at)),created_by uuid NOT NULL,
 FOREIGN KEY(store_id,event_id)REFERENCES saas.accounting_events(store_id,id),FOREIGN KEY(store_id,created_by)REFERENCES saas.memberships(store_id,id)
);
CREATE INDEX accounting_commission251_member ON saas.accounting_commission_payments(store_id,membership_id,created_at DESC,id DESC);
CREATE INDEX accounting_commission251_entitlement ON saas.accounting_cashier_commission_sales(store_id,membership_id,completed_at DESC,sale_id DESC);
CREATE TABLE saas.accounting_commission_payment_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),actor_membership_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('pay','reversePayment')),payload_fingerprint text NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'),committed_at timestamptz NOT NULL CHECK(isfinite(committed_at)),
 FOREIGN KEY(store_id,actor_membership_id)REFERENCES saas.memberships(store_id,id)
);
DO $tables$DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['accounting_commission_payments','accounting_commission_payment_operations']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY commission251_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
  EXECUTE format('CREATE TRIGGER accounting_immutable BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable()',t);
  EXECUTE format('CREATE TRIGGER platform_support_journal_write AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',t);
 END LOOP;
END $tables$;

CREATE FUNCTION saas.accounting_commission251_intent_valid(p_kind text,p_args jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE required text[];k text;v jsonb;n numeric;d date;BEGIN
 required:=CASE p_kind WHEN 'pay'THEN ARRAY['membershipId','accountId','amountCents','currency','occurredOn','note','expectedBalanceToken','expectedAccountVersion']WHEN 'reversePayment'THEN ARRAY['membershipId','paymentId','reason','expectedBalanceToken','expectedAccountVersion']END;
 IF required IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object'OR pg_column_size(p_args)>16384 OR NOT(p_args?&required)OR(SELECT count(*)FROM jsonb_object_keys(p_args))<>cardinality(required)THEN RETURN false;END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_args)LOOP
  IF k IN('membershipId','accountId','paymentId')THEN
   IF jsonb_typeof(v)<>'string'OR v#>>'{}'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'THEN RETURN false;END IF;
  ELSIF k IN('amountCents','expectedAccountVersion')THEN
   IF jsonb_typeof(v)<>'number'THEN RETURN false;END IF;n:=(v#>>'{}')::numeric;IF n<>trunc(n)OR n NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false;END IF;
  ELSIF k='expectedBalanceToken'THEN IF jsonb_typeof(v)<>'string'OR v#>>'{}'!~'^[a-f0-9]{64}$'THEN RETURN false;END IF;
  ELSIF k='currency'THEN IF v<>'"TRY"'::jsonb THEN RETURN false;END IF;
  ELSIF k='occurredOn'THEN
   IF jsonb_typeof(v)<>'string'OR v#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR left(v#>>'{}',4)='0000'THEN RETURN false;END IF;
   d:=(v#>>'{}')::date;IF to_char(d,'YYYY-MM-DD')<>v#>>'{}'THEN RETURN false;END IF;
  ELSE IF k NOT IN('note','reason')OR jsonb_typeof(v)<>'string'OR length(v#>>'{}')NOT BETWEEN 1 AND 2000 OR v#>>'{}'<>btrim(v#>>'{}')OR v#>>'{}'~'[[:cntrl:]]'THEN RETURN false;END IF;
  END IF;
 END LOOP;RETURN true;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $f$;

CREATE FUNCTION saas.accounting_commission251_balance_projection(p_store uuid,p_target uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE label_value text;phone_value text;earned numeric;paid numeric;token_value text;BEGIN
 SELECT left(coalesce(nullif(btrim(ps.display_name),''),'Kasiyer'),200),left(nullif(btrim(pi.phone_masked),''),80)INTO label_value,phone_value
 FROM saas.platform_normal_memberships m LEFT JOIN saas.merchant_phone_staff ps ON ps.store_id=m.store_id AND ps.membership_id=m.id LEFT JOIN saas.merchant_phone_identities pi ON pi.id=ps.phone_id WHERE m.store_id=p_store AND m.id=p_target AND m.status='active'AND m.role='cashier';
 IF label_value IS NULL THEN SELECT display_name,phone_masked INTO label_value,phone_value FROM saas.accounting_cashier_commission_sales WHERE store_id=p_store AND membership_id=p_target ORDER BY completed_at DESC,sale_id DESC LIMIT 1;END IF;
 IF label_value IS NULL THEN RETURN NULL;END IF;
 -- The token is concurrency control, not an authentication credential. Four summed
 -- SHA256 lanes and a source count form a fixed-size state; no history string_agg.
 WITH chosen AS MATERIALIZED(
  SELECT s.*,coalesce(r.return_cents,0)::numeric returned,coalesce(r.discount_cents,0)::numeric discounted,r.version receivable_version
  FROM saas.accounting_cashier_commission_sales s LEFT JOIN saas.accounting_receivables r ON r.store_id=s.store_id AND r.id=s.receivable_id WHERE s.store_id=p_store AND s.membership_id=p_target
 ),earned_rows AS(
  SELECT round(greatest(merchandise_cents::numeric-least(merchandise_cents::numeric,returned)-least(greatest(merchandise_cents::numeric-returned,0),discounted),0)*rate_bps::numeric/10000)amount,
   encode(sha256(convert_to(jsonb_build_array('sale',sale_id,original_operation_id,order_reference_id,receivable_id,rate_bps,merchandise_cents,shipping_cents,completed_at,returned,discounted,receivable_version)::text,'UTF8')),'hex')h FROM chosen
 ),payment_rows AS MATERIALIZED(
  SELECT e.amount_cents::numeric amount,rev.id reversed,
   encode(sha256(convert_to(jsonb_build_array('payment',p.id,e.id,e.amount_cents,rev.id,p.created_at)::text,'UTF8')),'hex')h
  FROM saas.accounting_commission_payments p JOIN saas.accounting_events e ON e.store_id=p.store_id AND e.id=p.event_id LEFT JOIN saas.accounting_events rev ON rev.store_id=e.store_id AND rev.reverses_event_id=e.id WHERE p.store_id=p_store AND p.membership_id=p_target
 ),sources AS(SELECT h FROM earned_rows UNION ALL SELECT h FROM payment_rows),state AS(
  SELECT count(*)n,coalesce(sum((('x'||substr(h,1,16))::bit(64)::bigint)::numeric),0)a,coalesce(sum((('x'||substr(h,17,16))::bit(64)::bigint)::numeric),0)b,
   coalesce(sum((('x'||substr(h,33,16))::bit(64)::bigint)::numeric),0)c,coalesce(sum((('x'||substr(h,49,16))::bit(64)::bigint)::numeric),0)d FROM sources
 ),totals AS(SELECT coalesce((SELECT sum(amount)FROM earned_rows),0)earned,coalesce((SELECT sum(amount)FROM payment_rows WHERE reversed IS NULL),0)paid)
 SELECT t.earned,t.paid,encode(sha256(convert_to(jsonb_build_array('commission251',p_store,p_target,t.earned,t.paid,s.n,s.a,s.b,s.c,s.d)::text,'UTF8')),'hex')INTO earned,paid,token_value FROM totals t CROSS JOIN state s;
 IF earned NOT BETWEEN 0 AND 9007199254740991 OR paid NOT BETWEEN 0 AND 9007199254740991 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('membershipId',p_target,'displayName',label_value,'phoneMasked',phone_value,'currency','TRY','earnedCommissionCents',earned,'paidCents',paid,'dueCents',greatest(earned-paid,0),'overpaidCents',greatest(paid-earned,0),'balanceToken',token_value);
END $f$;

CREATE FUNCTION saas.accounting_commission251_payment_projection(p_store uuid,p_payment uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',p.id,'membershipId',p.membership_id,'eventId',e.id,'accountId',a.id,'accountName',a.name,'accountType',a.account_type,'currency',e.currency,'amountCents',e.amount_cents,'occurredOn',p.occurred_on,'createdAt',saas.orders_json_timestamp(p.created_at),'note',e.note,'reversed',rev.id IS NOT NULL,'reversalReason',rev.note)
 FROM saas.accounting_commission_payments p JOIN saas.accounting_events e ON e.store_id=p.store_id AND e.id=p.event_id JOIN saas.accounting_accounts a ON a.store_id=e.store_id AND a.id=e.account_id LEFT JOIN saas.accounting_events rev ON rev.store_id=e.store_id AND rev.reverses_event_id=e.id WHERE p.store_id=p_store AND p.id=p_payment
$f$;

CREATE FUNCTION saas.accounting_commission_balances_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;payload jsonb;overflow boolean;row_count bigint;v jsonb;BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store,p_member)THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 WITH actors AS(SELECT id FROM saas.platform_normal_memberships WHERE store_id=p_store AND status='active'AND role='cashier'UNION SELECT membership_id FROM saas.accounting_cashier_commission_sales WHERE store_id=p_store UNION SELECT membership_id FROM saas.accounting_commission_payments WHERE store_id=p_store),
 projected AS MATERIALIZED(SELECT id,saas.accounting_commission251_balance_projection(p_store,id)value FROM actors)
 SELECT count(*),coalesce(bool_or(value IS NULL),false),jsonb_build_object('rows',coalesce(jsonb_agg(value ORDER BY value->>'displayName',id),'[]'::jsonb),'totals',jsonb_build_object('earnedCommissionCents',coalesce(sum((value->>'earnedCommissionCents')::numeric),0),'paidCents',coalesce(sum((value->>'paidCents')::numeric),0),'dueCents',coalesce(sum((value->>'dueCents')::numeric),0),'overpaidCents',coalesce(sum((value->>'overpaidCents')::numeric),0)))INTO row_count,overflow,payload FROM projected;
 IF overflow THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;IF row_count>1000 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 FOR v IN SELECT value FROM jsonb_each(payload->'totals')LOOP IF v::numeric NOT BETWEEN 0 AND 9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;END LOOP;
 RETURN QUERY SELECT 'found',payload;
END $f$;

CREATE FUNCTION saas.accounting_commission_payments_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_target uuid)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;b jsonb;payload jsonb;tz text;BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store,p_member)THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_target IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE store_id=p_store AND id=p_target AND status='active'AND role='cashier')AND NOT EXISTS(SELECT 1 FROM saas.accounting_cashier_commission_sales WHERE store_id=p_store AND membership_id=p_target)THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz)THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 b:=saas.accounting_commission251_balance_projection(p_store,p_target);IF b IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 WITH recent AS(SELECT id,created_at FROM saas.accounting_commission_payments WHERE store_id=p_store AND membership_id=p_target ORDER BY created_at DESC,id DESC LIMIT 101)
 SELECT jsonb_build_object('balance',b,'today',(p_now AT TIME ZONE tz)::date,'payments',coalesce((SELECT jsonb_agg(saas.accounting_commission251_payment_projection(p_store,id)ORDER BY created_at DESC,id DESC)FROM(SELECT * FROM recent ORDER BY created_at DESC,id DESC LIMIT 100)visible),'[]'::jsonb),'hasMore',(SELECT count(*)>100 FROM recent))INTO payload;
 RETURN QUERY SELECT 'found',payload;
END $f$;

CREATE FUNCTION saas.accounting_commission_payment_operation(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_commission_payment_operations%ROWTYPE;BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store,p_member)THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_commission_payment_operations WHERE store_id=p_store AND operation_id=p_operation AND actor_membership_id=p_member;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('replayed',true);
END $f$;

CREATE FUNCTION saas.accounting_commission_payment_mutate(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_kind text,p_operation uuid,p_fingerprint text,p_args jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_commission_payment_operations%ROWTYPE;account saas.accounting_accounts%ROWTYPE;original saas.accounting_events%ROWTYPE;written saas.accounting_events%ROWTYPE;
 target_id uuid;payment_id_value uuid;event_id_value uuid;b_before jsonb;b_after jsonb;payment_value jsonb;account_value jsonb;previous_due bigint;previous_overpaid bigint;previous_balance bigint;amount bigint;tz text;lower_count bigint;lower_outcome text;lower_payload jsonb;lower_args jsonb;result jsonb;expected_balance numeric;expected_paid numeric;
BEGIN
 PERFORM saas.platform_support_begin(p_store,p_principal,p_member,'accounting_commission_payment_mutate');
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store,p_member)THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_operation::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'OR NOT saas.accounting_commission251_intent_valid(p_kind,p_args)THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.operation:'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store::text,0));
 PERFORM 1 FROM saas.platform_normal_memberships WHERE store_id=p_store AND id=p_member FOR SHARE;PERFORM 1 FROM saas.stores WHERE id=p_store FOR SHARE;PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan FOR SHARE;
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store,p_member)THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_commission_payment_operations WHERE operation_id=p_operation;
 IF FOUND THEN IF prior.store_id=p_store AND prior.actor_membership_id=p_member AND prior.kind=p_kind AND prior.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting_operations WHERE operation_id=p_operation)THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 target_id:=(p_args->>'membershipId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE store_id=p_store AND id=target_id AND status='active'AND role='cashier')AND NOT EXISTS(SELECT 1 FROM saas.accounting_cashier_commission_sales WHERE store_id=p_store AND membership_id=target_id)THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 b_before:=saas.accounting_commission251_balance_projection(p_store,target_id);IF b_before IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 IF b_before->>'balanceToken'IS DISTINCT FROM p_args->>'expectedBalanceToken'THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 previous_due:=(b_before->>'dueCents')::bigint;previous_overpaid:=(b_before->>'overpaidCents')::bigint;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz)THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 IF p_kind='pay'THEN
  amount:=(p_args->>'amountCents')::bigint;IF amount>previous_due THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
  IF(p_args->>'occurredOn')::date>(p_now AT TIME ZONE tz)::date THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=(p_args->>'accountId')::uuid FOR UPDATE;
 ELSE
  payment_id_value:=(p_args->>'paymentId')::uuid;
  SELECT e.* INTO original FROM saas.accounting_commission_payments p JOIN saas.accounting_events e ON e.store_id=p.store_id AND e.id=p.event_id WHERE p.store_id=p_store AND p.membership_id=target_id AND p.id=payment_id_value;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.accounting_events WHERE store_id=p_store AND reverses_event_id=original.id)THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  amount:=original.amount_cents;SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=original.account_id FOR UPDATE;
 END IF;
 IF account.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF account.account_type NOT IN('cash','bank')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF account.currency<>'TRY'THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;
 IF account.version<>(p_args->>'expectedAccountVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF account.version>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 previous_balance:=account.balance_cents;IF p_kind='pay'AND previous_balance<amount THEN RETURN QUERY SELECT 'insufficient_funds',NULL::jsonb;RETURN;END IF;
 expected_balance:=previous_balance::numeric+CASE WHEN p_kind='pay'THEN -amount ELSE amount END;
 expected_paid:=(b_before->>'paidCents')::numeric+CASE WHEN p_kind='pay'THEN amount ELSE -amount END;
 IF expected_balance NOT BETWEEN 0 AND 9007199254740991 OR expected_paid NOT BETWEEN 0 AND 9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 IF p_kind='pay'THEN lower_args:=jsonb_build_object('accountId',account.id,'amountCents',amount,'currency','TRY','category','Kasiyer primi','note',p_args->>'note','documentNumber',NULL,'occurredOn',p_args->>'occurredOn','expectedVersion',account.version);
 ELSE lower_args:=jsonb_build_object('eventId',original.id,'reason',p_args->>'reason','expectedVersion',account.version);END IF;
 SELECT count(*),min(r.outcome),jsonb_agg(r.result_payload)->0 INTO lower_count,lower_outcome,lower_payload FROM saas.accounting_mutate(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,p_operation,p_fingerprint,CASE WHEN p_kind='pay'THEN 'expense'ELSE 'reverse'END,lower_args)r;
 IF lower_count<>1 THEN RAISE EXCEPTION 'COMMISSION251_LEDGER_RESULT_COUNT';END IF;
 IF lower_outcome<>'committed'THEN
  IF lower_outcome IN('invalid_input','membership_denied','store_inactive','feature_not_enabled','not_found','version_conflict','operation_mismatch','overpayment','insufficient_funds','amount_overflow','invalid_transition','currency_mismatch','unavailable','durable_authority_invalid')THEN RETURN QUERY SELECT lower_outcome,NULL::jsonb;RETURN;END IF;
  RAISE EXCEPTION 'COMMISSION251_LEDGER_OUTCOME';
 END IF;
 -- No normal return after the ledger commit: every failed postcondition rolls back everything.
 event_id_value:=saas.inventory_deterministic_uuid('accounting','saas.accounting.event:'||p_operation::text);SELECT * INTO written FROM saas.accounting_events WHERE store_id=p_store AND id=event_id_value;
 IF written.id IS NULL OR written.operation_id<>p_operation OR written.account_id IS DISTINCT FROM account.id OR written.amount_cents<>amount OR written.currency<>'TRY'OR written.actor_membership_id<>p_member OR written.customer_id IS NOT NULL OR written.order_id IS NOT NULL
  OR lower_payload->>'operationId'IS DISTINCT FROM p_operation::text OR lower_payload->>'replayed'IS DISTINCT FROM 'false'OR lower_payload#>>'{event,id}'IS DISTINCT FROM event_id_value::text
  OR(p_kind='pay'AND(written.kind<>'expense'OR written.reverses_event_id IS NOT NULL OR written.category IS DISTINCT FROM 'Kasiyer primi'OR written.note IS DISTINCT FROM p_args->>'note'OR written.occurred_at IS DISTINCT FROM((p_args->>'occurredOn')::date::timestamp AT TIME ZONE tz)))
  OR(p_kind='reversePayment'AND(written.kind<>'reversal'OR written.reverses_event_id IS DISTINCT FROM original.id OR written.note IS DISTINCT FROM p_args->>'reason'))
  OR NOT EXISTS(SELECT 1 FROM saas.accounting_accounts WHERE store_id=p_store AND id=account.id AND balance_cents::numeric=expected_balance AND version::numeric=account.version::numeric+1)
  OR(SELECT count(*)FROM saas.accounting_account_movements WHERE store_id=p_store AND event_id=event_id_value)<>1
  OR NOT EXISTS(SELECT 1 FROM saas.accounting_account_movements WHERE store_id=p_store AND event_id=event_id_value AND account_id=account.id AND amount_cents=CASE WHEN p_kind='pay'THEN -amount ELSE amount END)
  OR EXISTS(SELECT 1 FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=event_id_value)THEN RAISE EXCEPTION 'COMMISSION251_LEDGER_POSTCONDITION';END IF;
 IF p_kind='pay'THEN payment_id_value:=p_operation;INSERT INTO saas.accounting_commission_payments(id,store_id,membership_id,event_id,occurred_on,created_at,created_by)VALUES(payment_id_value,p_store,target_id,event_id_value,(p_args->>'occurredOn')::date,clock_timestamp(),p_member);END IF;
 b_after:=saas.accounting_commission251_balance_projection(p_store,target_id);payment_value:=saas.accounting_commission251_payment_projection(p_store,payment_id_value);account_value:=saas.accounting_account_projection(p_store,account.id);
 IF b_after IS NULL OR payment_value IS NULL OR account_value IS NULL OR b_after->>'earnedCommissionCents'IS DISTINCT FROM b_before->>'earnedCommissionCents'OR(b_after->>'paidCents')::numeric<>expected_paid
  OR b_after->>'balanceToken'=b_before->>'balanceToken'OR payment_value->>'membershipId'IS DISTINCT FROM target_id::text OR payment_value->>'accountId'IS DISTINCT FROM account.id::text OR payment_value->>'reversed'IS DISTINCT FROM(CASE WHEN p_kind='pay'THEN 'false'ELSE 'true'END)
  OR(p_kind='reversePayment'AND payment_value->>'reversalReason'IS DISTINCT FROM p_args->>'reason')THEN RAISE EXCEPTION 'COMMISSION251_PAYMENT_POSTCONDITION';END IF;
 result:=jsonb_build_object('operationId',p_operation,'replayed',false,'kind',p_kind,'balance',b_after,'payment',payment_value,'account',account_value,'previousDueCents',previous_due,'previousOverpaidCents',previous_overpaid,'previousBalanceCents',previous_balance,'previousBalanceToken',b_before->>'balanceToken');
 INSERT INTO saas.accounting_commission_payment_operations VALUES(p_operation,p_store,p_member,p_kind,p_fingerprint,result,clock_timestamp());RETURN QUERY SELECT 'committed',result;
END $f$;
DO $acl$DECLARE f record;r record;BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'accounting_commission251_%'OR proname IN('accounting_commission_balances_read','accounting_commission_payments_read','accounting_commission_payment_mutate','accounting_commission_payment_operation'))LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,r.rolname);END LOOP;
  IF f.proname NOT LIKE 'accounting_commission251_%'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.signature);END IF;
 END LOOP;
END $acl$;
COMMIT;
