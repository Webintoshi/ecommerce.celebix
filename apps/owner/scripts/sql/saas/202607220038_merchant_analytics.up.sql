-- Phase 3H additive read-only merchant analytics authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL OR p_required_action IS NULL OR p_required_action NOT IN ('orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage','customers.read','customers.manage','customers.archive','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.import','catalog_admin.moderate','promotions.read','promotions.manage','promotions.archive','content.read','content.manage','content.archive','marketing.read','marketing.manage','configuration.read','configuration.manage','configuration.archive','integrations.read','integrations.manage','analytics.read') THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND s.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT m.role INTO membership_role FROM saas.memberships m WHERE m.id=p_membership_id AND m.store_id=p_store_id AND m.principal_id=p_principal_id AND m.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store_id AND s.plan_id=p_plan_id AND s.plan_code=p_plan_code AND s.plan_version=p_plan_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=p_plan_id AND f.enabled AND f.feature_key=p_required_feature) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (membership_role IN ('store_owner','admin') OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note','carts.read','customers.read','customers.manage','catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage','marketing.read','configuration.read','integrations.read','analytics.read')) OR (membership_role='analyst' AND p_required_action IN ('orders.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read','marketing.read','configuration.read','integrations.read','analytics.read'))) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END $f$;

CREATE FUNCTION saas.merchant_analytics_series(p_store_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_bucket text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH buckets AS (
    SELECT bucket_start, LEAST(bucket_start + CASE WHEN p_bucket='hour' THEN interval '1 hour' ELSE interval '1 day' END,p_end_at) AS bucket_end
    FROM pg_catalog.generate_series(p_start_at,CASE WHEN (pg_catalog.date_trunc(p_bucket,p_end_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')=p_end_at THEN p_end_at-interval '1 microsecond' ELSE pg_catalog.date_trunc(p_bucket,p_end_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' END,CASE WHEN p_bucket='hour' THEN interval '1 hour' ELSE interval '1 day' END) AS bucket_start
  ), values_by_bucket AS (
    SELECT b.bucket_start,COUNT(o.id)::bigint AS orders,COALESCE(SUM(o.total_cents::numeric),0)::bigint AS revenue_cents
    FROM buckets b LEFT JOIN saas.orders o ON o.store_id=p_store_id AND o.payment_status='completed' AND o.created_at>=b.bucket_start AND o.created_at<b.bucket_end
    GROUP BY b.bucket_start
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('startsAt',saas.merchant_admin_timestamp(bucket_start),'orders',orders,'revenueCents',revenue_cents) ORDER BY bucket_start),'[]'::jsonb) FROM values_by_bucket
$f$;

CREATE FUNCTION saas.merchant_analytics_top_products(p_store_id uuid,p_start_at timestamptz,p_end_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('productId',product_id,'title',title,'quantity',quantity,'revenueCents',revenue_cents) ORDER BY revenue_cents DESC,quantity DESC,product_id ASC,title ASC),'[]'::jsonb)
  FROM (
    SELECT item.product_id, item.product_name AS title,COALESCE(SUM(item.quantity::numeric),0)::bigint AS quantity,COALESCE(SUM(item.line_total_cents::numeric),0)::bigint AS revenue_cents
    FROM saas.order_items item JOIN saas.orders ord ON ord.store_id=item.store_id AND ord.id=item.order_id
    WHERE item.store_id=p_store_id AND item.product_id IS NOT NULL AND ord.store_id=p_store_id AND ord.payment_status='completed' AND ord.created_at>=p_start_at AND ord.created_at<p_end_at
    GROUP BY item.product_id,item.product_name
    ORDER BY revenue_cents DESC,quantity DESC,item.product_id ASC,item.product_name ASC
    LIMIT 20
  ) ranked
$f$;

CREATE FUNCTION saas.merchant_analytics_dashboard(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_period text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; start_at timestamptz; bucket text;
BEGIN
  IF p_period IS NULL OR p_period NOT IN ('today','week','month','year') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
  start_at:=CASE p_period WHEN 'today' THEN pg_catalog.date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN 'week' THEN pg_catalog.date_trunc('week',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN 'month' THEN pg_catalog.date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ELSE pg_catalog.date_trunc('year',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' END;
  bucket:=CASE WHEN p_period IN ('today','week') THEN 'hour' ELSE 'day' END;
  IF EXISTS(SELECT 1 FROM (SELECT COUNT(*) total,COUNT(*) FILTER(WHERE payment_status='completed') paid,COUNT(*) FILTER(WHERE status='cancelled') cancelled,COUNT(*) FILTER(WHERE status='refunded') refunded,COALESCE(SUM(total_cents::numeric) FILTER(WHERE payment_status='completed'),0) revenue FROM saas.orders WHERE store_id=p_store_id AND created_at>=start_at AND created_at<p_now) checked WHERE total>9007199254740991 OR paid>9007199254740991 OR cancelled>9007199254740991 OR refunded>9007199254740991 OR revenue>9007199254740991) OR EXISTS(SELECT 1 FROM (SELECT COUNT(*) FILTER(WHERE status='active') total,COUNT(*) FILTER(WHERE status='active' AND created_at>=start_at AND created_at<p_now) fresh FROM saas.customers WHERE store_id=p_store_id) checked WHERE total>9007199254740991 OR fresh>9007199254740991) OR EXISTS(SELECT 1 FROM (SELECT COUNT(DISTINCT product.id) FILTER(WHERE product.status='active') active,COUNT(variant.id) FILTER(WHERE variant.status='active' AND variant.stock_tracking AND variant.stock_quantity<=5) low FROM saas.products product LEFT JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id WHERE product.store_id=p_store_id) checked WHERE active>9007199254740991 OR low>9007199254740991) OR EXISTS(SELECT 1 FROM saas.order_items item JOIN saas.orders ord ON ord.store_id=item.store_id AND ord.id=item.order_id WHERE item.store_id=p_store_id AND item.product_id IS NOT NULL AND ord.store_id=p_store_id AND ord.payment_status='completed' AND ord.created_at>=start_at AND ord.created_at<p_now GROUP BY item.product_id,item.product_name HAVING SUM(item.quantity::numeric)>9007199254740991 OR SUM(item.line_total_cents::numeric)>9007199254740991) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY WITH
    order_stats AS (SELECT COUNT(*)::bigint total,COUNT(*) FILTER(WHERE payment_status='completed')::bigint paid,COUNT(*) FILTER(WHERE status='cancelled')::bigint cancelled,COUNT(*) FILTER(WHERE status='refunded')::bigint refunded,COALESCE(SUM(total_cents::numeric) FILTER(WHERE payment_status='completed'),0)::bigint revenue FROM saas.orders WHERE store_id=p_store_id AND created_at>=start_at AND created_at<p_now),
    customer_stats AS (SELECT COUNT(*) FILTER(WHERE status='active')::bigint total,COUNT(*) FILTER(WHERE status='active' AND created_at>=start_at AND created_at<p_now)::bigint fresh FROM saas.customers WHERE store_id=p_store_id),
    catalog_stats AS (SELECT COUNT(DISTINCT product.id) FILTER(WHERE product.status='active')::bigint active,COUNT(variant.id) FILTER(WHERE variant.status='active' AND variant.stock_tracking AND variant.stock_quantity<=5)::bigint low FROM saas.products product LEFT JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id WHERE product.store_id=p_store_id),
    store_currency AS (SELECT currency FROM saas.stores WHERE id=p_store_id)
  SELECT 'resolved',pg_catalog.jsonb_build_object('period',p_period,'rangeStart',saas.merchant_admin_timestamp(start_at),'rangeEnd',saas.merchant_admin_timestamp(p_now),'generatedAt',saas.merchant_admin_timestamp(p_now),'currency',store_currency.currency,'revenueCents',order_stats.revenue,'orders',pg_catalog.jsonb_build_object('total',order_stats.total,'paid',order_stats.paid,'cancelled',order_stats.cancelled,'refunded',order_stats.refunded),'customers',pg_catalog.jsonb_build_object('total',customer_stats.total,'newInPeriod',customer_stats.fresh),'catalog',pg_catalog.jsonb_build_object('activeProducts',catalog_stats.active,'lowStockVariants',catalog_stats.low),'series',saas.merchant_analytics_series(p_store_id,start_at,p_now,bucket),'topProducts',saas.merchant_analytics_top_products(p_store_id,start_at,p_now))
  FROM order_stats,customer_stats,catalog_stats,store_currency;
END $f$;

REVOKE ALL ON FUNCTION saas.merchant_analytics_series(uuid,timestamptz,timestamptz,text),saas.merchant_analytics_top_products(uuid,timestamptz,timestamptz),saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) TO celebix_saas_app;
COMMIT;
