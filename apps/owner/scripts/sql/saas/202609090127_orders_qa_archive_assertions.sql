DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.order_archive_operations'::regclass AND tgname='order_archive_audit_immutable' AND tgenabled='O')
 OR pg_catalog.has_table_privilege('celebix_saas_app','saas.order_archive_operations','INSERT,UPDATE,DELETE')
 OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.orders_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'ORDER_ARCHIVE_ASSERTION_FAILED'; END IF;
END $$;
