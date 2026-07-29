DO $f$ DECLARE missing text; BEGIN
  SELECT pg_catalog.string_agg(expected.name,',') INTO missing FROM (VALUES('customers'),('customer_addresses'),('customer_consents'),('customer_notes'),('customer_tags'),('customer_tag_assignments'),('customer_segments'),('customer_segment_memberships'),('customer_operations')) expected(name)
  WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname='saas' AND c.relname=expected.name AND c.relrowsecurity AND c.relforcerowsecurity AND r.rolname='celebix_saas_owner');
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'CUSTOMER_TABLE_AUTHORITY_DRIFT:%',missing; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='saas' AND table_name LIKE 'customer%' AND grantee IN ('celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver')) THEN RAISE EXCEPTION 'CUSTOMER_TABLE_GRANT_DRIFT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conname='orders_customer_store_fk') THEN RAISE EXCEPTION 'CUSTOMER_ORDER_STORE_FK_MISSING'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='customer_operations_immutable' AND NOT tgisinternal) THEN RAISE EXCEPTION 'CUSTOMER_OPERATION_IMMUTABILITY_MISSING'; END IF;
END $f$;
