-- Exact signature, least-privilege and source-shape proof for migration 027.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE signature text; checked regprocedure; source text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'saas.quick_links_get_provider_readiness(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.quick_links_configure_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,text,text,jsonb,uuid,text)',
    'saas.quick_links_revoke_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)',
    'saas.quick_links_reveal_credential(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.quick_links_reveal_provider_configuration(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.quick_links_recover_provider_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,text,text)'
  ] LOOP
    checked:=pg_catalog.to_regprocedure(signature);
    IF checked IS NULL OR pg_catalog.has_function_privilege('public',checked,'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',checked,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',checked,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: merchant ACL %',signature;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)',
    'saas.quick_links_resolve_redemption(text,text,timestamp with time zone)',
    'saas.quick_links_revoke_redemption(text,text,uuid,text,timestamp with time zone)',
    'saas.quick_links_recover_redemption_revoke(text,text,uuid,text,timestamp with time zone)',
    'saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)',
    'saas.checkout_mark_provider_ready(uuid,uuid,text,jsonb,text,timestamp with time zone)',
    'saas.checkout_mark_initiation_unknown(uuid,uuid,text,timestamp with time zone)',
    'saas.checkout_mark_initiation_failed(uuid,uuid,text,timestamp with time zone)',
    'saas.checkout_cleanup_pre_provider_attempts(uuid,uuid,text,timestamp with time zone,bigint)',
    'saas.checkout_recover_cleanup_operation(uuid,uuid,text)',
    'saas.checkout_get_payment_presentation(text,text,timestamp with time zone)',
    'saas.checkout_get_redemption_status(text,text,timestamp with time zone)',
    'saas.checkout_recover_attempt_operation(uuid,uuid,text,text)'
  ] LOOP
    checked:=pg_catalog.to_regprocedure(signature);
    IF checked IS NULL OR pg_catalog.has_function_privilege('public',checked,'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow',checked,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',checked,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: workflow ACL %',signature;
    END IF;
  END LOOP;
  IF NOT pg_catalog.has_schema_privilege('celebix_saas_workflow','saas','USAGE') THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: workflow schema usage';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relname IN (
      'checkout_provider_configs','quick_order_links','quick_order_link_items','quick_order_redemption_sessions',
      'checkout_payment_attempts','checkout_inventory_reservations','checkout_operations'
    ) AND pg_catalog.has_table_privilege('celebix_saas_workflow',relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: workflow direct table privilege'; END IF;
  SELECT procedure.prosrc INTO source FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz)'::regprocedure;
  IF pg_catalog.strpos(source,'FOR UPDATE OF link')=0
     OR pg_catalog.strpos(source,'FOR UPDATE OF link')>pg_catalog.strpos(source,'FOR SHARE')
     OR source!~'merchant_oid.*\^\[a-f0-9\]\{32\}\$'
     OR source!~'quick_checkout_customer_snapshot_is_valid\(current_link\)'
     OR source!~'ORDER BY product[.]id,variant[.]id FOR UPDATE'
     OR source!~'status IN \(''reserved'',''provider_ready'',''initiation_unknown''\)' THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: attempt authority drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_operations'::regclass
      AND conname='checkout_operations_provider_store_fk')
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute WHERE attrelid='saas.checkout_operations'::regclass
      AND attname IN ('provider_config_id','worker_id') AND NOT attisdropped)<>2 THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: provider operation authority drift';
  END IF;
END
$assertions$;

COMMIT;
