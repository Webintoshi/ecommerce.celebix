DO $fn$
DECLARE v_table text; v_count integer; v_proc regprocedure; v_role text; v_privilege text; v_payload jsonb;
BEGIN
  SELECT count(*) INTO v_count FROM pg_catalog.pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations');
  IF v_count<>11 THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RELATION_COUNT_INVALID'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid='saas.promotion_code_batches'::regclass AND attnum>0 AND NOT attisdropped)<>13
     OR EXISTS(
       WITH expected(name,type_name,required,default_expression) AS (VALUES
         ('id','uuid',true,NULL::text),('store_id','uuid',true,NULL),('promotion_id','uuid',true,NULL),
         ('status','text',true,'''active''::text'),('requested_count','integer',true,NULL),('operation_id','uuid',true,NULL),
         ('created_at','timestamp with time zone',true,'date_trunc(''milliseconds''::text, clock_timestamp())'),
         ('version','bigint',true,'1'),('prefix','text',true,NULL),('code_length','integer',true,NULL),
         ('per_customer_usage','integer',true,NULL),('expires_at','timestamp with time zone',false,NULL),
         ('updated_at','timestamp with time zone',true,'date_trunc(''milliseconds''::text, clock_timestamp())')
       )
       SELECT 1 FROM expected
       LEFT JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid='saas.promotion_code_batches'::regclass AND attribute.attname=expected.name AND attribute.attnum>0 AND NOT attribute.attisdropped
       LEFT JOIN pg_catalog.pg_attrdef default_row ON default_row.adrelid=attribute.attrelid AND default_row.adnum=attribute.attnum
       WHERE attribute.attname IS NULL OR pg_catalog.format_type(attribute.atttypid,attribute.atttypmod)<>expected.type_name
         OR attribute.attnotnull IS DISTINCT FROM expected.required
         OR pg_catalog.pg_get_expr(default_row.adbin,default_row.adrelid) IS DISTINCT FROM expected.default_expression
     )
     OR EXISTS(
       WITH expected(name,needles) AS (VALUES
         ('promotion_code_batches_status_check',ARRAY['active','paused','revoked']),
         ('promotion_code_batches_requested_count_check',ARRAY['requested_count >= 1','requested_count <= 10000']),
         ('promotion_code_batches_version_check',ARRAY['version >= 1','version <=','9007199254740991']),
         ('promotion_code_batches_prefix_check',ARRAY['prefix ~','{0,19}']),
         ('promotion_code_batches_check',ARRAY['code_length >= 16','code_length <= 64','char_length(prefix)','>= 16']),
         ('promotion_code_batches_per_customer_usage_check',ARRAY['per_customer_usage >= 1','per_customer_usage <= 1000000']),
         ('promotion_code_batches_time_check',ARRAY['isfinite(created_at)','isfinite(updated_at)','updated_at >= created_at','date_trunc(''milliseconds''::text, created_at)','date_trunc(''milliseconds''::text, updated_at)','isfinite(expires_at)','date_trunc(''milliseconds''::text, expires_at)','expires_at > created_at'])
       )
       SELECT 1 FROM expected
       LEFT JOIN pg_catalog.pg_constraint constraint_row ON constraint_row.conrelid='saas.promotion_code_batches'::regclass AND constraint_row.conname=expected.name AND constraint_row.contype='c' AND constraint_row.convalidated
       WHERE constraint_row.oid IS NULL OR EXISTS(SELECT 1 FROM pg_catalog.unnest(expected.needles) needle WHERE pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid),needle)=0)
     )
     OR (SELECT pg_catalog.pg_get_indexdef(index_row.indexrelid) FROM pg_catalog.pg_index index_row WHERE index_row.indexrelid=pg_catalog.to_regclass('saas.promotion_code_batches_list_idx')) IS DISTINCT FROM 'CREATE INDEX promotion_code_batches_list_idx ON saas.promotion_code_batches USING btree (store_id, promotion_id, created_at DESC, id DESC)'
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_CODE_BATCH_SLICE_C_INVALID:columns=%:checks=%:index=%',
    (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',attribute.attname,'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'default',pg_catalog.pg_get_expr(default_row.adbin,default_row.adrelid)) ORDER BY attribute.attnum) FROM pg_catalog.pg_attribute attribute LEFT JOIN pg_catalog.pg_attrdef default_row ON default_row.adrelid=attribute.attrelid AND default_row.adnum=attribute.attnum WHERE attribute.attrelid='saas.promotion_code_batches'::regclass AND attribute.attnum>0 AND NOT attribute.attisdropped),
    (SELECT pg_catalog.jsonb_object_agg(constraint_row.conname,pg_catalog.pg_get_constraintdef(constraint_row.oid) ORDER BY constraint_row.conname) FROM pg_catalog.pg_constraint constraint_row WHERE constraint_row.conrelid='saas.promotion_code_batches'::regclass AND constraint_row.contype='c'),
    (SELECT pg_catalog.pg_get_indexdef(index_row.indexrelid) FROM pg_catalog.pg_index index_row WHERE index_row.indexrelid=pg_catalog.to_regclass('saas.promotion_code_batches_list_idx'));
  END IF;
  FOREACH v_table IN ARRAY ARRAY['promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=('saas.'||v_table)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RLS_INVALID:%',v_table; END IF;
    FOREACH v_role IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_identity'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF pg_catalog.has_table_privilege(v_role,('saas.'||v_table)::regclass,v_privilege) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_DIRECT_TABLE_PRIVILEGE_INVALID:%:%:%',v_role,v_table,v_privilege; END IF;
      END LOOP;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE((SELECT relacl FROM pg_catalog.pg_class WHERE oid=('saas.'||v_table)::regclass),'{}'::aclitem[])) acl WHERE acl.grantee=0) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_PUBLIC_TABLE_PRIVILEGE_INVALID:%',v_table; END IF;
  END LOOP;
  SELECT count(*) INTO v_count FROM pg_catalog.pg_constraint WHERE connamespace='saas'::regnamespace AND conname IN ('promotion_code_batches_operation_store_fk','promotion_codes_batch_store_fk','promotion_usage_reservations_version_store_fk','promotion_usage_reservations_code_store_fk','promotion_usage_reservations_operation_store_fk','promotion_usage_reservations_customer_store_fk','promotion_redemptions_version_store_fk','promotion_redemptions_code_store_fk','promotion_redemptions_reservation_store_fk','promotion_redemptions_operation_store_fk','promotion_redemptions_customer_store_fk','promotion_redemptions_order_store_fk','order_promotion_snapshots_order_store_fk','order_promotion_snapshots_version_store_fk','order_promotion_snapshots_redemption_store_fk','order_discount_allocations_snapshot_store_fk','order_discount_allocations_order_store_fk','order_discount_allocations_line_store_fk') AND convalidated;
  IF v_count<>18 OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.conrelid='saas.order_promotion_snapshots'::regclass
         AND constraint_row.conname='order_promotion_snapshots_redemption_store_fk'
         AND constraint_row.contype='f' AND constraint_row.convalidated
         AND pg_catalog.pg_get_constraintdef(constraint_row.oid)='FOREIGN KEY (store_id, redemption_id) REFERENCES saas.promotion_redemptions(store_id, id)')
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_COMPOSITE_FOREIGN_KEYS_INVALID:%',v_count; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_constraint constraint_row JOIN pg_catalog.pg_class relation ON relation.oid=constraint_row.conrelid WHERE relation.relnamespace='saas'::regnamespace AND relation.relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations') AND constraint_row.contype='f' AND NOT constraint_row.convalidated) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_UNVALIDATED_FOREIGN_KEY'; END IF;
  v_proc:=pg_catalog.to_regprocedure('saas.promotion_evaluate_v1(uuid,jsonb,timestamp with time zone)');
  IF v_proc IS NULL OR NOT pg_catalog.has_function_privilege('celebix_saas_owner',v_proc,'EXECUTE') THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_INVALID'; END IF;
  IF (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner' THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_OWNER_INVALID'; END IF;
  v_proc:=pg_catalog.to_regprocedure('saas.public_checkout_quote_v2(text,timestamp with time zone,text,jsonb,jsonb,text[],jsonb)');
  IF v_proc IS NULL
     OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
     OR (SELECT proc.prosecdef FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc) IS DISTINCT FROM true
     OR NOT (SELECT COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'] FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc)
     OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_PUBLIC_CHECKOUT_QUOTE_V2_INVALID'; END IF;
  v_proc:=pg_catalog.to_regprocedure('saas.public_checkout_complete_v2(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[])');
  IF v_proc IS NULL
     OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
     OR (SELECT proc.prosecdef FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc) IS DISTINCT FROM true
     OR NOT (SELECT COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'] FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc)
     OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_PUBLIC_CHECKOUT_COMPLETE_V2_INVALID'; END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'saas.public_checkout_recover(text,timestamp with time zone,uuid,text)',
    'saas.public_receipt_get(text,timestamp with time zone,jsonb,jsonb)',
    'saas.public_account_orders(text,timestamp with time zone,jsonb,integer)',
    'saas.public_checkout_recover_v2(text,timestamp with time zone,uuid,text)',
    'saas.public_receipt_get_v2(text,timestamp with time zone,jsonb,jsonb)',
    'saas.public_account_orders_v2(text,timestamp with time zone,jsonb,integer)'
  ] LOOP
    v_proc:=pg_catalog.to_regprocedure(v_table);
    IF v_proc IS NULL
       OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
       OR (SELECT proc.prosecdef FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc) IS DISTINCT FROM true
       OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc AND COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'])
       OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
    THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RECEIPT_VERSION_RPC_INVALID:%',v_table; END IF;
  END LOOP;
  IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.public_checkout_recover(text,timestamp with time zone,uuid,text)'::regprocedure),'promotionStatus')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.public_receipt_get(text,timestamp with time zone,jsonb,jsonb)'::regprocedure),'promotionStatus')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.public_account_orders(text,timestamp with time zone,jsonb,integer)'::regprocedure),'promotionStatus')=0
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_LEGACY_RECEIPT_FENCE_INVALID'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute
      WHERE attrelid='saas.storefront_hosted_checkout_sessions'::regclass
        AND attname IN('evaluator_authority_digest','promotion_evaluator_context','promotion_evaluation','promotion_normalized_codes','promotion_reservation_group_id','promotion_reservation_expires_at')
        AND attnum>0 AND NOT attisdropped)<>6
     OR EXISTS(
       WITH expected(name,type_name) AS (VALUES
         ('evaluator_authority_digest','character(64)'),
         ('promotion_evaluator_context','jsonb'),('promotion_evaluation','jsonb'),
         ('promotion_normalized_codes','jsonb'),('promotion_reservation_group_id','uuid'),
         ('promotion_reservation_expires_at','timestamp with time zone')
       )
       SELECT 1 FROM expected
       LEFT JOIN pg_catalog.pg_attribute attribute
         ON attribute.attrelid='saas.storefront_hosted_checkout_sessions'::regclass
        AND attribute.attname=expected.name AND attribute.attnum>0 AND NOT attribute.attisdropped
       LEFT JOIN pg_catalog.pg_attrdef default_row
         ON default_row.adrelid=attribute.attrelid AND default_row.adnum=attribute.attnum
       WHERE attribute.attname IS NULL
         OR pg_catalog.format_type(attribute.atttypid,attribute.atttypmod)<>expected.type_name
         OR attribute.attnotnull OR default_row.oid IS NOT NULL
     )
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.conrelid='saas.storefront_hosted_checkout_sessions'::regclass
         AND constraint_row.conname='storefront_hosted_checkout_sessions_v2_facts_check'
         AND constraint_row.contype='c' AND constraint_row.convalidated
         AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid),'promotion_reservation_expires_at = receipt_expires_at')>0
     )
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.conrelid='saas.storefront_hosted_checkout_operations'::regclass
         AND constraint_row.conname='storefront_hosted_checkout_operations_result_payload_check'
         AND constraint_row.contype='c' AND constraint_row.convalidated
         AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid),'786432')>0
     )
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_HOSTED_V2_SESSION_FACTS_INVALID'; END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'saas.public_storefront_hosted_checkout_authority_v2(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)',
    'saas.public_storefront_hosted_checkout_begin_v2(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)'
  ] LOOP
    v_proc:=pg_catalog.to_regprocedure(v_table);
    IF v_proc IS NULL
       OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
       OR (SELECT proc.prosecdef FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc) IS DISTINCT FROM true
       OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc AND COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'])
       OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
    THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_HOSTED_V2_PUBLIC_RPC_INVALID:%',v_table; END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'saas.storefront_hosted_checkout_promotion_codes_valid_v2(jsonb)',
    'saas.storefront_hosted_checkout_customer_prepare_v2(uuid,timestamp with time zone,jsonb,jsonb,uuid,boolean)',
    'saas.storefront_hosted_checkout_authority_v2_projection(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,uuid,jsonb,uuid)',
    'saas.storefront_hosted_checkout_promotion_release_v2(uuid,uuid,uuid,timestamp with time zone)',
    'saas.storefront_hosted_checkout_promotion_terminal_v2()'
  ] LOOP
    v_proc:=pg_catalog.to_regprocedure(v_table);
    IF v_proc IS NULL
       OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
       OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc AND COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'])
       OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
    THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_HOSTED_V2_INTERNAL_HELPER_INVALID:%',v_table; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger trigger_row
      WHERE trigger_row.tgrelid='saas.payment_attempts'::regclass
        AND trigger_row.tgname='aa_storefront_hosted_checkout_promotion_terminal_v2'
        AND NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O'
        AND trigger_row.tgfoid='saas.storefront_hosted_checkout_promotion_terminal_v2()'::regprocedure)=0
     OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger_row
       WHERE trigger_row.tgrelid='saas.payment_attempts'::regclass
         AND trigger_row.tgname='zz_storefront_hosted_checkout_promotion_terminal_v2'
         AND NOT trigger_row.tgisinternal)
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger_row
       WHERE trigger_row.tgrelid='saas.payment_attempts'::regclass
         AND trigger_row.tgname='aa_storefront_hosted_checkout_promotion_terminal_v2'
         AND pg_catalog.pg_get_triggerdef(trigger_row.oid) LIKE '%AFTER UPDATE OF status%')
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_HOSTED_V2_TERMINAL_TRIGGER_INVALID'; END IF;
  IF pg_catalog.to_regprocedure('saas.promotion_evaluator_context_valid(uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_checkout_codes_valid_v1(text[])') IS NULL
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
     OR pg_catalog.to_regprocedure('saas.promotion_operation_recovery_action(text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_bundle_facts_v1(jsonb,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_consumed_line_capacity(jsonb,jsonb,bigint,bigint)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_evaluator_code_facts(uuid,jsonb,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_code_batch_projection_v1(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_code_batch_integrity_valid_v1(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_code_batch_result_matches_v1(uuid,uuid,text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_legacy_review_reason_v1(uuid,uuid,text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_reservation_source_valid_v1(uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_reservation_source_order_valid_v1(uuid,text,text,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_reservation_group_integrity_valid_v1(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_reservation_result_v1(uuid,uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_settlement_operation_result_matches_v1(uuid,uuid,text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_order_snapshot_valid_v1(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_captured_ranges_v1(bigint,bigint,bigint,text,bigint)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_order_snapshot_build_v1(uuid,jsonb,jsonb,uuid,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_order_snapshot_insert_binding_v1()') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_order_allocation_insert_binding_v1()') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_auto_gift_order_lines_valid_v1(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_commit_integrity_valid_v1(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_reservation_group_transition_complete()') IS NULL
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EVALUATOR_HELPERS_INVALID'; END IF;
  SELECT pg_catalog.jsonb_build_object(
    'sourcePromotionId','90000000-0000-4000-8000-000000000139'::uuid,
    'expectedVersion',1,
    'name','Maximum duplicate fingerprint',
    'codes',pg_catalog.to_jsonb(pg_catalog.array_agg('C'||pg_catalog.lpad(code_ordinal::text,5,'0')||pg_catalog.repeat('A',58) ORDER BY code_ordinal))
  ) INTO v_payload
  FROM pg_catalog.generate_series(1,10000) code_ordinal;
  IF pg_catalog.pg_column_size(v_payload) NOT BETWEEN 327681 AND 786432
     OR saas.promotion_operation_fingerprint_v2('duplicate','10000000-0000-4000-8000-000000000126'::uuid,v_payload)
        IS DISTINCT FROM 'fc3666b889d56fb945ce66f982f8f3d7bc4097df402bb712a52283a0a5079129'
     OR saas.promotion_operation_fingerprint_v2(
          'duplicate',
          '10000000-0000-4000-8000-000000000126'::uuid,
          pg_catalog.jsonb_build_object('padding',pg_catalog.repeat('A',786432))
        ) IS NOT NULL
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_OPERATION_FINGERPRINT_PAYLOAD_BOUND_INVALID'; END IF;
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
     OR pg_catalog.to_regprocedure('saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text,integer,integer,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_code_batch_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_commit_reservation_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_release_reservation_v1(uuid,uuid,uuid,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_release_reservation_group_v1(uuid,uuid,text,uuid,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_commit_reservation_group_v1(uuid,uuid,text,uuid,uuid,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_recover_settlement_operation_v1(uuid,timestamp with time zone,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.promotion_captured_unit_refund_minor_v1(uuid,uuid,uuid,jsonb,jsonb,bigint,bigint)') IS NULL
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
    'saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text)',
    'saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text,integer,integer,timestamp with time zone)',
    'saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',
    'saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'saas.promotion_code_batch_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone,uuid)',
    'saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)',
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
    'saas.promotion_evaluate_internal_v1(uuid,jsonb,timestamp with time zone,jsonb)',
    'saas.promotion_bundle_facts_v1(jsonb,jsonb)',
    'saas.promotion_evaluator_consumed_line_capacity(jsonb,jsonb,bigint,bigint)',
    'saas.promotion_evaluator_code_facts(uuid,jsonb,timestamp with time zone)',
    'saas.promotion_code_batch_projection_v1(uuid,uuid)',
    'saas.promotion_code_batch_integrity_valid_v1(uuid,uuid)',
    'saas.promotion_code_batch_result_matches_v1(uuid,uuid,text,jsonb)',
    'saas.promotion_legacy_review_reason_v1(uuid,uuid,text,jsonb)',
    'saas.promotion_evaluate_internal_v1(uuid,jsonb,timestamp with time zone,jsonb,jsonb)',
    'saas.promotion_reservation_source_valid_v1(uuid,text,text)',
    'saas.promotion_reservation_source_order_valid_v1(uuid,text,text,uuid)',
    'saas.promotion_reservation_group_integrity_valid_v1(uuid,uuid)',
    'saas.promotion_reservation_result_v1(uuid,uuid,text)',
    'saas.promotion_settlement_operation_result_matches_v1(uuid,uuid,text,jsonb)',
    'saas.promotion_order_snapshot_valid_v1(jsonb)',
    'saas.promotion_captured_ranges_v1(bigint,bigint,bigint,text,bigint)',
    'saas.promotion_order_snapshot_build_v1(uuid,jsonb,jsonb,uuid,timestamp with time zone)',
    'saas.promotion_order_snapshot_insert_binding_v1()',
    'saas.promotion_order_allocation_insert_binding_v1()',
    'saas.promotion_commit_integrity_valid_v1(uuid,uuid)',
    'saas.promotion_reservation_group_transition_complete()',
    'saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamp with time zone)',
    'saas.promotion_release_reservation_group_v1(uuid,uuid,text,uuid,timestamp with time zone)',
    'saas.promotion_commit_reservation_group_v1(uuid,uuid,text,uuid,uuid,timestamp with time zone)',
    'saas.promotion_recover_settlement_operation_v1(uuid,timestamp with time zone,uuid,text,text)',
    'saas.promotion_captured_unit_refund_minor_v1(uuid,uuid,uuid,jsonb,jsonb,bigint,bigint)'
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
  IF NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_attribute attribute
       WHERE attribute.attrelid='saas.order_promotion_snapshots'::regclass
         AND attribute.attname='redemption_id' AND attribute.attnotnull AND NOT attribute.attisdropped)
     OR pg_catalog.to_regclass('saas.promotion_operations_settlement_entity_kind_key') IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_index index_row
       WHERE index_row.indexrelid='saas.promotion_operations_settlement_entity_kind_key'::regclass
         AND index_row.indisunique AND index_row.indisvalid
         AND pg_catalog.strpos(pg_catalog.pg_get_indexdef(index_row.indexrelid),'store_id, operation_kind, result_entity_kind, result_entity_id')>0
         AND pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid) LIKE '%reserve%release%commit%expire%')
     OR pg_catalog.to_regclass('saas.promotion_usage_reservations_due_idx') IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_index index_row
       WHERE index_row.indexrelid='saas.promotion_usage_reservations_due_idx'::regclass
         AND index_row.indisvalid
         AND pg_catalog.strpos(pg_catalog.pg_get_indexdef(index_row.indexrelid),'expires_at, store_id, reservation_group_id, id')>0
         AND pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid) LIKE '%status%reserved%')
     OR (SELECT count(*) FROM pg_catalog.pg_trigger trigger_row
         WHERE NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O'
           AND ((trigger_row.tgrelid='saas.order_promotion_snapshots'::regclass AND trigger_row.tgname='order_promotion_snapshots_insert_binding')
             OR (trigger_row.tgrelid='saas.order_discount_allocations'::regclass AND trigger_row.tgname='order_discount_allocations_insert_binding')))<>2
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_trigger trigger_row
       JOIN pg_catalog.pg_constraint constraint_row ON constraint_row.oid=trigger_row.tgconstraint
       WHERE trigger_row.tgrelid='saas.promotion_usage_reservations'::regclass
         AND trigger_row.tgname='promotion_usage_reservations_group_transition_complete'
         AND NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O'
         AND constraint_row.contype='t' AND constraint_row.condeferrable AND constraint_row.condeferred)
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)'::regprocedure),'FOR UPDATE OF operation_row SKIP LOCKED')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)'::regprocedure),'p_limit IS NULL')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamp with time zone)'::regprocedure),'hosted.hold_expires_at')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamp with time zone)'::regprocedure),'v_hosted_expires_at<=p_now')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamp with time zone)'::regprocedure),'v_hosted_customer_id')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamp with time zone)'::regprocedure),'v_hosted_currency')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.promotion_captured_unit_refund_minor_v1(uuid,uuid,uuid,jsonb,jsonb,bigint,bigint)'::regprocedure),'p_previously_returned_ranges IS NULL')=0
  THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_SETTLEMENT_SLICE_D_INVALID'; END IF;
  v_proc:='saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)'::regprocedure;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)'::regprocedure,'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_owner',v_proc,'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_identity',v_proc,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_proc,'EXECUTE')
     OR (SELECT owner.rolname FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=v_proc)<>'celebix_saas_owner'
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc proc WHERE proc.oid=v_proc AND COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas'])
     OR (SELECT count(*) FROM pg_catalog.pg_proc proc WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('celebix_saas_workflow',proc.oid,'EXECUTE'))<>1 THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_RPC_GRANTS_INVALID'; END IF;
END $fn$;
