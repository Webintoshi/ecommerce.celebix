-- A sealed V3 checkout must be the only public route to creating an order or
-- hosted attempt. The private trace must never be directly readable by apps.
DO $assertions$
DECLARE function_name text; selected regprocedure;
BEGIN
  IF pg_catalog.to_regclass('saas.pricing_checkout_bindings') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class relation
      WHERE relation.oid='saas.pricing_checkout_bindings'::regclass
        AND relation.relrowsecurity AND relation.relforcerowsecurity)
    OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.pricing_checkout_bindings','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.pricing_checkout_bindings','SELECT')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='saas.pricing_checkout_bindings'::regclass
        AND tgname='pricing_checkout_bindings_immutable' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'REFERENCE_CHECKOUT_BINDING_ASSERTION_FAILED'; END IF;
  FOREACH function_name IN ARRAY ARRAY[
    'public_checkout_quote_v3(text,timestamp with time zone,text,jsonb,jsonb,text[],jsonb)',
    'public_checkout_complete_v3(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[],text)',
    'public_storefront_hosted_checkout_authority_v3(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)',
    'public_storefront_hosted_checkout_begin_v3(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)'
  ] LOOP
    selected:=pg_catalog.to_regprocedure('saas.'||function_name);
    IF selected IS NULL OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',selected,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_app',selected,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',selected,'EXECUTE')
    THEN RAISE EXCEPTION 'REFERENCE_CHECKOUT_ENTRYPOINT_ASSERTION_FAILED: %',function_name; END IF;
  END LOOP;
  FOREACH function_name IN ARRAY ARRAY[
    'public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)',
    'public_checkout_complete_v2(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[])',
    'public_storefront_hosted_checkout_begin(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text)',
    'public_storefront_hosted_checkout_begin_v2(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)',
    'public_checkout_quote_v2(text,timestamp with time zone,text,jsonb,jsonb,text[],jsonb)',
    'public_storefront_hosted_checkout_authority_v2(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)',
    'pricing_checkout_source_context(uuid,text,jsonb,timestamp with time zone)',
    'pricing_checkout_quote_digest(text,jsonb)'
  ] LOOP
    selected:=pg_catalog.to_regprocedure('saas.'||function_name);
    IF selected IS NULL OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',selected,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',selected,'EXECUTE')
    THEN RAISE EXCEPTION 'REFERENCE_CHECKOUT_OLD_WRITE_OR_HELPER_ASSERTION_FAILED: %',function_name; END IF;
  END LOOP;
END $assertions$;
