DO $assertions$ BEGIN
  IF pg_catalog.to_regprocedure('saas.barcode_label_reserve_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NULL
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.barcode_label_reserve_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)','EXECUTE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.barcode_label_sequences','INSERT')
  THEN RAISE EXCEPTION 'inline_barcode_authority_invalid'; END IF;
END $assertions$;
