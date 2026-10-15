-- Supplier debts are obligations; only recorded payments write the existing expense ledger.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $predecessors$
BEGIN
 IF to_regclass('saas.accounting_cash_sessions') IS NULL OR to_regclass('saas.accounting_cash_operations') IS NULL
  OR to_regprocedure('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,jsonb)') IS NULL
  OR to_regprocedure('saas.platform_support_begin(uuid,uuid,uuid,text)') IS NULL
 THEN RAISE EXCEPTION 'SUPPLIERS241_PREDECESSOR_REQUIRED';END IF;
END $predecessors$;

CREATE TABLE saas.accounting_supplier_debts(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),supplier_name text NOT NULL,
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 9007199254740991),
 occurred_on date NOT NULL CHECK(occurred_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),due_on date,
 document_number text,note text NOT NULL,created_at timestamptz NOT NULL CHECK(isfinite(created_at)),created_by uuid NOT NULL,
 UNIQUE(store_id,id),FOREIGN KEY(store_id,created_by) REFERENCES saas.memberships(store_id,id),
 CHECK(length(supplier_name) BETWEEN 1 AND 200 AND supplier_name=btrim(supplier_name) AND supplier_name!~'[[:cntrl:]]'),
 CHECK(due_on IS NULL OR(due_on>=occurred_on AND due_on<=DATE '9999-12-31')),
 CHECK(document_number IS NULL OR(length(document_number) BETWEEN 1 AND 100 AND document_number=btrim(document_number) AND document_number!~'[[:cntrl:]]')),
 CHECK(length(note) BETWEEN 1 AND 2000 AND note=btrim(note) AND note!~'[[:cntrl:]]')
);
CREATE INDEX accounting_supplier_debts_list ON saas.accounting_supplier_debts(store_id,due_on,occurred_on DESC,id);
CREATE TABLE saas.accounting_supplier_payments(
 id uuid PRIMARY KEY,store_id uuid NOT NULL,event_id uuid NOT NULL UNIQUE,debt_id uuid NOT NULL,
 occurred_on date NOT NULL CHECK(occurred_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 created_at timestamptz NOT NULL CHECK(isfinite(created_at)),created_by uuid NOT NULL,
 UNIQUE(store_id,id),FOREIGN KEY(store_id,debt_id) REFERENCES saas.accounting_supplier_debts(store_id,id),
 FOREIGN KEY(store_id,event_id) REFERENCES saas.accounting_events(store_id,id),
 FOREIGN KEY(store_id,created_by) REFERENCES saas.memberships(store_id,id)
);
CREATE INDEX accounting_supplier_payments_debt ON saas.accounting_supplier_payments(store_id,debt_id,created_at DESC,id DESC);
CREATE TABLE saas.accounting_supplier_cancellations(
 id uuid PRIMARY KEY,store_id uuid NOT NULL,debt_id uuid NOT NULL UNIQUE,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000 AND reason=btrim(reason) AND reason!~'[[:cntrl:]]'),
 cancelled_at timestamptz NOT NULL CHECK(isfinite(cancelled_at)),cancelled_by uuid NOT NULL,
 FOREIGN KEY(store_id,debt_id) REFERENCES saas.accounting_supplier_debts(store_id,id),
 FOREIGN KEY(store_id,cancelled_by) REFERENCES saas.memberships(store_id,id)
);
CREATE TABLE saas.accounting_supplier_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),actor_membership_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('createDebt','pay','reversePayment','cancelDebt')),
 payload_fingerprint text NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'),committed_at timestamptz NOT NULL CHECK(isfinite(committed_at)),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id)
);
DO $tables$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['accounting_supplier_debts','accounting_supplier_payments','accounting_supplier_cancellations','accounting_supplier_operations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',t);
  EXECUTE format('CREATE TRIGGER accounting_immutable BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable()',t);
  EXECUTE format('CREATE TRIGGER platform_support_journal_write AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',t);
 END LOOP;
END $tables$;

CREATE FUNCTION saas.accounting_suppliers_intent_valid(p_kind text,p_args jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE required text[];k text;v jsonb;n numeric;parsed_date date;
BEGIN
 required:=CASE p_kind WHEN 'createDebt' THEN ARRAY['supplierName','amountCents','currency','occurredOn','dueOn','documentNumber','note']
  WHEN 'pay' THEN ARRAY['debtId','accountId','amountCents','currency','occurredOn','note','expectedVersion','expectedAccountVersion']
  WHEN 'reversePayment' THEN ARRAY['debtId','paymentId','reason','expectedVersion','expectedAccountVersion']
  WHEN 'cancelDebt' THEN ARRAY['debtId','reason','expectedVersion'] END;
 IF required IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RETURN false;END IF;
 IF pg_column_size(p_args)>16384 OR NOT(p_args?&required) OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>cardinality(required) THEN RETURN false;END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_args) LOOP
  IF k IN('debtId','accountId','paymentId') THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false;END IF;
  ELSIF k IN('amountCents','expectedVersion','expectedAccountVersion') THEN
   IF jsonb_typeof(v)<>'number' THEN RETURN false;END IF;n:=(v#>>'{}')::numeric;
   IF n<>trunc(n) OR n NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false;END IF;
  ELSIF k='currency' THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}'!~'^[A-Z]{3}$' THEN RETURN false;END IF;
  ELSIF k IN('occurredOn','dueOn') THEN
   IF k='dueOn' AND v='null'::jsonb THEN CONTINUE;END IF;
   IF jsonb_typeof(v)<>'string' OR v#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(v#>>'{}',4)='0000' THEN RETURN false;END IF;
   parsed_date:=(v#>>'{}')::date;IF to_char(parsed_date,'YYYY-MM-DD')<>v#>>'{}' THEN RETURN false;END IF;
  ELSE
   IF k='documentNumber' AND v='null'::jsonb THEN CONTINUE;END IF;
   IF k NOT IN('supplierName','documentNumber','note','reason') OR jsonb_typeof(v)<>'string'
    OR length(v#>>'{}') NOT BETWEEN 1 AND (CASE k WHEN 'supplierName' THEN 200 WHEN 'documentNumber' THEN 100 ELSE 2000 END)
    OR v#>>'{}'<>btrim(v#>>'{}') OR v#>>'{}'~'[[:cntrl:]]' THEN RETURN false;END IF;
  END IF;
 END LOOP;
 IF p_kind='createDebt' AND p_args->>'dueOn' IS NOT NULL AND (p_args->>'dueOn')::date<(p_args->>'occurredOn')::date THEN RETURN false;END IF;
 RETURN true;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $f$;

CREATE FUNCTION saas.accounting_suppliers_filters_valid(p_filters jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE k text;v jsonb;
BEGIN
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' THEN RETURN false;END IF;
 IF pg_column_size(p_filters)>16384 THEN RETURN false;END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_filters) LOOP
  IF jsonb_typeof(v)<>'string' THEN RETURN false;END IF;
  IF k='query' THEN IF length(v#>>'{}') NOT BETWEEN 1 AND 200 OR v#>>'{}'<>btrim(v#>>'{}') OR v#>>'{}'~'[[:cntrl:]]' THEN RETURN false;END IF;
  ELSIF k='currency' THEN IF v#>>'{}'!~'^[A-Z]{3}$' THEN RETURN false;END IF;
  ELSIF k='status' THEN IF v#>>'{}' NOT IN('all','open','paid','cancelled') THEN RETURN false;END IF;
  ELSIF k='due' THEN IF v#>>'{}' NOT IN('all','overdue','today','upcoming','undated') THEN RETURN false;END IF;
  ELSE RETURN false;END IF;
 END LOOP;
 RETURN true;
END $f$;

CREATE FUNCTION saas.accounting_suppliers_debt_projection(p_store uuid,p_debt uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.accounting_supplier_debts%ROWTYPE;c saas.accounting_supplier_cancellations%ROWTYPE;paid numeric;debt_version numeric;due numeric;state text;
BEGIN
 SELECT * INTO d FROM saas.accounting_supplier_debts WHERE store_id=p_store AND id=p_debt;IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT coalesce(sum(e.amount_cents::numeric) FILTER(WHERE rev.id IS NULL),0),1+count(p.id)::numeric+count(rev.id)::numeric INTO paid,debt_version
 FROM saas.accounting_supplier_payments p JOIN saas.accounting_events e ON e.store_id=p.store_id AND e.id=p.event_id
 LEFT JOIN saas.accounting_events rev ON rev.store_id=e.store_id AND rev.reverses_event_id=e.id WHERE p.store_id=p_store AND p.debt_id=p_debt;
 SELECT * INTO c FROM saas.accounting_supplier_cancellations WHERE store_id=p_store AND debt_id=p_debt;
 IF FOUND THEN debt_version:=debt_version+1;state:='cancelled';due:=0;ELSE due:=d.amount_cents::numeric-paid;state:=CASE WHEN paid=0 THEN 'unpaid' WHEN due=0 THEN 'paid' ELSE 'partial' END;END IF;
 IF paid NOT BETWEEN 0 AND d.amount_cents OR debt_version NOT BETWEEN 1 AND 9007199254740991 OR state='cancelled' AND paid<>0 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',d.id,'supplierName',d.supplier_name,'currency',d.currency,'amountCents',d.amount_cents,
  'paidCents',paid,'dueCents',due,'occurredOn',d.occurred_on,'dueOn',d.due_on,'documentNumber',d.document_number,'note',d.note,
  'status',state,'version',debt_version,'createdAt',saas.orders_json_timestamp(d.created_at),'createdBy',d.created_by,
  'cancelledAt',CASE WHEN c.cancelled_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(c.cancelled_at) END,
  'cancelledBy',c.cancelled_by,'cancellationReason',c.reason);
END $f$;

CREATE FUNCTION saas.accounting_suppliers_payment_projection(p_store uuid,p_payment uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',p.id,'debtId',p.debt_id,'eventId',e.id,'accountId',a.id,'accountName',a.name,'accountType',a.account_type,
  'currency',e.currency,'amountCents',e.amount_cents,'occurredOn',p.occurred_on,'createdAt',saas.orders_json_timestamp(p.created_at),
  'note',e.note,'reversed',rev.id IS NOT NULL,'reversalReason',rev.note)
 FROM saas.accounting_supplier_payments p JOIN saas.accounting_events e ON e.store_id=p.store_id AND e.id=p.event_id
 JOIN saas.accounting_accounts a ON a.store_id=e.store_id AND a.id=e.account_id
 LEFT JOIN saas.accounting_events rev ON rev.store_id=e.store_id AND rev.reverses_event_id=e.id WHERE p.store_id=p_store AND p.id=p_payment
$f$;

CREATE FUNCTION saas.accounting_suppliers_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_filters jsonb,p_debt uuid DEFAULT NULL)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;tz text;today_value date;debt_value jsonb;result jsonb;has_overflow boolean;status_filter text;due_filter text;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_suppliers_filters_valid(p_filters) OR p_debt IS NOT NULL AND p_filters<>'{}'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 today_value:=(p_now AT TIME ZONE tz)::date;
 IF p_debt IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM saas.accounting_supplier_debts WHERE store_id=p_store AND id=p_debt) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  debt_value:=saas.accounting_suppliers_debt_projection(p_store,p_debt);IF debt_value IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
  WITH recent AS(SELECT id,created_at FROM saas.accounting_supplier_payments WHERE store_id=p_store AND debt_id=p_debt ORDER BY created_at DESC,id DESC LIMIT 101)
  SELECT jsonb_build_object('debt',debt_value,'payments',coalesce((SELECT jsonb_agg(saas.accounting_suppliers_payment_projection(p_store,id) ORDER BY created_at DESC,id DESC)
   FROM(SELECT * FROM recent ORDER BY created_at DESC,id DESC LIMIT 100) visible),'[]'::jsonb),'hasMore',(SELECT count(*)>100 FROM recent)) INTO result;
 ELSE
  status_filter:=coalesce(p_filters->>'status','open');due_filter:=coalesce(p_filters->>'due','all');
  WITH projected AS MATERIALIZED(
   SELECT d.id,d.due_on,d.occurred_on,saas.accounting_suppliers_debt_projection(p_store,d.id) value FROM saas.accounting_supplier_debts d
   WHERE d.store_id=p_store AND (NOT(p_filters?'currency') OR d.currency=p_filters->>'currency')
    AND(NOT(p_filters?'query') OR concat_ws(' ',d.supplier_name,d.document_number,d.note) ILIKE '%'||replace(replace(replace(p_filters->>'query','\','\\'),'%','\%'),'_','\_')||'%')
  ),matching AS(
   SELECT * FROM projected WHERE value IS NOT NULL
    AND(status_filter='all' OR status_filter='open' AND (value->>'dueCents')::bigint>0 OR status_filter='paid' AND value->>'status'='paid' OR status_filter='cancelled' AND value->>'status'='cancelled')
    AND(due_filter='all' OR (value->>'dueCents')::bigint>0 AND CASE due_filter WHEN 'overdue' THEN due_on<today_value WHEN 'today' THEN due_on=today_value WHEN 'upcoming' THEN due_on>today_value ELSE due_on IS NULL END)
   ORDER BY due_on NULLS LAST,occurred_on DESC,id LIMIT 101
  ) SELECT EXISTS(SELECT 1 FROM projected WHERE value IS NULL),jsonb_build_object('debts',coalesce((SELECT jsonb_agg(value ORDER BY due_on NULLS LAST,occurred_on DESC,id)
   FROM(SELECT * FROM matching ORDER BY due_on NULLS LAST,occurred_on DESC,id LIMIT 100) visible),'[]'::jsonb),'today',today_value,'hasMore',(SELECT count(*)>100 FROM matching)) INTO has_overflow,result;
  IF has_overflow THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 END IF;
 RETURN QUERY SELECT 'found',result;
END $f$;

CREATE FUNCTION saas.accounting_suppliers_get_operation(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_expected_fingerprint text DEFAULT NULL)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_supplier_operations%ROWTYPE;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_supplier_operations WHERE operation_id=p_operation AND store_id=p_store AND actor_membership_id=p_member;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND prior.payload_fingerprint<>p_expected_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('replayed',true);
END $f$;

CREATE FUNCTION saas.accounting_suppliers_mutate(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text,p_kind text,p_args jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_supplier_operations%ROWTYPE;d saas.accounting_supplier_debts%ROWTYPE;
 account saas.accounting_accounts%ROWTYPE;original saas.accounting_events%ROWTYPE;written saas.accounting_events%ROWTYPE;
 debt_id_value uuid;payment_id_value uuid;event_id_value uuid;debt_before jsonb;debt_after jsonb;payment_value jsonb;account_value jsonb;
 previous_due bigint;previous_balance bigint;amount bigint;expected_debt_version bigint;now_value timestamptz;tz text;today_value date;
 lower_count bigint;lower_outcome text;lower_payload jsonb;lower_args jsonb;result jsonb;expected_balance numeric;expected_due numeric;
BEGIN
 PERFORM saas.platform_support_begin(p_store,p_principal,p_member,'accounting_suppliers_mutate');
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_operation::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR NOT saas.accounting_suppliers_intent_valid(p_kind,p_args)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 -- The delegated old RPC acquires this exact lock again; use its namespace before store locks.
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.operation:'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store::text,0));
 PERFORM 1 FROM saas.memberships WHERE store_id=p_store AND id=p_member FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan FOR SHARE;
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_supplier_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.store_id=p_store AND prior.actor_membership_id=p_member AND prior.kind=p_kind AND prior.payload_fingerprint=p_fingerprint
  THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);
  ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 -- A generic expense/reversal receipt must never be adopted as a supplier command.
 IF EXISTS(SELECT 1 FROM saas.accounting_operations WHERE operation_id=p_operation) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 today_value:=(p_now AT TIME ZONE tz)::date;
 IF p_kind IN('createDebt','pay') AND (p_args->>'occurredOn')::date>today_value THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 now_value:=clock_timestamp();
 IF p_kind='createDebt' THEN
  debt_id_value:=p_operation;
  INSERT INTO saas.accounting_supplier_debts(id,store_id,supplier_name,currency,amount_cents,occurred_on,due_on,document_number,note,created_at,created_by)
  VALUES(debt_id_value,p_store,p_args->>'supplierName',p_args->>'currency',(p_args->>'amountCents')::bigint,(p_args->>'occurredOn')::date,
   (p_args->>'dueOn')::date,p_args->>'documentNumber',p_args->>'note',now_value,p_member);
  debt_after:=saas.accounting_suppliers_debt_projection(p_store,debt_id_value);
  IF debt_after IS NULL OR (debt_after->>'version')::bigint<>1 THEN RAISE EXCEPTION 'SUPPLIERS241_CREATE_POSTCONDITION';END IF;
 ELSE
  debt_id_value:=(p_args->>'debtId')::uuid;
  SELECT * INTO d FROM saas.accounting_supplier_debts WHERE store_id=p_store AND id=debt_id_value FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  debt_before:=saas.accounting_suppliers_debt_projection(p_store,debt_id_value);
  IF debt_before IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
  expected_debt_version:=(debt_before->>'version')::bigint;
  IF expected_debt_version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF debt_before->>'status'='cancelled' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF expected_debt_version>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
  previous_due:=(debt_before->>'dueCents')::bigint;
  IF p_kind='cancelDebt' THEN
   IF (debt_before->>'paidCents')::bigint<>0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
   INSERT INTO saas.accounting_supplier_cancellations(id,store_id,debt_id,reason,cancelled_at,cancelled_by)
   VALUES(p_operation,p_store,debt_id_value,p_args->>'reason',greatest(now_value,d.created_at),p_member);
   debt_after:=saas.accounting_suppliers_debt_projection(p_store,debt_id_value);
   IF debt_after IS NULL OR debt_after->>'status'<>'cancelled' OR (debt_after->>'version')::numeric<>expected_debt_version::numeric+1
   THEN RAISE EXCEPTION 'SUPPLIERS241_CANCEL_POSTCONDITION';END IF;
  ELSE
   IF p_kind='pay' THEN
    amount:=(p_args->>'amountCents')::bigint;
    IF p_args->>'currency'<>d.currency THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;
    IF amount>previous_due THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
    SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=(p_args->>'accountId')::uuid FOR UPDATE;
   ELSE
    payment_id_value:=(p_args->>'paymentId')::uuid;
    SELECT e.* INTO original FROM saas.accounting_supplier_payments p JOIN saas.accounting_events e ON e.store_id=p.store_id AND e.id=p.event_id
     WHERE p.store_id=p_store AND p.debt_id=debt_id_value AND p.id=payment_id_value;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
    IF EXISTS(SELECT 1 FROM saas.accounting_events WHERE store_id=p_store AND reverses_event_id=original.id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
    amount:=original.amount_cents;
    SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=original.account_id FOR UPDATE;
   END IF;
   IF account.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
   IF account.account_type NOT IN('cash','bank') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF account.currency<>d.currency THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;
   IF account.version<>(p_args->>'expectedAccountVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF account.version>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
   previous_balance:=account.balance_cents;
   IF p_kind='pay' AND previous_balance<amount THEN RETURN QUERY SELECT 'insufficient_funds',NULL::jsonb;RETURN;END IF;
   expected_balance:=previous_balance::numeric+(CASE WHEN p_kind='pay' THEN -amount ELSE amount END);
   expected_due:=previous_due::numeric+(CASE WHEN p_kind='pay' THEN -amount ELSE amount END);
   IF expected_balance NOT BETWEEN 0 AND 9007199254740991 OR expected_due NOT BETWEEN 0 AND d.amount_cents THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
   IF p_kind='pay' THEN
    lower_args:=jsonb_build_object('accountId',account.id,'amountCents',amount,'currency',d.currency,'category','Tedarikçi ödemesi',
     'note',p_args->>'note','documentNumber',d.document_number,'occurredOn',p_args->>'occurredOn','expectedVersion',account.version);
   ELSE lower_args:=jsonb_build_object('eventId',original.id,'reason',p_args->>'reason','expectedVersion',account.version);END IF;
   SELECT count(*),min(r.outcome),jsonb_agg(r.result_payload)->0 INTO lower_count,lower_outcome,lower_payload
   FROM saas.accounting_mutate(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,p_operation,p_fingerprint,
    CASE WHEN p_kind='pay' THEN 'expense' ELSE 'reverse' END,lower_args) r;
   IF lower_count<>1 THEN RAISE EXCEPTION 'SUPPLIERS241_LEDGER_RESULT_COUNT';END IF;
   IF lower_outcome<>'committed' THEN
    IF lower_outcome IN('invalid_input','membership_denied','store_inactive','feature_not_enabled','not_found','version_conflict','operation_mismatch','overpayment','insufficient_funds','amount_overflow','invalid_transition','currency_mismatch','unavailable','durable_authority_invalid')
    THEN RETURN QUERY SELECT lower_outcome,NULL::jsonb;RETURN;END IF;
    RAISE EXCEPTION 'SUPPLIERS241_LEDGER_OUTCOME';
   END IF;
   -- Every failure below raises: a normal return here could commit a partial financial operation.
   event_id_value:=saas.inventory_deterministic_uuid('accounting','saas.accounting.event:'||p_operation::text);
   SELECT * INTO written FROM saas.accounting_events WHERE store_id=p_store AND id=event_id_value;
   IF written.id IS NULL OR written.operation_id<>p_operation OR written.account_id IS DISTINCT FROM account.id OR written.amount_cents<>amount
    OR written.currency<>d.currency OR written.actor_membership_id<>p_member OR written.customer_id IS NOT NULL OR written.order_id IS NOT NULL
    OR lower_payload->>'operationId' IS DISTINCT FROM p_operation::text OR lower_payload->>'replayed' IS DISTINCT FROM 'false'
    OR lower_payload#>>'{event,id}' IS DISTINCT FROM event_id_value::text
    OR(p_kind='pay' AND(written.kind<>'expense' OR written.reverses_event_id IS NOT NULL OR written.category IS DISTINCT FROM 'Tedarikçi ödemesi'
      OR written.note IS DISTINCT FROM p_args->>'note' OR written.occurred_at IS DISTINCT FROM((p_args->>'occurredOn')::date::timestamp AT TIME ZONE tz)))
    OR(p_kind='reversePayment' AND(written.kind<>'reversal' OR written.reverses_event_id IS DISTINCT FROM original.id OR written.note IS DISTINCT FROM p_args->>'reason'))
    OR NOT EXISTS(SELECT 1 FROM saas.accounting_accounts WHERE store_id=p_store AND id=account.id AND balance_cents::numeric=expected_balance AND version::numeric=account.version::numeric+1)
    OR(SELECT count(*) FROM saas.accounting_account_movements WHERE store_id=p_store AND event_id=event_id_value)<>1
    OR NOT EXISTS(SELECT 1 FROM saas.accounting_account_movements WHERE store_id=p_store AND event_id=event_id_value AND account_id=account.id
      AND amount_cents=(CASE WHEN p_kind='pay' THEN -amount ELSE amount END))
    OR EXISTS(SELECT 1 FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=event_id_value)
   THEN RAISE EXCEPTION 'SUPPLIERS241_LEDGER_POSTCONDITION';END IF;
   IF p_kind='pay' THEN
    payment_id_value:=p_operation;
    INSERT INTO saas.accounting_supplier_payments(id,store_id,event_id,debt_id,occurred_on,created_at,created_by)
    VALUES(payment_id_value,p_store,event_id_value,debt_id_value,(p_args->>'occurredOn')::date,clock_timestamp(),p_member);
   END IF;
   debt_after:=saas.accounting_suppliers_debt_projection(p_store,debt_id_value);
   payment_value:=saas.accounting_suppliers_payment_projection(p_store,payment_id_value);
   account_value:=saas.accounting_account_projection(p_store,account.id);
   IF debt_after IS NULL OR payment_value IS NULL OR account_value IS NULL
    OR(debt_after->>'version')::numeric<>expected_debt_version::numeric+1 OR(debt_after->>'dueCents')::numeric<>expected_due
    OR payment_value->>'debtId' IS DISTINCT FROM debt_id_value::text OR payment_value->>'accountId' IS DISTINCT FROM account.id::text
    OR payment_value->>'reversed' IS DISTINCT FROM(CASE WHEN p_kind='pay' THEN 'false' ELSE 'true' END)
    OR(p_kind='reversePayment' AND payment_value->>'reversalReason' IS DISTINCT FROM p_args->>'reason')
   THEN RAISE EXCEPTION 'SUPPLIERS241_SUPPLIER_POSTCONDITION';END IF;
  END IF;
 END IF;
 result:=jsonb_build_object('operationId',p_operation,'replayed',false,'kind',p_kind,'debt',debt_after,'payment',payment_value,'account',account_value,
  'previousDueCents',previous_due,'previousBalanceCents',previous_balance);
 INSERT INTO saas.accounting_supplier_operations(operation_id,store_id,actor_membership_id,kind,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation,p_store,p_member,p_kind,p_fingerprint,result,clock_timestamp());
 RETURN QUERY SELECT 'committed',result;
END $f$;

DO $grants$ DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_suppliers_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',f.signature);
  IF f.proname IN('accounting_suppliers_read','accounting_suppliers_mutate','accounting_suppliers_get_operation') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.signature);END IF;
 END LOOP;
END $grants$;
COMMIT;
