-- Read-only assertion of the complete new authority surface.
BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_owner;SET LOCAL search_path=pg_catalog;SET LOCAL statement_timeout='30s';
DO $proof$ DECLARE t text;f record;gr record;names text[]:=ARRAY['order_bump_ids_valid','order_bump_config_valid','order_bump_default_config','order_bump_workspace','order_bump_settings_get','order_bump_operation_get','order_bump_settings_save','order_bump_options','order_bump_public_offers'];BEGIN
 IF(SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'order_bump_%')<>9 THEN RAISE EXCEPTION 'ORDER_BUMP_223_FUNCTION_COUNT';END IF;
 FOR f IN SELECT oid,proname,proowner,proacl,proconfig,provolatile,prosecdef,prokind,proisstrict,proleakproof,proparallel FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'order_bump_%' LOOP
  IF NOT f.proname=ANY(names) OR f.proowner<>'celebix_saas_owner'::regrole OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR f.prokind<>'f' OR f.proisstrict OR f.proleakproof OR f.proparallel<>'u'
  OR f.prosecdef IS DISTINCT FROM(f.proname IN('order_bump_settings_get','order_bump_operation_get','order_bump_settings_save','order_bump_options','order_bump_public_offers'))
  OR f.provolatile<>(CASE WHEN f.proname='order_bump_settings_save' THEN 'v' WHEN f.proname IN('order_bump_settings_get','order_bump_operation_get','order_bump_options','order_bump_public_offers') THEN 's' ELSE 'i' END)
  THEN RAISE EXCEPTION 'ORDER_BUMP_223_FUNCTION_AUTHORITY:%',f.proname;END IF;
  FOR gr IN SELECT * FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) LOOP
   IF gr.grantee=f.proowner AND gr.privilege_type='EXECUTE' THEN CONTINUE;END IF;
   IF gr.grantee='celebix_saas_app'::regrole AND f.proname IN('order_bump_settings_get','order_bump_operation_get','order_bump_settings_save','order_bump_options') AND gr.privilege_type='EXECUTE' AND NOT gr.is_grantable THEN CONTINUE;END IF;
   IF gr.grantee='celebix_saas_host_resolver'::regrole AND f.proname='order_bump_public_offers' AND gr.privilege_type='EXECUTE' AND NOT gr.is_grantable THEN CONTINUE;END IF;
   RAISE EXCEPTION 'ORDER_BUMP_223_WIDENED_FUNCTION_ACCESS:%',f.proname;
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['order_bump_settings','order_bump_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
  OR EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE c.oid=('saas.'||t)::regclass AND acl.grantee<>c.relowner)
  THEN RAISE EXCEPTION 'ORDER_BUMP_223_TABLE_AUTHORITY:%',t;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.order_bump_operations'::regclass AND tgname='order_bump_operations_immutable' AND tgenabled='O' AND tgfoid='saas.guard_merchant_admin_immutable()'::regprocedure) THEN RAISE EXCEPTION 'ORDER_BUMP_223_IMMUTABLE_EVIDENCE';END IF;
END $proof$;
ROLLBACK;
