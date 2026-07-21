-- Exact signature, least-privilege and source-shape proof for migration 027.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE signature text; checked regprocedure; source text; callback_source text; reconciliation_source text;
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
    'saas.checkout_recover_attempt_operation(uuid,uuid,text,text)',
    'saas.checkout_get_callback_authority(text,timestamp with time zone)',
    'saas.checkout_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,integer,text,text,uuid,uuid[],uuid,text,timestamp with time zone)',
    'saas.checkout_begin_reconciliation_run(uuid,text,timestamp with time zone,timestamp with time zone)',
    'saas.checkout_claim_reconciliation(uuid,timestamp with time zone,timestamp with time zone,bigint)',
    'saas.checkout_claim_redemption_reconciliation(text,text,uuid,timestamp with time zone,timestamp with time zone)',
    'saas.checkout_apply_reconciliation_success(text,uuid,text,uuid,text,bigint,bigint,text,integer,uuid,uuid[],uuid,text,timestamp with time zone)',
    'saas.checkout_record_reconciliation_unknown(text,uuid,text,uuid,text,timestamp with time zone,timestamp with time zone)',
    'saas.checkout_finish_reconciliation_run(uuid,text,timestamp with time zone)',
    'saas.checkout_recover_callback(text,text,uuid,text)',
    'saas.checkout_recover_reconciliation(text,uuid,text)',
    'saas.checkout_recover_reconciliation_run(uuid,text,timestamp with time zone)'
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
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='saas' AND pg_catalog.has_function_privilege('celebix_saas_workflow',procedure.oid,'EXECUTE'))<>24 THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: workflow exact function count';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relkind IN ('r','p','v','m')
      AND pg_catalog.has_table_privilege('celebix_saas_workflow',relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: workflow direct table privilege'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_sequences AS sequence_row WHERE sequence_row.schemaname='saas'
      AND pg_catalog.has_sequence_privilege('celebix_saas_workflow',
        pg_catalog.format('%I.%I',sequence_row.schemaname,sequence_row.sequencename),'USAGE,SELECT,UPDATE')
  ) THEN RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: workflow direct sequence privilege'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_workflow'
      AND (rolinherit OR rolbypassrls OR rolsuper OR rolcanlogin)) THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: workflow role attributes';
  END IF;
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
  SELECT procedure.prosrc INTO source FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamptz)'::regprocedure;
  IF pg_catalog.strpos(source,'SELECT attempt.* INTO current_attempt')=0
     OR pg_catalog.strpos(source,'SELECT link.* INTO current_link')<=pg_catalog.strpos(source,'SELECT attempt.* INTO current_attempt')
     OR pg_catalog.strpos(source,'ORDER BY variant.id FOR UPDATE')<=pg_catalog.strpos(source,'SELECT link.* INTO current_link')
     OR pg_catalog.strpos(source,'ORDER BY reservation.variant_id,reservation.id FOR UPDATE')<=pg_catalog.strpos(source,'ORDER BY variant.id FOR UPDATE')
     OR source!~'current_link[.]customer_name' OR source!~'item_record[.]product_name'
     OR source!~'actor_membership_id,event_type' OR source!~'''order_created''' THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: settlement core drift';
  END IF;
  SELECT procedure.prosrc INTO callback_source FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.checkout_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,integer,text,text,uuid,uuid[],uuid,text,timestamptz)'::regprocedure;
  SELECT procedure.prosrc INTO reconciliation_source FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.checkout_apply_reconciliation_success(text,uuid,text,uuid,text,bigint,bigint,text,integer,uuid,uuid[],uuid,text,timestamptz)'::regprocedure;
  IF callback_source!~'quick_checkout_settle_success_core'
     OR reconciliation_source!~'quick_checkout_settle_success_core'
     OR pg_catalog.strpos(callback_source,'SELECT receipt.* INTO existing_receipt')>
        pg_catalog.strpos(callback_source,'quick_checkout_settle_success_core')
     OR callback_source!~'p_total_amount<p_payment_amount'
     OR reconciliation_source!~'p_total_amount<p_payment_amount' THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: settlement wrapper drift';
  END IF;
  SELECT procedure.prosrc INTO source FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.checkout_claim_reconciliation(uuid,timestamptz,timestamptz,bigint)'::regprocedure;
  IF source!~'FOR UPDATE OF attempt SKIP LOCKED LIMIT p_claim_limit'
     OR source!~'p_claim_limit NOT BETWEEN 1 AND 25'
     OR source!~'job[.]attempt_number<1000'
     OR source!~'FOR UPDATE OF run'
     OR source!~'current_run[.]worker_id IS DISTINCT FROM p_worker_id'
     OR source!~'p_lease_expires_at>current_run[.]lease_expires_at' THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: reconciliation claim drift';
  END IF;
  SELECT procedure.prosrc INTO source FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.quick_checkout_random_lease_token()'::regprocedure;
  IF pg_catalog.regexp_count(source,'gen_random_uuid')<3 OR source!~'sha256' OR source!~'''base64''' THEN
    RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: reconciliation token entropy drift';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'saas.quick_checkout_token_digest(text)',
    'saas.quick_checkout_digest_matches(text,text)',
    'saas.quick_checkout_random_lease_token()',
    'saas.quick_checkout_attempt_authority_projection(uuid)',
    'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)',
    'saas.quick_checkout_reconciliation_projection(uuid,uuid,text,integer)'
  ] LOOP
    checked:=signature::regprocedure;
    IF pg_catalog.has_function_privilege('public',checked,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',checked,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',checked,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B2_CHECKOUT_API_ASSERTION_FAILED: helper ACL %',signature;
    END IF;
  END LOOP;
END
$assertions$;

COMMIT;
