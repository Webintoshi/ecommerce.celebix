-- Phase 3B2 quick-order link API signature, authority, deterministic projection and ACL assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3b2_quick_link_api_assertions$
DECLARE
  checked_signature text;
  checked_function regprocedure;
  function_source text;
  expected_volatility "char";
  create_source text;
  cancel_source text;
  duplicate_source text;
  list_source text;
  get_source text;
  recovery_source text;
  mutation_source text;
  detail_source text;
BEGIN
  FOREACH checked_signature IN ARRAY ARRAY[
    'saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,bigint,timestamp with time zone,uuid)',
    'saas.quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)',
    'saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)',
    'saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)',
    'saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)'
  ] LOOP
    checked_function := pg_catalog.to_regprocedure(checked_signature);
    IF checked_function IS NULL THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: missing signature %', checked_signature;
    END IF;
    expected_volatility := CASE
      WHEN checked_signature LIKE 'saas.quick_links_list(%'
        OR checked_signature LIKE 'saas.quick_links_get(%'
        OR checked_signature LIKE 'saas.quick_links_recover_operation(%' THEN 's'
      ELSE 'v'
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=procedure.proowner
      WHERE procedure.oid=checked_function
        AND owner_role.rolname='celebix_saas_owner'
        AND procedure.prosecdef
        AND procedure.proretset
        AND procedure.provolatile=expected_volatility
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.pg_get_function_result(procedure.oid)='TABLE(outcome text, result_payload jsonb)'
    ) THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: definer/result/volatility drift on %', checked_signature;
    END IF;
    IF pg_catalog.has_function_privilege('public',checked_function,'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',checked_function,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: API ACL drift on %', checked_signature;
    END IF;
    SELECT procedure.prosrc INTO function_source FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=checked_function;
    IF function_source !~ 'quick_link_merchant_authority_error\('
       OR function_source !~ 'p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now' THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: exact merchant authority call missing on %', checked_signature;
    END IF;
  END LOOP;

  FOREACH checked_signature IN ARRAY ARRAY[
    'saas.quick_links_json_timestamp(timestamp with time zone)',
    'saas.quick_links_mutation_projection(uuid,uuid)',
    'saas.quick_links_detail_projection(uuid,uuid,timestamp with time zone)'
  ] LOOP
    checked_function := pg_catalog.to_regprocedure(checked_signature);
    IF checked_function IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=procedure.proowner
      WHERE procedure.oid=checked_function
        AND owner_role.rolname='celebix_saas_owner'
        AND NOT procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: private helper drift on %', checked_signature;
    END IF;
    IF pg_catalog.has_function_privilege('public',checked_function,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',checked_function,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: private helper ACL drift on %', checked_signature;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='saas'
      AND procedure.proname LIKE 'quick_links_%'
      AND pg_catalog.has_function_privilege('celebix_saas_app',procedure.oid,'EXECUTE')
  ) <> 6
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
       WHERE namespace.nspname='saas' AND procedure.proname LIKE 'quick_links_%'
         AND pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE')
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS relation
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
       WHERE namespace.nspname='saas'
         AND relation.relname IN ('checkout_provider_configs','quick_order_links','quick_order_link_items','quick_order_link_operations')
         AND pg_catalog.has_table_privilege('celebix_saas_app',relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     ) THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: least-privilege boundary drift';
  END IF;

  SELECT prosrc INTO list_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,bigint,timestamp with time zone,uuid)'::regprocedure;
  SELECT prosrc INTO get_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure;
  SELECT prosrc INTO create_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'::regprocedure;
  SELECT prosrc INTO cancel_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)'::regprocedure;
  SELECT prosrc INTO duplicate_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)'::regprocedure;
  SELECT prosrc INTO recovery_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)'::regprocedure;
  SELECT prosrc INTO mutation_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_mutation_projection(uuid,uuid)'::regprocedure;
  SELECT prosrc INTO detail_source FROM pg_catalog.pg_proc WHERE oid='saas.quick_links_detail_projection(uuid,uuid,timestamp with time zone)'::regprocedure;

  IF list_source !~ 'p_page_size NOT BETWEEN 1 AND 100'
     OR list_source !~ 'link[.]created_at,link[.]id\) < \(p_cursor_created_at,p_cursor_id'
     OR list_source !~ 'ORDER BY link[.]created_at DESC, link[.]id DESC'
     OR list_source !~ 'LIMIT p_page_size \+ 1'
     OR list_source !~ 'link[.]status IN \(''active'',''opened''\) AND link[.]expires_at <= p_now'
     OR list_source !~ '''createdAt'', saas[.]quick_links_json_timestamp\(page[.]created_at\)'
     OR list_source !~ '''createdAt'', saas[.]quick_links_json_timestamp\(last_created_at\)'
     OR list_source ~ '\m(UPDATE|INSERT|DELETE)\M'
     OR get_source !~ 'quick_links_detail_projection\(p_store_id,p_link_id,p_now\)'
     OR get_source ~ '\m(UPDATE|INSERT|DELETE)\M' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: deterministic effective read drift';
  END IF;

  IF create_source !~ 'pg_advisory_xact_lock'
     OR pg_catalog.strpos(create_source,'WHERE operation.operation_id = p_operation_id') >= pg_catalog.strpos(create_source,'IF p_link_id IS NULL')
     OR create_source !~ 'FOR UPDATE OF product,variant'
     OR create_source !~ 'FOR SHARE OF provider,store'
     OR create_source !~ 'variant[.]store_id=p_store_id'
     OR create_source !~ 'variant[.]status=''active'' AND product[.]status=''active'''
     OR create_source !~ 'quick_link_canonical_image_url\(p_store_id,product_id,p_variant_ids\[item_position\]\)'
     OR create_source !~ 'provider[.]status=''active'' AND provider[.]provider_key=''paytr'''
     OR create_source !~ 'variant_price::numeric \* p_quantities\[item_position\]::numeric'
     OR create_source !~ 'subtotal \+ p_shipping_cents::numeric - p_discount_cents::numeric'
     OR create_source !~ '7999200000000000'
     OR create_source !~ '8500000000000000'
     OR create_source !~ 'quick_order_link_operations'
     OR create_source ~ 'RAISE EXCEPTION' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: atomic create/replay drift';
  END IF;

  IF cancel_source !~ 'pg_advisory_xact_lock'
     OR cancel_source !~ 'FOR UPDATE'
     OR cancel_source !~ 'current_link[.]version<>p_expected_version'
     OR cancel_source !~ 'current_link[.]status NOT IN \(''active'',''opened''\) OR current_link[.]expires_at<=p_now'
     OR cancel_source !~ 'status=''cancelled'',cancelled_at=p_now,version=version\+1,updated_at=p_now'
     OR cancel_source ~ 'RAISE EXCEPTION'
     OR duplicate_source !~ 'p_now\+interval ''24 hours'''
     OR duplicate_source !~ 'p_token_digest=source_link[.]token_digest OR p_sealed_token=source_link[.]sealed_token'
     OR duplicate_source !~ 'FOR UPDATE OF product,variant'
     OR duplicate_source !~ 'FOR SHARE OF provider,store'
     OR duplicate_source !~ 'quick_link_canonical_image_url\(p_store_id,product_id,source_item[.]variant_id\)'
     OR duplicate_source !~ 'variant_stock_quantity<source_item[.]quantity'
     OR pg_catalog.strpos(duplicate_source,'WHERE operation.operation_id=p_operation_id') >= pg_catalog.strpos(duplicate_source,'IF p_source_link_id IS NULL')
     OR duplicate_source ~ 'RAISE EXCEPTION' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: cancel/duplicate state or replay drift';
  END IF;

  IF recovery_source ~ 'FOR (UPDATE|SHARE)'
     OR recovery_source ~ 'pg_advisory'
     OR recovery_source ~ '\m(UPDATE|INSERT|DELETE)\M'
     OR recovery_source !~ 'existing_operation[.]operation_kind<>p_operation_kind'
     OR recovery_source !~ 'existing_operation[.]payload_fingerprint<>p_fingerprint'
     OR recovery_source ~ 'RAISE EXCEPTION'
     OR mutation_source !~ '''id'', link[.]id'
     OR mutation_source !~ '''status'', link[.]status'
     OR mutation_source !~ '''version'', link[.]version'
     OR mutation_source !~ '''expiresAt'', saas[.]quick_links_json_timestamp\(link[.]expires_at\)'
     OR mutation_source !~ '''updatedAt'', saas[.]quick_links_json_timestamp\(link[.]updated_at\)'
     OR mutation_source ~ '(token|digest|sealed|key_id)'
     OR detail_source ~ '(token_digest|sealed_token|token_key_id)'
     OR detail_source !~ 'link[.]status IN \(''active'',''opened''\) AND link[.]expires_at <= p_now' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: safe projection/recovery drift';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches(list_source,'''quick_links[.]read''','g')) <> 1
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches(get_source,'''quick_links[.]read''','g')) <> 1
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches(create_source,'''quick_links[.]manage''','g')) <> 1
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches(cancel_source,'''quick_links[.]manage''','g')) <> 1
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches(duplicate_source,'''quick_links[.]manage''','g')) <> 1
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches(recovery_source,'''quick_links[.]manage''','g')) <> 1 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_API_ASSERTION_FAILED: exact read/manage action drift';
  END IF;
END
$phase3b2_quick_link_api_assertions$;

ROLLBACK;
