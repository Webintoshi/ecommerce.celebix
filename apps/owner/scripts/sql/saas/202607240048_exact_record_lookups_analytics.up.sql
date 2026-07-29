-- Exact store-scoped catalog/merchant detail reads and rename-safe analytics.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_admin_get_resource(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_resource_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; projected jsonb;
BEGIN
  IF p_kind IS NULL OR p_resource_id IS NULL OR p_kind NOT IN(
    'collection','brand','attribute','extra','definition','tag'
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','catalog_admin.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  SELECT saas.catalog_admin_resource_projection(p_store_id,resource.id)
  INTO projected
  FROM saas.catalog_admin_resources AS resource
  WHERE resource.store_id=p_store_id
    AND resource.id=p_resource_id
    AND resource.resource_kind=p_kind;
  IF projected IS NULL THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'found',projected;
END
$f$;

CREATE FUNCTION saas.merchant_admin_get_record(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; projected jsonb;
BEGIN
  IF p_kind IS NULL OR p_record_id IS NULL OR p_kind NOT IN(
    'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign',
    'blog_post','page','policy','marketplace_connection','general_setting',
    'language_setting','payment_setting','shipping_setting','administrator_invite',
    'accounting_profile','invoice_integration','seo_control','sitemap','social_preview',
    'code_integration','indexing_request','notification_setting','hero_banner',
    'promotion_banner','marquee_setting','seo_geo_profile','seo_internal_link',
    'seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','ai_setting'
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,p_kind,false
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  SELECT saas.merchant_admin_projection(p_store_id,record.id)
  INTO projected
  FROM saas.merchant_admin_records AS record
  WHERE record.store_id=p_store_id
    AND record.id=p_record_id
    AND record.record_kind=p_kind;
  IF projected IS NULL THEN
    RETURN QUERY SELECT 'record_not_found',NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'found',projected;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_analytics_top_products(
  p_store_id uuid,p_start_at timestamptz,p_end_at timestamptz
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH eligible AS (
    SELECT item.id,item.product_id,item.product_name,item.quantity,item.line_total_cents,item.created_at
    FROM saas.order_items AS item
    JOIN saas.orders AS ord
      ON ord.store_id=item.store_id AND ord.id=item.order_id
    WHERE item.store_id=p_store_id
      AND item.product_id IS NOT NULL
      AND ord.store_id=p_store_id
      AND ord.payment_status='completed'
      AND ord.created_at>=p_start_at
      AND ord.created_at<p_end_at
  ), aggregated AS (
    SELECT product_id,
      COALESCE(SUM(quantity::numeric),0)::bigint AS quantity,
      COALESCE(SUM(line_total_cents::numeric),0)::bigint AS revenue_cents
    FROM eligible
    GROUP BY product_id
  ), latest_title AS (
    SELECT DISTINCT ON(product_id) product_id,product_name AS title
    FROM eligible
    ORDER BY product_id,created_at DESC,id DESC
  ), ranked AS (
    SELECT aggregated.product_id,latest_title.title,aggregated.quantity,aggregated.revenue_cents
    FROM aggregated
    JOIN latest_title USING(product_id)
    ORDER BY aggregated.revenue_cents DESC,aggregated.quantity DESC,aggregated.product_id ASC
    LIMIT 20
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'productId',product_id,'title',title,'quantity',quantity,'revenueCents',revenue_cents
      )
      ORDER BY revenue_cents DESC,quantity DESC,product_id ASC
    ),
    '[]'::jsonb
  )
  FROM ranked
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_analytics_dashboard(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_period text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; start_at timestamptz; bucket text;
BEGIN
  IF p_period IS NULL OR p_period NOT IN ('today','week','month','year') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
  start_at:=CASE p_period WHEN 'today' THEN pg_catalog.date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN 'week' THEN pg_catalog.date_trunc('week',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN 'month' THEN pg_catalog.date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ELSE pg_catalog.date_trunc('year',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' END;
  bucket:=CASE WHEN p_period IN ('today','week') THEN 'hour' ELSE 'day' END;
  IF EXISTS(SELECT 1 FROM (SELECT COUNT(*) total,COUNT(*) FILTER(WHERE payment_status='completed') paid,COUNT(*) FILTER(WHERE status='cancelled') cancelled,COUNT(*) FILTER(WHERE status='refunded') refunded,COALESCE(SUM(total_cents::numeric) FILTER(WHERE payment_status='completed'),0) revenue FROM saas.orders WHERE store_id=p_store_id AND created_at>=start_at AND created_at<p_now) checked WHERE total>9007199254740991 OR paid>9007199254740991 OR cancelled>9007199254740991 OR refunded>9007199254740991 OR revenue>9007199254740991) OR EXISTS(SELECT 1 FROM (SELECT COUNT(*) FILTER(WHERE status='active') total,COUNT(*) FILTER(WHERE status='active' AND created_at>=start_at AND created_at<p_now) fresh FROM saas.customers WHERE store_id=p_store_id) checked WHERE total>9007199254740991 OR fresh>9007199254740991) OR EXISTS(SELECT 1 FROM (SELECT COUNT(DISTINCT product.id) FILTER(WHERE product.status='active') active,COUNT(variant.id) FILTER(WHERE variant.status='active' AND variant.stock_tracking AND variant.stock_quantity<=5) low FROM saas.products product LEFT JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id WHERE product.store_id=p_store_id) checked WHERE active>9007199254740991 OR low>9007199254740991) OR EXISTS(SELECT 1 FROM saas.order_items item JOIN saas.orders ord ON ord.store_id=item.store_id AND ord.id=item.order_id WHERE item.store_id=p_store_id AND item.product_id IS NOT NULL AND ord.store_id=p_store_id AND ord.payment_status='completed' AND ord.created_at>=start_at AND ord.created_at<p_now GROUP BY item.product_id HAVING SUM(item.quantity::numeric)>9007199254740991 OR SUM(item.line_total_cents::numeric)>9007199254740991) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY WITH
    order_stats AS (SELECT COUNT(*)::bigint total,COUNT(*) FILTER(WHERE payment_status='completed')::bigint paid,COUNT(*) FILTER(WHERE status='cancelled')::bigint cancelled,COUNT(*) FILTER(WHERE status='refunded')::bigint refunded,COALESCE(SUM(total_cents::numeric) FILTER(WHERE payment_status='completed'),0)::bigint revenue FROM saas.orders WHERE store_id=p_store_id AND created_at>=start_at AND created_at<p_now),
    customer_stats AS (SELECT COUNT(*) FILTER(WHERE status='active')::bigint total,COUNT(*) FILTER(WHERE status='active' AND created_at>=start_at AND created_at<p_now)::bigint fresh FROM saas.customers WHERE store_id=p_store_id),
    catalog_stats AS (SELECT COUNT(DISTINCT product.id) FILTER(WHERE product.status='active')::bigint active,COUNT(variant.id) FILTER(WHERE variant.status='active' AND variant.stock_tracking AND variant.stock_quantity<=5)::bigint low FROM saas.products product LEFT JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id WHERE product.store_id=p_store_id),
    store_currency AS (SELECT currency FROM saas.stores WHERE id=p_store_id)
  SELECT 'resolved',pg_catalog.jsonb_build_object('period',p_period,'rangeStart',saas.merchant_admin_timestamp(start_at),'rangeEnd',saas.merchant_admin_timestamp(p_now),'generatedAt',saas.merchant_admin_timestamp(p_now),'currency',store_currency.currency,'revenueCents',order_stats.revenue,'orders',pg_catalog.jsonb_build_object('total',order_stats.total,'paid',order_stats.paid,'cancelled',order_stats.cancelled,'refunded',order_stats.refunded),'customers',pg_catalog.jsonb_build_object('total',customer_stats.total,'newInPeriod',customer_stats.fresh),'catalog',pg_catalog.jsonb_build_object('activeProducts',catalog_stats.active,'lowStockVariants',catalog_stats.low),'series',saas.merchant_analytics_series(p_store_id,start_at,p_now,bucket),'topProducts',saas.merchant_analytics_top_products(p_store_id,start_at,p_now))
  FROM order_stats,customer_stats,catalog_stats,store_currency;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.catalog_admin_get_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.merchant_analytics_top_products(uuid,timestamptz,timestamptz),
  saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.catalog_admin_get_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)
TO celebix_saas_app;

COMMIT;
