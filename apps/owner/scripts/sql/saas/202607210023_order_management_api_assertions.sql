-- Phase 3B1 order API signature, definer boundary, authority call and ACL assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3b1_order_api_assertions$
DECLARE
  checked_signature text;
  checked_function regprocedure;
  function_definition text;
  expected_volatility "char";
BEGIN
  FOREACH checked_signature IN ARRAY ARRAY[
    'saas.orders_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)',
    'saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'saas.orders_transition_payment(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'saas.orders_update_shipping(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb,jsonb)',
    'saas.orders_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)',
    'saas.orders_archive_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid)',
    'saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    checked_function := pg_catalog.to_regprocedure(checked_signature);
    IF checked_function IS NULL THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: missing signature %', checked_signature;
    END IF;
    expected_volatility := CASE
      WHEN checked_signature LIKE 'saas.orders_get_%' OR checked_signature LIKE 'saas.orders_list(%' OR checked_signature LIKE 'saas.orders_recover_%' THEN 's'
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
    ) THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: owner/definer/volatility/search_path drift on %', checked_signature;
    END IF;
    IF pg_catalog.has_function_privilege('public',checked_function,'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',checked_function,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: app/PUBLIC ACL drift on %', checked_signature;
    END IF;
    SELECT procedure.prosrc INTO function_definition FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=checked_function;
    IF function_definition !~ 'merchant_action_authority_error\('
       OR function_definition !~ 'p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now' THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: exact 022 authority call missing on %', checked_signature;
    END IF;
  END LOOP;

  FOREACH checked_signature IN ARRAY ARRAY[
    'saas.orders_json_timestamp(timestamp with time zone)',
    'saas.orders_cursor_timestamp(timestamp with time zone)',
    'saas.orders_address_valid(jsonb)',
    'saas.orders_tracking_valid(jsonb)',
    'saas.orders_mutation_projection(uuid,uuid)',
    'saas.orders_detail_projection(uuid,uuid)'
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
      RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: private helper drift on %', checked_signature;
    END IF;
    IF pg_catalog.has_function_privilege('public',checked_function,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',checked_function,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: helper ACL drift on %', checked_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas'
      AND relation.relname IN ('orders','order_items','order_events','order_notes','order_operations')
      AND pg_catalog.has_table_privilege('celebix_saas_app',relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: direct app table DML drift';
  END IF;

  IF (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'LIMIT p_page_size\+1'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'CASE WHEN p_sort=''highest'' THEN order_row[.]total_cents END DESC'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'CASE WHEN p_sort=''lowest'' THEN order_row[.]total_cents END ASC'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'CASE WHEN p_sort IN \(''newest'',''highest''\) THEN order_row[.]created_at END DESC'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'CASE WHEN p_sort IN \(''oldest'',''lowest''\) THEN order_row[.]created_at END ASC'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'CASE WHEN p_sort IN \(''newest'',''highest''\) THEN order_row[.]id END DESC'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'CASE WHEN p_sort IN \(''oldest'',''lowest''\) THEN order_row[.]id END ASC'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure),'CASE WHEN p_sort=''highest'' THEN candidates[.]total_cents END DESC','g')) <> 2
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure),'CASE WHEN p_sort=''lowest'' THEN candidates[.]total_cents END ASC','g')) <> 2
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure),'CASE WHEN p_sort IN \(''newest'',''highest''\) THEN candidates[.]created_at END DESC','g')) <> 2
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure),'CASE WHEN p_sort IN \(''oldest'',''lowest''\) THEN candidates[.]created_at END ASC','g')) <> 2
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure),'CASE WHEN p_sort IN \(''newest'',''highest''\) THEN candidates[.]id END DESC','g')) <> 2
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches((SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure),'CASE WHEN p_sort IN \(''oldest'',''lowest''\) THEN candidates[.]id END ASC','g')) <> 2
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'p_sort=''newest'' AND \(order_row[.]created_at,order_row[.]id\) < \(p_cursor_created_at,p_cursor_id\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'p_sort=''oldest'' AND \(order_row[.]created_at,order_row[.]id\) > \(p_cursor_created_at,p_cursor_id\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'p_sort=''highest'' AND \(order_row[.]total_cents,order_row[.]created_at,order_row[.]id\) < \(p_cursor_total_cents,p_cursor_created_at,p_cursor_id\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'p_sort=''lowest'' AND \(order_row[.]total_cents,order_row[.]created_at,order_row[.]id\) > \(p_cursor_total_cents,p_cursor_created_at,p_cursor_id\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'orders_cursor_timestamp\(last_created_at\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ '''totalCents'',last_total_cents'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ '''createdAt'',saas[.]orders_cursor_timestamp\(page[.]created_at\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure) !~ '''updatedAt'',saas[.]orders_cursor_timestamp\(page[.]updated_at\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure) !~ 'orders_detail_projection\(p_store_id,p_order_id\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_detail_projection(uuid,uuid)'::regprocedure) !~ 'order_events WHERE store_id=p_store_id AND order_id=p_order_id ORDER BY created_at DESC,id DESC LIMIT 200'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_detail_projection(uuid,uuid)'::regprocedure) !~ 'order_notes WHERE store_id=p_store_id AND order_id=p_order_id AND archived_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_detail_projection(uuid,uuid)'::regprocedure) !~ 'ORDER BY event[.]created_at,[[:space:]]*event[.]id'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_detail_projection(uuid,uuid)'::regprocedure) !~ 'ORDER BY note[.]created_at,[[:space:]]*note[.]id'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure) ~ 'FOR (UPDATE|SHARE)'
  THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: deterministic/read-only implementation drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='saas'
      AND procedure.proname IN ('orders_transition_status','orders_transition_payment','orders_update_shipping','orders_add_note','orders_archive_note')
     AND procedure.prosrc ~ 'orders_mutation_projection\(p_store_id,p_order_id\)'
  ) <> 5
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure) !~ 'stored_action'
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
       WHERE namespace.nspname='saas'
         AND procedure.proname IN ('orders_transition_status','orders_transition_payment','orders_update_shipping','orders_add_note','orders_archive_note')
         AND procedure.prosrc ~ 'operation[.]operation_id=p_operation_id AND operation[.]store_id=p_store_id FOR UPDATE'
     ) <> 5
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
       WHERE namespace.nspname='saas'
         AND procedure.proname IN ('orders_transition_status','orders_transition_payment','orders_update_shipping','orders_add_note','orders_archive_note')
         AND procedure.prosrc ~ 'EXCEPTION WHEN unique_violation THEN'
         AND procedure.prosrc !~ 'IF EXISTS \(SELECT 1 FROM saas[.]order_operations'
     ) <> 5
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_tracking_valid(jsonb)'::regprocedure) !~ 'orders_json_timestamp\(checked_shipped_at\)'
     OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid='saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure) !~ 'RETURN QUERY SELECT ''unavailable''::text,NULL::jsonb'
  THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_API_ASSERTION_FAILED: bounded replay/canonical input drift';
  END IF;
END
$phase3b1_order_api_assertions$;

ROLLBACK;
