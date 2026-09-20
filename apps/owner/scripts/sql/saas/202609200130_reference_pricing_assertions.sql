-- Structural assertions; behavioral and role-isolation cases live in the PG16 harness.
DO $assertions$
DECLARE relation_name text; function_name text; function_oid regprocedure;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'pricing_reference_definitions','pricing_reference_sets','pricing_reference_set_values',
    'pricing_reference_state','pricing_variant_policy_versions','pricing_variant_policy_state',
    'pricing_reference_operations'
  ] LOOP
    IF pg_catalog.to_regclass('saas.'||relation_name) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='saas' AND relation.relname=relation_name
          AND relation.relrowsecurity AND relation.relforcerowsecurity)
      OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||relation_name,'SELECT')
      OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||relation_name,'INSERT')
      OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||relation_name,'UPDATE')
      OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||relation_name,'DELETE')
    THEN RAISE EXCEPTION 'REFERENCE_PRICING_TABLE_ASSERTION_FAILED: %',relation_name; END IF;
  END LOOP;
  FOREACH function_name IN ARRAY ARRAY[
    'pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)',
    'pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)',
    'pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid)',
    'pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb)',
    'pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,bigint)',
    'pricing_variant_policy_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'
  ] LOOP
    function_oid:=pg_catalog.to_regprocedure('saas.'||function_name);
    IF function_oid IS NULL
      OR NOT pg_catalog.has_function_privilege('celebix_saas_app',function_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',function_oid,'EXECUTE')
      OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc proc
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=proc.proowner
        WHERE proc.oid=function_oid AND proc.prosecdef
          AND owner_role.rolname='celebix_saas_owner')
    THEN RAISE EXCEPTION 'REFERENCE_PRICING_FUNCTION_ASSERTION_FAILED: %',function_name; END IF;
  END LOOP;
  FOREACH function_name IN ARRAY ARRAY[
    'pricing_calculate_variant_price(uuid,uuid,uuid)',
    'pricing_reference_scope_digest(uuid,uuid,timestamp with time zone)',
    'pricing_reference_set_projection(uuid,uuid)',
    'pricing_variant_policy_projection(uuid,uuid)'
  ] LOOP
    function_oid:=pg_catalog.to_regprocedure('saas.'||function_name);
    IF function_oid IS NULL OR pg_catalog.has_function_privilege('celebix_saas_app',function_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',function_oid,'EXECUTE')
    THEN RAISE EXCEPTION 'REFERENCE_PRICING_PRIVATE_HELPER_ASSERTION_FAILED: %',function_name; END IF;
  END LOOP;
  IF pg_catalog.to_regprocedure('saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='saas.product_variants'::regclass AND tgname='product_variants_pricing_policy_guard' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'REFERENCE_PRICING_RESOLVER_ASSERTION_FAILED'; END IF;
END $assertions$;
