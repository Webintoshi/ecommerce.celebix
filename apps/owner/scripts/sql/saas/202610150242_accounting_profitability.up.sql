-- Recorded sales, money received and cost-based profit are separate measures.
-- Historical catalogue prices are never used to manufacture historical costs.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $predecessor$
BEGIN
 IF to_regclass('saas.accounting_supplier_payments') IS NULL
  OR to_regprocedure('saas.accounting_web_payment_evidence(uuid)') IS NULL
  OR to_regprocedure('saas.permanent_order_deletion_context(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'PROFITABILITY242_PREDECESSOR_REQUIRED';END IF;
END $predecessor$;

-- Plain order/item UUID snapshots intentionally survive authorized order deletion.
-- A catalogue cost may exceed JavaScript's safe range; capture it without rejecting a sale.
CREATE TABLE saas.accounting_profitability_line_costs(
 store_id uuid NOT NULL REFERENCES saas.stores(id),order_id uuid NOT NULL,item_id uuid NOT NULL,
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 9999),
 unit_cost_cents bigint CHECK(unit_cost_cents>=0),observed_line_count bigint NOT NULL CHECK(observed_line_count BETWEEN 1 AND 9007199254740991),
 captured_at timestamptz NOT NULL CHECK(isfinite(captured_at)),PRIMARY KEY(store_id,item_id)
);
CREATE INDEX accounting_profitability_line_costs_order ON saas.accounting_profitability_line_costs(store_id,order_id,item_id);
CREATE TABLE saas.accounting_profitability_cost_invalidations(
 store_id uuid NOT NULL REFERENCES saas.stores(id),order_id uuid NOT NULL,item_id uuid NOT NULL,
 reason text NOT NULL CHECK(reason IN('item_changed','item_removed')),
 captured_at timestamptz NOT NULL CHECK(isfinite(captured_at)),PRIMARY KEY(store_id,order_id,item_id)
);
DO $private$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['accounting_profitability_line_costs','accounting_profitability_cost_invalidations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',t);
  EXECUTE format('CREATE TRIGGER accounting_immutable BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable()',t);
  EXECUTE format('CREATE TRIGGER platform_support_journal_write AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',t);
 END LOOP;
END $private$;

CREATE FUNCTION saas.accounting_profitability_capture_line() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE currency_value text;cost_value bigint;observed bigint;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT o.currency INTO STRICT currency_value FROM saas.orders o WHERE o.store_id=NEW.store_id AND o.id=NEW.order_id;
  SELECT v.cost_cents INTO cost_value FROM saas.product_variants v
   JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id
   WHERE v.store_id=NEW.store_id AND v.id=NEW.variant_id AND p.currency=currency_value;
  SELECT count(*) INTO observed FROM saas.order_items i WHERE i.store_id=NEW.store_id AND i.order_id=NEW.order_id;
  INSERT INTO saas.accounting_profitability_line_costs(store_id,order_id,item_id,currency,quantity,unit_cost_cents,observed_line_count,captured_at)
   VALUES(NEW.store_id,NEW.order_id,NEW.id,currency_value,NEW.quantity,cost_value,observed,clock_timestamp())
   ON CONFLICT(store_id,item_id) DO NOTHING;
  IF NOT FOUND THEN
   -- Reusing a deleted identifier must not block a valid order or adopt an old cost.
   INSERT INTO saas.accounting_profitability_cost_invalidations(store_id,order_id,item_id,reason,captured_at)
    SELECT f.store_id,f.order_id,f.item_id,'item_changed',clock_timestamp() FROM saas.accounting_profitability_line_costs f
     WHERE f.store_id=NEW.store_id AND f.item_id=NEW.id ON CONFLICT DO NOTHING;
   INSERT INTO saas.accounting_profitability_cost_invalidations(store_id,order_id,item_id,reason,captured_at)
    VALUES(NEW.store_id,NEW.order_id,NEW.id,'item_changed',clock_timestamp()) ON CONFLICT DO NOTHING;
  END IF;
 ELSIF TG_OP='DELETE' THEN
  IF saas.permanent_order_deletion_context(OLD.store_id,OLD.order_id) IS DISTINCT FROM true THEN
   INSERT INTO saas.accounting_profitability_cost_invalidations(store_id,order_id,item_id,reason,captured_at)
    VALUES(OLD.store_id,OLD.order_id,OLD.id,'item_removed',clock_timestamp()) ON CONFLICT DO NOTHING;
  END IF;
 ELSIF ROW(NEW.store_id,NEW.order_id,NEW.id,NEW.quantity,NEW.unit_price_cents,NEW.discount_cents,NEW.line_total_cents)
  IS DISTINCT FROM ROW(OLD.store_id,OLD.order_id,OLD.id,OLD.quantity,OLD.unit_price_cents,OLD.discount_cents,OLD.line_total_cents)
  OR(NEW.variant_id IS NOT NULL AND NEW.variant_id IS DISTINCT FROM OLD.variant_id)
  OR(NEW.product_id IS NOT NULL AND NEW.product_id IS DISTINCT FROM OLD.product_id) THEN
  INSERT INTO saas.accounting_profitability_cost_invalidations(store_id,order_id,item_id,reason,captured_at)
   VALUES(OLD.store_id,OLD.order_id,OLD.id,'item_changed',clock_timestamp()) ON CONFLICT DO NOTHING;
  IF ROW(NEW.store_id,NEW.order_id,NEW.id) IS DISTINCT FROM ROW(OLD.store_id,OLD.order_id,OLD.id) THEN
   INSERT INTO saas.accounting_profitability_cost_invalidations(store_id,order_id,item_id,reason,captured_at)
    VALUES(NEW.store_id,NEW.order_id,NEW.id,'item_changed',clock_timestamp()) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN NULL;
END $f$;
CREATE TRIGGER accounting_profitability_capture_line AFTER INSERT OR UPDATE OR DELETE ON saas.order_items
 FOR EACH ROW EXECUTE FUNCTION saas.accounting_profitability_capture_line();

CREATE FUNCTION saas.accounting_profitability_filters_valid(p_filters jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE k text;v jsonb;start_date date;end_date date;
BEGIN
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR pg_column_size(p_filters)>2048
  OR NOT(p_filters?&ARRAY['dateFrom','dateTo']) OR (SELECT count(*) FROM jsonb_object_keys(p_filters)) NOT IN(2,3) THEN RETURN false;END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_filters) LOOP
  IF jsonb_typeof(v)<>'string' THEN RETURN false;END IF;
  IF k IN('dateFrom','dateTo') THEN
   IF v#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(v#>>'{}',4)='0000' THEN RETURN false;END IF;
   IF to_char((v#>>'{}')::date,'YYYY-MM-DD')<>v#>>'{}' THEN RETURN false;END IF;
  ELSIF k='currency' THEN IF v#>>'{}'!~'^[A-Z]{3}$' THEN RETURN false;END IF;
  ELSE RETURN false;END IF;
 END LOOP;
 start_date:=(p_filters->>'dateFrom')::date;end_date:=(p_filters->>'dateTo')::date;
 RETURN end_date>=start_date AND end_date-start_date<=365;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $f$;

CREATE FUNCTION saas.accounting_profitability_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_filters jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;tz text;start_at timestamptz;end_at timestamptz;result jsonb;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_profitability_filters_valid(p_filters) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 start_at:=(p_filters->>'dateFrom')::date::timestamp AT TIME ZONE tz;
 end_at:=((p_filters->>'dateTo')::date+1)::timestamp AT TIME ZONE tz;
 WITH period_events AS MATERIALIZED(
  SELECT e.id,coalesce(orig.id,e.id) original_id,coalesce(orig.kind,e.kind) kind,e.currency,
   CASE WHEN e.kind='reversal' THEN -e.amount_cents::numeric ELSE e.amount_cents::numeric END amount,
   coalesce(orig.metadata,e.metadata) metadata,CASE WHEN e.kind='reversal' THEN -1 ELSE 1 END sign,
   coalesce(e.order_id,e.deleted_order_id,orig.order_id,orig.deleted_order_id) order_id
  FROM saas.accounting_events e LEFT JOIN saas.accounting_events orig ON orig.store_id=e.store_id AND orig.id=e.reverses_event_id
  WHERE e.store_id=p_store AND e.occurred_at>=start_at AND e.occurred_at<end_at
   AND(NOT(p_filters?'currency') OR e.currency=p_filters->>'currency')
 ),web AS MATERIALIZED(
  SELECT w.order_id,w.currency,w.amount_cents::numeric amount FROM saas.accounting_web_payment_evidence(p_store) w
  WHERE w.received_at>=start_at AND w.received_at<end_at AND(NOT(p_filters?'currency') OR w.currency=p_filters->>'currency')
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND coalesce(r.order_id,r.deleted_order_id)=w.order_id)
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_events e WHERE e.store_id=p_store AND e.kind='sale' AND coalesce(e.order_id,e.deleted_order_id)=w.order_id)
 ),legacy_pos_sales AS MATERIALIZED(
  SELECT s.order_id,o.currency,s.total_cents::numeric amount FROM saas.in_store_sales s JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id
  WHERE s.store_id=p_store AND s.status='completed' AND s.completed_at>=start_at AND s.completed_at<end_at
   AND(NOT(p_filters?'currency') OR o.currency=p_filters->>'currency')
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND coalesce(r.order_id,r.deleted_order_id)=s.order_id)
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_events e WHERE e.store_id=p_store AND e.kind='sale' AND coalesce(e.order_id,e.deleted_order_id)=s.order_id)
 ),legacy_pos_receipts AS MATERIALIZED(
  SELECT o.currency,a.amount_cents::numeric amount FROM saas.in_store_payment_attestations a JOIN saas.in_store_sales s ON s.store_id=a.store_id AND s.id=a.sale_id
  JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id
  WHERE s.store_id=p_store AND s.status='completed' AND a.received_at>=start_at AND a.received_at<end_at
   AND(NOT(p_filters?'currency') OR o.currency=p_filters->>'currency')
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND coalesce(r.order_id,r.deleted_order_id)=s.order_id)
 ),sale_evidence AS MATERIALIZED(
  SELECT order_id,currency,amount,sign FROM period_events WHERE kind='sale'
  UNION ALL SELECT order_id,currency,amount,1 FROM web
  UNION ALL SELECT order_id,currency,amount,1 FROM legacy_pos_sales
 ),sales AS MATERIALIZED(
  SELECT order_id,currency,sum(amount) amount,sign(sum(sign)) cost_sign FROM sale_evidence GROUP BY order_id,currency
 ),costs AS MATERIALIZED(
  SELECT s.order_id,s.currency,s.amount,
   s.cost_sign*coalesce(c.known_cost,0) known_cost,
   s.cost_sign=0 OR (c.item_count>0 AND c.item_count=c.max_observed AND c.all_known AND c.same_currency
    AND NOT EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations bad WHERE bad.store_id=p_store AND bad.order_id=s.order_id)
    AND (NOT EXISTS(SELECT 1 FROM saas.orders o WHERE o.store_id=p_store AND o.id=s.order_id)
     OR ((SELECT count(*) FROM saas.order_items i WHERE i.store_id=p_store AND i.order_id=s.order_id)=c.item_count
      AND NOT EXISTS(SELECT 1 FROM saas.order_items i LEFT JOIN saas.accounting_profitability_line_costs frozen ON frozen.store_id=i.store_id AND frozen.item_id=i.id
       WHERE i.store_id=p_store AND i.order_id=s.order_id AND(frozen.item_id IS NULL OR frozen.order_id<>i.order_id OR frozen.quantity<>i.quantity))))) cost_complete
  FROM sales s LEFT JOIN LATERAL(
   SELECT count(*) item_count,max(f.observed_line_count) max_observed,bool_and(f.unit_cost_cents IS NOT NULL) all_known,
    bool_and(f.currency=s.currency) same_currency,coalesce(sum(f.unit_cost_cents::numeric*f.quantity),0) known_cost
   FROM saas.accounting_profitability_line_costs f WHERE f.store_id=p_store AND f.order_id=s.order_id
  ) c ON true
 ),supplier_groups AS MATERIALIZED(
  SELECT e.currency,e.original_id,sum(e.amount) amount FROM period_events e
  JOIN saas.accounting_supplier_payments payment ON payment.store_id=p_store AND payment.event_id=e.original_id
  WHERE e.kind='expense' GROUP BY e.currency,e.original_id
 ),return_groups AS MATERIALIZED(
  SELECT e.currency,coalesce(e.order_id,e.original_id) order_id,sum(e.amount) amount FROM period_events e WHERE e.kind='return_credit'
  GROUP BY e.currency,coalesce(e.order_id,e.original_id)
 ),provider_links AS MATERIALIZED(
  SELECT s.order_id,s.payment_attempt_id attempt_id FROM saas.storefront_hosted_checkout_sessions s WHERE s.store_id=p_store AND s.order_id IS NOT NULL
  UNION SELECT b.order_id,b.attempt_id FROM saas.quick_order_hosted_payment_bridges b WHERE b.store_id=p_store
 ),dated_returns AS MATERIALIZED(
  -- These records prove a return occurred, but do not prove refunded quantity or cost.
  SELECT o.id order_id,o.currency,o.refunded_at occurred_at FROM saas.orders o WHERE o.store_id=p_store AND o.refunded_at IS NOT NULL
  UNION SELECT o.id,o.currency,e.created_at FROM saas.order_events e JOIN saas.orders o ON o.store_id=e.store_id AND o.id=e.order_id
   WHERE e.store_id=p_store AND e.event_type IN('payment_transition','status_transition') AND e.to_value='refunded'
  UNION SELECT o.id,o.currency,e.occurred_at FROM provider_links link
   JOIN saas.payment_attempt_events e ON e.store_id=p_store AND e.attempt_id=link.attempt_id
   JOIN saas.orders o ON o.store_id=p_store AND o.id=link.order_id
   WHERE e.to_status IN('partially_refunded','refunded')
 ),unresolved_returns AS MATERIALIZED(
  SELECT currency,order_id FROM return_groups WHERE amount<>0
  UNION SELECT r.currency,r.order_id FROM dated_returns r WHERE r.occurred_at<end_at
   AND(r.occurred_at>=start_at OR EXISTS(SELECT 1 FROM sales s WHERE s.order_id=r.order_id AND s.currency=r.currency AND s.cost_sign<>0))
   AND(NOT(p_filters?'currency') OR r.currency=p_filters->>'currency')
  UNION SELECT s.currency,s.order_id FROM sales s JOIN saas.orders o ON o.store_id=p_store AND o.id=s.order_id
   WHERE s.cost_sign<>0 AND (o.payment_status='refunded' OR o.status='refunded'
    OR EXISTS(SELECT 1 FROM provider_links link JOIN saas.payment_attempts attempt ON attempt.store_id=p_store AND attempt.id=link.attempt_id
     WHERE link.order_id=s.order_id AND attempt.status IN('partially_refunded','refunded')))
    AND NOT EXISTS(SELECT 1 FROM dated_returns r WHERE r.order_id=s.order_id)
 ),codes AS(
  SELECT currency FROM period_events UNION SELECT currency FROM web UNION SELECT currency FROM legacy_pos_sales UNION SELECT currency FROM legacy_pos_receipts
   UNION SELECT currency FROM unresolved_returns
 ),sums AS(
  SELECT code.currency,
   coalesce((SELECT sum(amount) FROM sales WHERE currency=code.currency),0) sales,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='return_credit'),0) returns,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='collection'),0)
    +coalesce((SELECT sum(amount) FROM web WHERE currency=code.currency),0)+coalesce((SELECT sum(amount) FROM legacy_pos_receipts WHERE currency=code.currency),0) collections,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='refund'),0) refunds,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='expense'),0) expenses,
   coalesce((SELECT sum(amount) FROM supplier_groups WHERE currency=code.currency),0) supplier_payments,
   coalesce((SELECT sum((metadata->>'commissionCents')::numeric*sign) FROM period_events WHERE currency=code.currency AND kind='card_settlement'),0) commissions,
   coalesce((SELECT sum(known_cost) FROM costs WHERE currency=code.currency),0) known_cost,
   coalesce((SELECT sum(amount) FROM costs WHERE currency=code.currency AND cost_complete),0) costed_sales,
   (SELECT count(*) FROM costs WHERE currency=code.currency AND cost_complete IS NOT TRUE) missing_cost,
   (SELECT count(*) FROM unresolved_returns WHERE currency=code.currency) unresolved_returns,
   (SELECT count(*) FROM supplier_groups WHERE currency=code.currency AND amount<>0) unclassified_supplier_payments
  FROM codes code
 ),calculated AS(
  SELECT *,sales-returns net_sales,expenses-supplier_payments operating_expenses,
   collections-refunds-expenses-commissions net_cash,
   CASE WHEN missing_cost=0 AND unresolved_returns=0 THEN sales-returns-known_cost ELSE NULL END gross_profit
  FROM sums
 ),final AS(
  SELECT *,CASE WHEN unclassified_supplier_payments=0 THEN gross_profit-operating_expenses-commissions ELSE NULL END profit FROM calculated
 )
 SELECT CASE WHEN EXISTS(SELECT 1 FROM final WHERE greatest(abs(sales),abs(returns),abs(net_sales),abs(collections),abs(refunds),abs(expenses),abs(supplier_payments),abs(operating_expenses),abs(commissions),abs(net_cash),abs(known_cost),abs(costed_sales),missing_cost,unresolved_returns,unclassified_supplier_payments,coalesce(abs(gross_profit),0),coalesce(abs(profit),0))>9007199254740991)
  THEN NULL ELSE jsonb_build_object('dateFrom',p_filters->>'dateFrom','dateTo',p_filters->>'dateTo',
   'currencies',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'salesCents',sales,'returnCents',returns,'netSalesCents',net_sales,
    'collectionsCents',collections,'refundsCents',refunds,'expensesCents',expenses,'supplierPaymentsCents',supplier_payments,
    'operatingExpensesCents',operating_expenses,'commissionCents',commissions,'netCashCents',net_cash,'knownCostCents',known_cost,
    'costedSalesCents',costed_sales,'missingCostOrderCount',missing_cost,'unresolvedReturnCount',unresolved_returns,
    'unclassifiedSupplierPaymentCount',unclassified_supplier_payments,'grossProfitCents',gross_profit,'profitCents',profit) ORDER BY currency) FROM final),'[]'::jsonb)) END INTO result;
 IF result IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',result;
END $f$;

DO $functions$ DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_profitability_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',f.signature);
  IF f.proname='accounting_profitability_read' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.signature);END IF;
 END LOOP;
END $functions$;
COMMIT;
