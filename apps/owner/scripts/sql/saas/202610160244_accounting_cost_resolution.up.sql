-- Read-only fallback for missing historical cost. Current catalogue cost is explicitly identified.
-- Install disabled; enable only after both shared panel readers accept provenance fields.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
CREATE TABLE saas.accounting_cost_244_backup(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[]);
ALTER TABLE saas.accounting_cost_244_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.accounting_cost_244_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.accounting_cost_244_backup FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator;
DO $predecessor$
DECLARE signature_value text:='saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)';expected_sha text:='7215040bfe2ae1c186505a1e13bf57a2a9ecb0df78e7dced354899fe08bd68ad';
BEGIN
 IF to_regclass('saas.accounting_discount_243_backup') IS NULL OR to_regprocedure(signature_value) IS NULL
  OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature_value)),'UTF8')),'hex')<>expected_sha
 THEN RAISE EXCEPTION 'ACCOUNTING244_PREDECESSOR243_REQUIRED';END IF;
 INSERT INTO saas.accounting_cost_244_backup SELECT signature_value,pg_get_functiondef(p.oid),expected_sha,NULL,p.oid,p.proowner,p.proacl FROM pg_proc p WHERE p.oid=to_regprocedure(signature_value);
END $predecessor$;
ALTER TABLE saas.accounting_release_state ADD COLUMN cost_catalog_fallback_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION saas.accounting_profitability_read(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_filters jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;tz text;start_at timestamptz;end_at timestamptz;result jsonb;catalog_enabled boolean;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_profitability_filters_valid(p_filters) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 start_at:=(p_filters->>'dateFrom')::date::timestamp AT TIME ZONE tz;
 end_at:=((p_filters->>'dateTo')::date+1)::timestamp AT TIME ZONE tz;
 catalog_enabled:=coalesce((SELECT cost_catalog_fallback_enabled FROM saas.accounting_release_state WHERE singleton),false);
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
   s.cost_sign*(coalesce(c.known_cost,0)+CASE WHEN trusted.catalog_trusted THEN coalesce(live.catalog_cost,0) ELSE 0 END) known_cost,
   s.cost_sign=0 OR (c.item_count>0 AND c.item_count=c.max_observed AND c.all_known AND c.same_currency
    AND NOT EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations bad WHERE bad.store_id=p_store AND bad.order_id=s.order_id)
    AND (o.id IS NULL
     OR (live_count.item_count=c.item_count
      AND NOT EXISTS(SELECT 1 FROM saas.order_items i LEFT JOIN saas.accounting_profitability_line_costs frozen ON frozen.store_id=i.store_id AND frozen.item_id=i.id
       WHERE i.store_id=p_store AND i.order_id=s.order_id AND(frozen.item_id IS NULL OR frozen.order_id<>i.order_id OR frozen.quantity<>i.quantity)))))
    OR (trusted.catalog_trusted AND live.item_count>0 AND live.resolved_item_count=live.item_count) cost_complete,
   s.cost_sign<>0 AND trusted.catalog_trusted AND live.catalog_item_count>0 catalog_order,
   CASE WHEN s.cost_sign<>0 AND trusted.catalog_trusted THEN s.cost_sign*coalesce(live.catalog_cost,0) ELSE 0 END catalog_cost
  FROM sales s LEFT JOIN LATERAL(
   SELECT count(*) item_count,max(f.observed_line_count) max_observed,bool_and(f.unit_cost_cents IS NOT NULL) all_known,
    bool_and(f.currency=s.currency) same_currency,coalesce(sum(f.unit_cost_cents::numeric*f.quantity),0) known_cost
   FROM saas.accounting_profitability_line_costs f WHERE f.store_id=p_store AND f.order_id=s.order_id
  ) c ON true
  LEFT JOIN saas.orders o ON o.store_id=p_store AND o.id=s.order_id
  LEFT JOIN LATERAL(SELECT count(*) item_count FROM saas.order_items i WHERE i.store_id=p_store AND i.order_id=s.order_id) live_count ON o.id IS NOT NULL
  LEFT JOIN LATERAL(
   SELECT count(*) item_count,
    count(*) FILTER(WHERE frozen.item_id IS NOT NULL AND frozen.order_id=i.order_id) matched_snapshot_count,
    bool_and(frozen.item_id IS NULL OR (frozen.order_id=i.order_id AND frozen.currency=s.currency AND frozen.quantity=i.quantity)) snapshots_match,
    count(*) FILTER(WHERE frozen.unit_cost_cents IS NOT NULL OR catalog.cost_cents IS NOT NULL) resolved_item_count,
    count(*) FILTER(WHERE frozen.unit_cost_cents IS NULL AND catalog.cost_cents IS NOT NULL) catalog_item_count,
    coalesce(sum(catalog.cost_cents::numeric*i.quantity) FILTER(WHERE frozen.unit_cost_cents IS NULL),0) catalog_cost
   FROM saas.order_items i
   LEFT JOIN saas.accounting_profitability_line_costs frozen ON frozen.store_id=i.store_id AND frozen.item_id=i.id
   LEFT JOIN LATERAL(
    SELECT coalesce(exact.cost_cents,shared.cost_cents) cost_cents FROM saas.products p
    LEFT JOIN saas.product_variants exact ON exact.store_id=p.store_id AND exact.product_id=p.id AND exact.id=i.variant_id
    LEFT JOIN LATERAL(
     SELECT min(canonical.cost_cents) cost_cents FROM saas.product_variants canonical
     WHERE canonical.store_id=p.store_id AND canonical.product_id=p.id
     HAVING count(canonical.cost_cents)>0 AND min(canonical.cost_cents)=max(canonical.cost_cents)
    ) shared ON exact.cost_cents IS NULL
    WHERE p.store_id=i.store_id AND p.id=i.product_id AND p.currency=s.currency
     AND (i.variant_id IS NULL OR exact.id IS NOT NULL)
   ) catalog ON frozen.unit_cost_cents IS NULL
   WHERE catalog_enabled AND o.id IS NOT NULL AND i.store_id=p_store AND i.order_id=s.order_id
  ) live ON true
  LEFT JOIN LATERAL(SELECT catalog_enabled AND o.id IS NOT NULL AND o.currency=s.currency
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations bad WHERE bad.store_id=p_store AND bad.order_id=s.order_id)
   AND coalesce(c.same_currency,true) AND c.item_count=live.matched_snapshot_count
   AND coalesce(c.max_observed,0)<=live.item_count AND coalesce(live.snapshots_match,false) catalog_trusted) trusted ON true
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
   coalesce((SELECT sum(coalesce((metadata->>'discountCents')::numeric,0)*sign) FROM period_events WHERE currency=code.currency AND kind='collection'),0) discounts,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='expense'),0) expenses,
   coalesce((SELECT sum(amount) FROM supplier_groups WHERE currency=code.currency),0) supplier_payments,
   coalesce((SELECT sum((metadata->>'commissionCents')::numeric*sign) FROM period_events WHERE currency=code.currency AND kind='card_settlement'),0) commissions,
   coalesce((SELECT sum(known_cost) FROM costs WHERE currency=code.currency),0) known_cost,
   coalesce((SELECT sum(catalog_cost) FROM costs WHERE currency=code.currency),0) catalog_cost,
   (SELECT count(*) FROM costs WHERE currency=code.currency AND catalog_order) catalog_orders,
   coalesce((SELECT sum(amount) FROM costs WHERE currency=code.currency AND cost_complete),0) costed_sales,
   (SELECT count(*) FROM costs WHERE currency=code.currency AND cost_complete IS NOT TRUE) missing_cost,
   (SELECT count(*) FROM unresolved_returns WHERE currency=code.currency) unresolved_returns,
   (SELECT count(*) FROM supplier_groups WHERE currency=code.currency AND amount<>0) unclassified_supplier_payments
  FROM codes code
 ),calculated AS(
  SELECT *,sales-returns-discounts net_sales,expenses-supplier_payments operating_expenses,
   collections-refunds-expenses-commissions net_cash,
   CASE WHEN missing_cost=0 AND unresolved_returns=0 THEN sales-returns-discounts-known_cost ELSE NULL END gross_profit
  FROM sums
 ),final AS(
  SELECT *,CASE WHEN unclassified_supplier_payments=0 THEN gross_profit-operating_expenses-commissions ELSE NULL END profit FROM calculated
 )
 SELECT CASE WHEN EXISTS(SELECT 1 FROM final WHERE greatest(abs(sales),abs(returns),abs(net_sales),abs(discounts),abs(collections),abs(refunds),abs(expenses),abs(supplier_payments),abs(operating_expenses),abs(commissions),abs(net_cash),abs(known_cost),abs(catalog_cost),catalog_orders,abs(costed_sales),missing_cost,unresolved_returns,unclassified_supplier_payments,coalesce(abs(gross_profit),0),coalesce(abs(profit),0))>9007199254740991)
  THEN NULL ELSE jsonb_build_object('dateFrom',p_filters->>'dateFrom','dateTo',p_filters->>'dateTo',
   'currencies',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'salesCents',sales,'returnCents',returns,'netSalesCents',net_sales,
    'collectionsCents',collections,'refundsCents',refunds,'expensesCents',expenses,'supplierPaymentsCents',supplier_payments,
    'operatingExpensesCents',operating_expenses,'commissionCents',commissions,'netCashCents',net_cash,'knownCostCents',known_cost,
    'costedSalesCents',costed_sales,'missingCostOrderCount',missing_cost,'unresolvedReturnCount',unresolved_returns,
    'unclassifiedSupplierPaymentCount',unclassified_supplier_payments,'grossProfitCents',gross_profit,'profitCents',profit)||CASE WHEN discounts<>0 THEN jsonb_build_object('discountCents',discounts) ELSE '{}'::jsonb END||CASE WHEN catalog_orders>0 THEN jsonb_build_object('catalogCostOrderCount',catalog_orders,'catalogCostCents',catalog_cost) ELSE '{}'::jsonb END ORDER BY currency) FROM final),'[]'::jsonb)) END INTO result;
 IF result IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',result;
END $function$
;
UPDATE saas.accounting_cost_244_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
CREATE TRIGGER accounting_immutable BEFORE UPDATE OR DELETE ON saas.accounting_cost_244_backup FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable();
COMMIT;
