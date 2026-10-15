-- A repayment plan describes existing debt. It never creates a money movement.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $predecessors$
BEGIN
 IF to_regclass('saas.cashier_238_function_backup') IS NULL
  OR to_regprocedure('saas.platform_support_begin(uuid,uuid,uuid,text)') IS NULL
  OR to_regprocedure('saas.accounting_sales_channel_matches_v4(uuid,uuid,uuid,jsonb,text)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.accounting_receivables'::regclass AND attname='deleted_order_number' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'ACCOUNTING239_PREDECESSOR_REQUIRED';END IF;
END $predecessors$;

CREATE TABLE saas.accounting_schedule_239_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[]
);
INSERT INTO saas.accounting_schedule_239_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl
 FROM pg_proc p WHERE p.oid IN('saas.accounting_receivable_projection(uuid,uuid)'::regprocedure,
  'saas.accounting_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)'::regprocedure);

CREATE FUNCTION saas.accounting_schedule_installments_valid(p_items jsonb,p_total bigint DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE item jsonb;previous_date date;item_date date;total numeric:=0;amount numeric;
BEGIN
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RETURN false;END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 36 OR pg_column_size(p_items)>16384
  OR p_total IS NOT NULL AND p_total NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item)<>'object' THEN RETURN false;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR NOT(item?&ARRAY['dueDate','amountCents'])
   OR jsonb_typeof(item->'dueDate')<>'string' OR item->>'dueDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(item->>'dueDate',4)='0000'
   OR jsonb_typeof(item->'amountCents')<>'number' THEN RETURN false;END IF;
  item_date:=(item->>'dueDate')::date;
  IF to_char(item_date,'YYYY-MM-DD')<>item->>'dueDate' OR previous_date IS NOT NULL AND item_date<=previous_date THEN RETURN false;END IF;
  amount:=(item->>'amountCents')::numeric;
  IF amount<>trunc(amount) OR amount NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false;END IF;
  total:=total+amount;IF total>9007199254740991 THEN RETURN false;END IF;
  previous_date:=item_date;
 END LOOP;
 RETURN p_total IS NULL OR total=p_total;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $f$;

CREATE TABLE saas.accounting_schedule_plans(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),receivable_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
 planned_cents bigint NOT NULL CHECK(planned_cents BETWEEN 1 AND 9007199254740991),installments jsonb NOT NULL,
 created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
 UNIQUE(store_id,id),UNIQUE(store_id,receivable_id,version),
 FOREIGN KEY(store_id,receivable_id) REFERENCES saas.accounting_receivables(store_id,id),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id),
 CHECK(saas.accounting_schedule_installments_valid(installments,planned_cents))
);
CREATE INDEX accounting_schedule_latest ON saas.accounting_schedule_plans(store_id,receivable_id,version DESC);
CREATE TABLE saas.accounting_schedule_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),receivable_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,payload_fingerprint text NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'),committed_at timestamptz NOT NULL CHECK(isfinite(committed_at)),
 FOREIGN KEY(store_id,operation_id) REFERENCES saas.accounting_schedule_plans(store_id,id),
 FOREIGN KEY(store_id,receivable_id) REFERENCES saas.accounting_receivables(store_id,id),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id)
);
DO $tables$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['accounting_schedule_239_backup','accounting_schedule_plans','accounting_schedule_operations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['accounting_schedule_plans','accounting_schedule_operations'] LOOP
  EXECUTE format('CREATE TRIGGER accounting_immutable BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable()',t);
  EXECUTE format('CREATE TRIGGER platform_support_journal_write AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',t);
 END LOOP;
END $tables$;

-- Coverage intentionally includes both collected and returned amounts: it is
-- "covered debt", not a claim that the customer paid each installment in cash.
CREATE FUNCTION saas.accounting_schedule_parts(p_items jsonb,p_due bigint)
RETURNS TABLE(installment_position integer,due_date date,amount_cents bigint,covered_cents bigint,due_cents bigint)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE item record;remaining bigint;total bigint;
BEGIN
 IF p_due IS NULL OR p_due NOT BETWEEN 0 AND 9007199254740991 OR NOT saas.accounting_schedule_installments_valid(p_items,NULL)
 THEN RAISE EXCEPTION 'ACCOUNTING239_INVALID_PARTS';END IF;
 SELECT sum((value->>'amountCents')::bigint)::bigint INTO total FROM jsonb_array_elements(p_items);
 remaining:=greatest(total-p_due,0);
 FOR item IN SELECT value,ordinality FROM jsonb_array_elements(p_items) WITH ORDINALITY LOOP
  installment_position:=item.ordinality::integer;due_date:=(item.value->>'dueDate')::date;amount_cents:=(item.value->>'amountCents')::bigint;
  covered_cents:=least(remaining,amount_cents);due_cents:=amount_cents-covered_cents;remaining:=remaining-covered_cents;
  RETURN NEXT;
 END LOOP;
END $f$;

-- The optional residual is the reopened part beyond the latest plan. Its only
-- possible date is the pre-existing receivable date; a missing date stays NULL.
CREATE FUNCTION saas.accounting_schedule_obligations(p_store uuid,p_receivable uuid)
RETURNS TABLE(installment_position integer,due_date date,amount_cents bigint,covered_cents bigint,due_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE debt saas.accounting_receivables%ROWTYPE;plan saas.accounting_schedule_plans%ROWTYPE;actual_due bigint;residual bigint;
BEGIN
 SELECT * INTO debt FROM saas.accounting_receivables WHERE store_id=p_store AND id=p_receivable;
 IF NOT FOUND THEN RETURN;END IF;
 actual_due:=greatest(debt.sale_cents-debt.return_cents-debt.collected_cents,0);
 SELECT * INTO plan FROM saas.accounting_schedule_plans WHERE store_id=p_store AND receivable_id=p_receivable ORDER BY version DESC LIMIT 1;
 IF FOUND THEN
  RETURN QUERY SELECT * FROM saas.accounting_schedule_parts(plan.installments,actual_due);
  residual:=greatest(actual_due-plan.planned_cents,0);
 ELSE residual:=actual_due;END IF;
 IF residual>0 THEN installment_position:=NULL;due_date:=debt.due_date;amount_cents:=residual;covered_cents:=0;due_cents:=residual;RETURN NEXT;END IF;
END $f$;
CREATE FUNCTION saas.accounting_schedule_next_due(p_store uuid,p_receivable uuid) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT min(due_date) FROM saas.accounting_schedule_obligations(p_store,p_receivable) WHERE due_cents>0
$f$;
CREATE FUNCTION saas.accounting_schedule_overdue_cents(p_store uuid,p_receivable uuid,p_today date) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(sum(due_cents),0)::bigint FROM saas.accounting_schedule_obligations(p_store,p_receivable) WHERE due_cents>0 AND due_date<p_today
$f$;
CREATE FUNCTION saas.accounting_schedule_projection(p_store uuid,p_receivable uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('receivable',saas.accounting_receivable_projection(p_store,r.id),'hasPlan',plan.id IS NOT NULL,
  'plannedCents',coalesce(plan.planned_cents,0),'unplannedCents',greatest(r.sale_cents-r.return_cents-r.collected_cents-coalesce(plan.planned_cents,0),0),
  'installments',coalesce((SELECT jsonb_agg(jsonb_build_object('dueDate',due_date,'amountCents',amount_cents,'coveredCents',covered_cents,'dueCents',due_cents) ORDER BY installment_position)
   FROM saas.accounting_schedule_obligations(p_store,r.id) WHERE installment_position IS NOT NULL),'[]'::jsonb))
 FROM saas.accounting_receivables r LEFT JOIN LATERAL(SELECT id,planned_cents FROM saas.accounting_schedule_plans WHERE store_id=p_store AND receivable_id=r.id ORDER BY version DESC LIMIT 1) plan ON true
 WHERE r.store_id=p_store AND r.id=p_receivable
$f$;
CREATE FUNCTION saas.accounting_schedule_filters_valid(p_filters jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' THEN RETURN false;END IF;
 IF pg_column_size(p_filters)>4096 OR p_filters?'amountCents'
  OR NOT saas.accounting_filters_valid(p_filters-'dueStatus') THEN RETURN false;END IF;
 IF p_filters?'dueStatus' AND (jsonb_typeof(p_filters->'dueStatus')<>'string' OR p_filters->>'dueStatus' NOT IN('all','today','overdue','upcoming','undated')) THEN RETURN false;END IF;
 RETURN true;
END $f$;
CREATE FUNCTION saas.accounting_schedule_status_matches(p_store uuid,p_receivable uuid,p_today date,p_status text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT p_status='all' OR EXISTS(SELECT 1 FROM saas.accounting_schedule_obligations(p_store,p_receivable) WHERE due_cents>0 AND CASE p_status
  WHEN 'today' THEN due_date=p_today WHEN 'overdue' THEN due_date<p_today WHEN 'upcoming' THEN due_date>p_today WHEN 'undated' THEN due_date IS NULL ELSE false END)
$f$;

-- Preserve exact old result keys and all current retention/channel/support patches.
DO $patch$
DECLARE saved record;definition text;anchor text;replacement text;
BEGIN
 IF (SELECT count(*) FROM saas.accounting_schedule_239_backup)<>2 THEN RAISE EXCEPTION 'ACCOUNTING239_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.accounting_schedule_239_backup ORDER BY signature LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s'
   AND p.proacl IS NOT DISTINCT FROM saved.function_acl AND p.proconfig @> ARRAY['search_path=pg_catalog, saas'])
  THEN RAISE EXCEPTION 'ACCOUNTING239_PREDECESSOR_AUTHORITY_DRIFT: %',saved.signature;END IF;
  definition:=saved.definition;
  IF saved.signature LIKE 'saas.accounting_receivable_projection(%' THEN
   anchor:=$old$'dueDate',r.due_date$old$;
   replacement:=$new$'dueDate',CASE WHEN EXISTS(SELECT 1 FROM saas.accounting_schedule_plans WHERE store_id=p_store AND receivable_id=r.id) THEN saas.accounting_schedule_next_due(p_store,r.id) ELSE r.due_date END$new$;
  ELSE
   anchor:=$old$coalesce((SELECT sum(greatest(sale_cents-return_cents-collected_cents,0)::numeric) FROM saas.accounting_receivables WHERE store_id=p_store AND currency=code.currency AND saas.accounting_sales_channel_matches_v4(p_store,id,order_id,NULL,p_filters->>'salesChannel') AND due_date<(p_now AT TIME ZONE tz)::date AND (NOT(p_filters?'channel') OR channel=p_filters->>'channel')),0) overdue,$old$;
   replacement:=$new$coalesce((SELECT sum(saas.accounting_schedule_overdue_cents(p_store,id,(p_now AT TIME ZONE tz)::date)::numeric) FROM saas.accounting_receivables WHERE store_id=p_store AND currency=code.currency AND saas.accounting_sales_channel_matches_v4(p_store,id,order_id,NULL,p_filters->>'salesChannel') AND (NOT(p_filters?'channel') OR channel=p_filters->>'channel')),0) overdue,$new$;
  END IF;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ACCOUNTING239_SOURCE_DRIFT: %',saved.signature;END IF;
  EXECUTE replace(definition,anchor,replacement);
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=saved.function_oid AND proowner=saved.function_owner AND proacl IS NOT DISTINCT FROM saved.function_acl)
  THEN RAISE EXCEPTION 'ACCOUNTING239_PUBLISH_AUTHORITY_DRIFT: %',saved.signature;END IF;
  UPDATE saas.accounting_schedule_239_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') WHERE signature=saved.signature;
 END LOOP;
END $patch$;

CREATE FUNCTION saas.accounting_schedule_list(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_filters jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;tz text;today date;start_at timestamptz;end_at timestamptz;due_status text;result jsonb;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_schedule_filters_valid(p_filters) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 today:=(p_now AT TIME ZONE tz)::date;due_status:=coalesce(p_filters->>'dueStatus','all');
 start_at:=CASE WHEN p_filters?'dateFrom' THEN (p_filters->>'dateFrom')::date::timestamp AT TIME ZONE tz ELSE '-infinity'::timestamptz END;
 end_at:=CASE WHEN p_filters?'dateTo' THEN ((p_filters->>'dateTo')::date+1)::timestamp AT TIME ZONE tz ELSE 'infinity'::timestamptz END;
 WITH candidates AS(
  SELECT r.id,r.occurred_at,saas.accounting_schedule_next_due(p_store,r.id) next_due
  FROM saas.accounting_receivables r LEFT JOIN saas.customers c ON c.store_id=r.store_id AND c.id=r.customer_id
  LEFT JOIN saas.orders o ON o.store_id=r.store_id AND o.id=r.order_id
  WHERE r.store_id=p_store AND (NOT(p_filters?'customerId') OR r.customer_id=(p_filters->>'customerId')::uuid)
   AND (NOT(p_filters?'orderId') OR r.order_id=(p_filters->>'orderId')::uuid)
   AND (NOT(p_filters?'currency') OR r.currency=p_filters->>'currency') AND (NOT(p_filters?'channel') OR r.channel=p_filters->>'channel')
   AND saas.accounting_sales_channel_matches_v4(p_store,r.id,r.order_id,NULL,p_filters->>'salesChannel')
   AND r.occurred_at>=start_at AND r.occurred_at<end_at
   AND (NOT(p_filters?'query') OR concat_ws(' ',r.customer_snapshot->>'name',c.first_name,c.last_name,r.customer_snapshot->>'phone',c.phone,coalesce(o.order_number,r.deleted_order_number)) ILIKE '%'||replace(replace(replace(p_filters->>'query','\','\\'),'%','\%'),'_','\_')||'%')
   AND saas.accounting_schedule_status_matches(p_store,r.id,today,due_status)
  ORDER BY next_due NULLS LAST,r.occurred_at,r.id LIMIT 201
 ),visible AS(SELECT * FROM candidates ORDER BY next_due NULLS LAST,occurred_at,id LIMIT 200)
 SELECT jsonb_build_object('schedules',coalesce((SELECT jsonb_agg(saas.accounting_schedule_projection(p_store,id) ORDER BY next_due NULLS LAST,occurred_at,id) FROM visible),'[]'::jsonb),
  'today',today,'hasMore',(SELECT count(*)>200 FROM candidates)) INTO result;
 RETURN QUERY SELECT 'found',result;
END $f$;
CREATE FUNCTION saas.accounting_schedule_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_receivable uuid)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;result jsonb;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_receivable IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 result:=saas.accounting_schedule_projection(p_store,p_receivable);
 IF result IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;ELSE RETURN QUERY SELECT 'found',result;END IF;
END $f$;
CREATE FUNCTION saas.accounting_schedule_get_operation(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_expected_fingerprint text DEFAULT NULL)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_schedule_operations%ROWTYPE;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_schedule_operations WHERE operation_id=p_operation AND store_id=p_store;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND prior.payload_fingerprint<>p_expected_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('replayed',true);
END $f$;
CREATE FUNCTION saas.accounting_schedule_mutate(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text,p_intent jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_schedule_operations%ROWTYPE;debt saas.accounting_receivables%ROWTYPE;receivable uuid;actual_due bigint;result jsonb;customer_version bigint;
BEGIN
 PERFORM saas.platform_support_begin(p_store,p_principal,p_member,'accounting_schedule_mutate');
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_intent IS NULL OR jsonb_typeof(p_intent)<>'object'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF pg_column_size(p_intent)>16384 OR (SELECT count(*) FROM jsonb_object_keys(p_intent))<>3 OR NOT(p_intent?&ARRAY['receivableId','expectedVersion','installments'])
  OR jsonb_typeof(p_intent->'receivableId')<>'string' OR p_intent->>'receivableId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_intent->'expectedVersion')<>'number'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF (p_intent->>'expectedVersion')::numeric<>trunc((p_intent->>'expectedVersion')::numeric)
  OR (p_intent->>'expectedVersion')::numeric NOT BETWEEN 1 AND 9007199254740991 OR NOT saas.accounting_schedule_installments_valid(p_intent->'installments',NULL)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 receivable:=(p_intent->>'receivableId')::uuid;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.schedule.operation:'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store::text,0));
 PERFORM 1 FROM saas.memberships WHERE store_id=p_store AND id=p_member FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan FOR SHARE;
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_schedule_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.store_id=p_store AND prior.receivable_id=receivable AND prior.payload_fingerprint=p_fingerprint AND (prior.actor_membership_id=p_member OR saas.in_store_is_manager(p_store,p_member))
  THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);
  ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 SELECT * INTO debt FROM saas.accounting_receivables WHERE store_id=p_store AND id=receivable FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF debt.version<>(p_intent->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 actual_due:=greatest(debt.sale_cents-debt.return_cents-debt.collected_cents,0);
 IF actual_due=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_schedule_installments_valid(p_intent->'installments',actual_due) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF debt.version>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 IF debt.customer_id IS NOT NULL THEN
  SELECT version INTO customer_version FROM saas.accounting_customer_versions WHERE store_id=p_store AND customer_id=debt.customer_id AND currency=debt.currency FOR UPDATE;
  IF customer_version>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 END IF;
 INSERT INTO saas.accounting_schedule_plans(id,store_id,receivable_id,actor_membership_id,version,planned_cents,installments,created_at)
 VALUES(p_operation,p_store,receivable,p_member,debt.version+1,actual_due,p_intent->'installments',p_now);
 UPDATE saas.accounting_receivables SET version=version+1 WHERE store_id=p_store AND id=receivable;
 PERFORM saas.accounting_bump_customer(p_store,debt.customer_id,debt.currency);
 result:=jsonb_build_object('operationId',p_operation,'replayed',false,'schedule',saas.accounting_schedule_projection(p_store,receivable));
 INSERT INTO saas.accounting_schedule_operations(operation_id,store_id,receivable_id,actor_membership_id,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation,p_store,receivable,p_member,p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'committed',result;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;

DO $grants$ DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_schedule_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',f.signature);
  IF f.proname IN('accounting_schedule_list','accounting_schedule_read','accounting_schedule_mutate','accounting_schedule_get_operation') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.signature);END IF;
 END LOOP;
END $grants$;
COMMIT;
