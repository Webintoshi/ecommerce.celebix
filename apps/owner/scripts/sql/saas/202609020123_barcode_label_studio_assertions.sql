DO $f$ BEGIN
  IF to_regclass('saas.barcode_label_templates') IS NULL OR to_regclass('saas.barcode_print_jobs') IS NULL OR to_regclass('saas.barcode_print_job_items') IS NULL OR to_regclass('saas.barcode_label_operations') IS NULL OR to_regclass('saas.barcode_label_sequences') IS NULL THEN RAISE EXCEPTION 'barcode_label_tables_missing'; END IF;
  IF has_table_privilege('celebix_saas_app','saas.barcode_label_templates','SELECT') OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_class relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))) privilege
    WHERE relation.oid='saas.barcode_label_templates'::regclass
      AND privilege.grantee=0 AND privilege.privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'barcode_label_table_grant_exposed'; END IF;
  IF NOT has_function_privilege('celebix_saas_app','saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'barcode_label_projection_execute_missing'; END IF;
  IF to_regprocedure('saas.barcode_label_template_config_valid(jsonb)') IS NULL OR has_function_privilege('celebix_saas_app','saas.barcode_label_template_config_valid(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'barcode_label_config_validator_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='saas' AND indexname='product_variants_store_internal_barcode_key') THEN RAISE EXCEPTION 'barcode_label_internal_unique_missing'; END IF;
END $f$;
