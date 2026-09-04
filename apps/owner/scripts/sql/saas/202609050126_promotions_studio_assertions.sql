DO $fn$
DECLARE v_table text; v_count integer; v_proc regprocedure;
BEGIN
  SELECT count(*) INTO v_count FROM pg_catalog.pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations');
  IF v_count<>11 THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RELATION_COUNT_INVALID'; END IF;
  FOREACH v_table IN ARRAY ARRAY['promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=('saas.'||v_table)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RLS_INVALID:%',v_table; END IF;
  END LOOP;
  v_proc:=pg_catalog.to_regprocedure('saas.promotion_evaluate_v1(uuid,jsonb,timestamp with time zone)');
  IF v_proc IS NULL OR NOT pg_catalog.has_function_privilege('celebix_saas_owner',v_proc,'EXECUTE') THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_INVALID'; END IF;
  IF (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner' THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_OWNER_INVALID'; END IF;
  IF NOT saas.promotion_rule_document_valid(pg_catalog.jsonb_build_object('schemaVersion',1,'benefit',pg_catalog.jsonb_build_object('kind','free_shipping'),'targets',pg_catalog.jsonb_build_object('mode','all','include','[]'::jsonb,'exclude','[]'::jsonb),'audience',pg_catalog.jsonb_build_object('mode','everyone'),'trigger',pg_catalog.jsonb_build_object('kind','automatic'),'schedule',pg_catalog.jsonb_build_object('timezone','Europe/Istanbul'),'limits',pg_catalog.jsonb_build_object('totalUsage',NULL,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),'conditions',pg_catalog.jsonb_build_object('minimumBasketMinor',0,'minimumQuantity',0,'minimumProductQuantity',0),'combinationPolicy',pg_catalog.jsonb_build_object('kind','none'),'priority',0,'marginPolicy',pg_catalog.jsonb_build_object('kind','warn'),'progressMessagePolicy',pg_catalog.jsonb_build_object('enabled',false))) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RULE_VALIDATOR_INVALID'; END IF;
  IF pg_catalog.to_regprocedure('saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_commit_reservation_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_release_reservation_v1(uuid,uuid,uuid,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_recover_operation_v1(uuid,uuid,text,text)') IS NULL THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RPC_SURFACE_INVALID'; END IF;
END $fn$;
