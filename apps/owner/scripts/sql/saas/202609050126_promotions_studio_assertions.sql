DO $fn$
DECLARE v_table text; v_count integer; v_proc regprocedure; v_role text; v_privilege text;
BEGIN
  SELECT count(*) INTO v_count FROM pg_catalog.pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations');
  IF v_count<>11 THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RELATION_COUNT_INVALID'; END IF;
  FOREACH v_table IN ARRAY ARRAY['promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=('saas.'||v_table)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RLS_INVALID:%',v_table; END IF;
    FOREACH v_role IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_identity'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF pg_catalog.has_table_privilege(v_role,('saas.'||v_table)::regclass,v_privilege) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_DIRECT_TABLE_PRIVILEGE_INVALID:%:%:%',v_role,v_table,v_privilege; END IF;
      END LOOP;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE((SELECT relacl FROM pg_catalog.pg_class WHERE oid=('saas.'||v_table)::regclass),'{}'::aclitem[])) acl WHERE acl.grantee=0) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_PUBLIC_TABLE_PRIVILEGE_INVALID:%',v_table; END IF;
  END LOOP;
  SELECT count(*) INTO v_count FROM pg_catalog.pg_constraint WHERE connamespace='saas'::regnamespace AND conname IN ('promotion_code_batches_operation_store_fk','promotion_codes_batch_store_fk','promotion_usage_reservations_version_store_fk','promotion_usage_reservations_code_store_fk','promotion_usage_reservations_operation_store_fk','promotion_usage_reservations_customer_store_fk','promotion_redemptions_version_store_fk','promotion_redemptions_code_store_fk','promotion_redemptions_reservation_store_fk','promotion_redemptions_operation_store_fk','promotion_redemptions_customer_store_fk','promotion_redemptions_order_store_fk','order_promotion_snapshots_order_store_fk','order_promotion_snapshots_version_store_fk','order_discount_allocations_snapshot_store_fk','order_discount_allocations_order_store_fk','order_discount_allocations_line_store_fk') AND convalidated;
  IF v_count<>17 THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_COMPOSITE_FOREIGN_KEYS_INVALID:%',v_count; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_constraint constraint_row JOIN pg_catalog.pg_class relation ON relation.oid=constraint_row.conrelid WHERE relation.relnamespace='saas'::regnamespace AND relation.relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations') AND constraint_row.contype='f' AND NOT constraint_row.convalidated) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_UNVALIDATED_FOREIGN_KEY'; END IF;
  v_proc:=pg_catalog.to_regprocedure('saas.promotion_evaluate_v1(uuid,jsonb,timestamp with time zone)');
  IF v_proc IS NULL OR NOT pg_catalog.has_function_privilege('celebix_saas_owner',v_proc,'EXECUTE') THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_INVALID'; END IF;
  IF (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner' THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_OWNER_INVALID'; END IF;
  IF pg_catalog.to_regprocedure('saas.promotion_evaluator_context_valid(uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_line_matches(jsonb,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_catalog_line_matches(uuid,text,jsonb,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_audience_matches(uuid,jsonb,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_gift_variant_valid(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_abandoned_cart_valid(uuid,jsonb,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_combination_compatible(jsonb,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_empty_result(text,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_operation_authority_lock_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_operation_result_valid(text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_fingerprint_canonical_json(jsonb,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_operation_fingerprint_v2(text,uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_json_utc_timestamp(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_operation_entity_kind(text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_operation_entity_id(text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_reservation_matches_operation()') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_redemption_matches_reservation()') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_operation_group_complete()') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_operation_recovery_action(text)') IS NULL THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_HELPERS_INVALID'; END IF;
  IF pg_catalog.to_regprocedure('saas.promotion_definition_dimensions_overlap_v1(uuid,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'PROMOTIONS_STUDIO_CONFLICT_DIMENSIONS_INVALID';
  END IF;
  IF pg_catalog.to_regclass('saas.promotion_operations_reservation_group_owner_key') IS NULL
     OR pg_catalog.to_regclass('saas.promotion_operations_redemption_group_owner_key') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_operations'::regclass AND conname IN ('promotion_operations_result_contract_check','promotion_operations_result_entity_check') AND convalidated GROUP BY conrelid HAVING count(*)=2)
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_OPERATION_GROUP_FOUNDATION_INVALID'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger trigger_row
      WHERE NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O'
        AND ((trigger_row.tgrelid='saas.promotion_usage_reservations'::regclass AND trigger_row.tgname='promotion_usage_reservations_insert_binding')
          OR (trigger_row.tgrelid='saas.promotion_redemptions'::regclass AND trigger_row.tgname='promotion_redemptions_insert_binding')))<>2
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger trigger_row
       JOIN pg_catalog.pg_constraint constraint_row ON constraint_row.oid=trigger_row.tgconstraint
       WHERE trigger_row.tgrelid='saas.promotion_operations'::regclass
         AND trigger_row.tgname='promotion_operations_group_complete'
         AND NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O'
         AND constraint_row.contype='t' AND constraint_row.condeferrable AND constraint_row.condeferred
     )
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_OPERATION_GROUP_BINDING_INVALID'; END IF;
  IF NOT saas.promotion_rule_document_valid(pg_catalog.jsonb_build_object('schemaVersion',1,'benefit',pg_catalog.jsonb_build_object('kind','free_shipping'),'targets',pg_catalog.jsonb_build_object('mode','all','include','[]'::jsonb,'exclude','[]'::jsonb),'audience',pg_catalog.jsonb_build_object('mode','everyone'),'trigger',pg_catalog.jsonb_build_object('kind','automatic'),'schedule',pg_catalog.jsonb_build_object('timezone','Europe/Istanbul'),'limits',pg_catalog.jsonb_build_object('totalUsage',NULL,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),'conditions',pg_catalog.jsonb_build_object('minimumBasketMinor',0,'minimumQuantity',0,'minimumProductQuantity',0),'combinationPolicy',pg_catalog.jsonb_build_object('kind','none'),'priority',0,'marginPolicy',pg_catalog.jsonb_build_object('kind','warn'),'progressMessagePolicy',pg_catalog.jsonb_build_object('enabled',false))) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RULE_VALIDATOR_INVALID'; END IF;
  IF pg_catalog.to_regprocedure('saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_commit_reservation_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_release_reservation_v1(uuid,uuid,uuid,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)') IS NULL THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RPC_SURFACE_INVALID'; END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'saas.promotion_duplicate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text[])',
    'saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],integer)',
    'saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],text[],text[],text[],timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)',
    'saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
    'saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb,jsonb)',
    'saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
    'saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,jsonb)',
    'saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
    'saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,jsonb)',
    'saas.promotion_picker_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,integer,text,uuid)',
    'saas.promotion_picker_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])'
  ] LOOP
    v_proc:=pg_catalog.to_regprocedure(v_table);
    IF v_proc IS NULL
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
       OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc AND COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'])
    THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_CRUD_LIST_SIMULATOR_RPC_INVALID:%',v_table; END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'saas.promotion_picker_source_v1(uuid,text)',
    'saas.promotion_definition_dimensions_overlap_v1(uuid,jsonb,jsonb)',
    'saas.promotion_conflict_projection_v1(uuid,timestamp with time zone,jsonb,uuid)',
    'saas.promotion_margin_projection_v1(uuid,timestamp with time zone,jsonb)',
    'saas.promotion_evaluate_internal_v1(uuid,jsonb,timestamp with time zone,jsonb)'
  ] LOOP
    v_proc:=pg_catalog.to_regprocedure(v_table);
    IF v_proc IS NULL
       OR pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
       OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc AND COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'])
    THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_INTERNAL_HELPER_EXPOSURE_INVALID:%',v_table; END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)'::regprocedure,'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)'::regprocedure,'EXECUTE')
     OR (SELECT count(*) FROM pg_catalog.pg_proc proc WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('celebix_saas_workflow',proc.oid,'EXECUTE'))<>1 THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RPC_GRANTS_INVALID'; END IF;
END $fn$;
