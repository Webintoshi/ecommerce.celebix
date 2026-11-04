BEGIN READ ONLY;
DO $a$DECLARE f record;BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.in_store_staff_grants'::regclass AND attname='can_manage_loyalty'AND attnotnull)THEN RAISE EXCEPTION 'LOYALTY503_GRANT_DEFAULT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.loyalty_pos_redemptions'::regclass AND relrowsecurity AND relforcerowsecurity)THEN RAISE EXCEPTION 'LOYALTY503_POS_RLS';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.loyalty_checkout_authorizations'::regclass AND relrowsecurity AND relforcerowsecurity)THEN RAISE EXCEPTION 'LOYALTY503_CHECKOUT_RLS';END IF;
 FOR f IN SELECT * FROM saas.loyalty503_functions LOOP
  IF f.patched_hash IS NULL OR encode(sha256(convert_to(pg_get_functiondef(f.identity::regprocedure),'UTF8')),'hex')<>f.patched_hash THEN RAISE EXCEPTION 'LOYALTY503_PATCH_DRIFT:%',f.identity;END IF;
 END LOOP;
 IF to_regprocedure('saas.in_store_sales_set_staff_v9(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer,boolean,boolean,boolean)')IS NULL THEN RAISE EXCEPTION 'LOYALTY503_STAFF_V9';END IF;
 IF position('loyalty_pos_after_v1'IN pg_get_functiondef('saas.in_store_sales_mutate_v4(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb)'::regprocedure))=0 THEN RAISE EXCEPTION 'LOYALTY503_POS_SETTLEMENT';END IF;
 IF has_table_privilege('celebix_saas_app','saas.loyalty_pos_redemptions','SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_host_resolver','saas.loyalty_pos_redemptions','SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'LOYALTY503_DIRECT_ACCESS';END IF;
 IF has_table_privilege('celebix_saas_app','saas.loyalty_checkout_authorizations','SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_host_resolver','saas.loyalty_checkout_authorizations','SELECT,INSERT,UPDATE,DELETE')OR has_function_privilege('celebix_saas_host_resolver','saas.loyalty_checkout_enter_v1(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,text,jsonb)','EXECUTE')THEN RAISE EXCEPTION 'LOYALTY503_PROOF_DIRECT_ACCESS';END IF;
 IF NOT has_function_privilege('celebix_saas_host_resolver','saas.public_storefront_checkout_prepare_quote_v5(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,jsonb)','EXECUTE')THEN RAISE EXCEPTION 'LOYALTY503_VERIFIED_PREFLIGHT_MISSING';END IF;
END $a$;
ROLLBACK;
