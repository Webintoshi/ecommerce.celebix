DO $assertions$
DECLARE query_function regprocedure:=
  'saas.public_catalog_query_v2(text,timestamp with time zone,text,text,text,text,integer,integer)'::regprocedure;
  normalizer regprocedure:='saas.public_reference_pricing_safe_product(jsonb)'::regprocedure;
  drift_guard regprocedure:='saas.quick_link_current_prices_match(uuid,uuid,timestamp with time zone)'::regprocedure;
  creator text; generic_begin text; hosted_begin text; hosted_projection text;
BEGIN
  IF NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',query_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',query_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',query_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',normalizer,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',normalizer,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',normalizer,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',drift_guard,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_workflow',drift_guard,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',drift_guard,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',drift_guard,'EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc proc
      JOIN pg_catalog.pg_roles role ON role.oid=proc.proowner
      WHERE proc.oid=query_function AND proc.prosecdef AND role.rolname='celebix_saas_owner')
    OR pg_catalog.to_regprocedure('saas.public_list_products_without_reference_pricing(uuid,text,timestamp with time zone,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_campaign_product_projection_without_reference_pricing(uuid,uuid,timestamp with time zone)') IS NULL
  THEN RAISE EXCEPTION 'REFERENCE_PRICING_PUBLIC_ASSERTION_FAILED'; END IF;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.quick_links_create_hosted(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'::regprocedure
  ) INTO creator;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)'::regprocedure
  ) INTO generic_begin;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamp with time zone)'::regprocedure
  ) INTO hosted_begin;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.quick_order_hosted_payment_projection(text,text,timestamp with time zone)'::regprocedure
  ) INTO hosted_projection;
  IF pg_catalog.strpos(creator,'saas.resolve_effective_variant_price(')=0
    OR pg_catalog.strpos(creator,'saas.catalog.store:')=0
    OR pg_catalog.strpos(generic_begin,'saas.quick_link_current_prices_match(')=0
    OR pg_catalog.strpos(generic_begin,'saas.catalog.store:')=0
    OR pg_catalog.strpos(hosted_begin,'saas.quick_link_current_prices_match(')=0
    OR pg_catalog.strpos(hosted_begin,'saas.catalog.store:')=0
    OR pg_catalog.strpos(hosted_projection,'saas.quick_link_current_prices_match(')=0
    OR pg_catalog.strpos(generic_begin,'operation_replayed')>=pg_catalog.strpos(generic_begin,'saas.quick_link_current_prices_match(')
    OR pg_catalog.strpos(hosted_begin,'operation_mismatch')>=pg_catalog.strpos(hosted_begin,'saas.quick_link_current_prices_match(')
  THEN RAISE EXCEPTION 'REFERENCE_QUICK_PAYMENT_GUARD_ASSERTION_FAILED'; END IF;
END $assertions$;
