-- Read-only capability and narrow-authority acceptance. Behavioral fixtures run only in the disposable harness.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='30s';
DO $authority$
DECLARE f record;gr record;t text;
BEGIN
 SELECT p.*,l.lanname INTO f FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
 WHERE p.oid=to_regprocedure('saas.store_engagement_popup_delete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)');
 IF NOT FOUND OR f.proowner<>'celebix_saas_owner'::regrole OR NOT f.prosecdef OR f.provolatile<>'v'
 OR f.prokind<>'f' OR f.proisstrict OR f.proleakproof OR f.proparallel<>'u' OR f.lanname<>'plpgsql'
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
 OR f.proacl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'
 THEN RAISE EXCEPTION 'STORE_POPUP_DELETE_222_FUNCTION_AUTHORITY_INVALID';END IF;
 FOREACH t IN ARRAY ARRAY['store_engagement_campaigns','store_engagement_admin_operations','store_engagement_cart_contacts','store_engagement_capture_operations','store_engagement_request_limits'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity)
  OR has_table_privilege('celebix_saas_app','saas.'||t,'SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('celebix_saas_host_resolver','saas.'||t,'SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'STORE_POPUP_DELETE_222_TABLE_AUTHORITY_INVALID:%',t;END IF;
 END LOOP;
 -- This extends SQL215's known execute allowlist without changing any existing grant.
 FOR f IN SELECT oid,proname,proowner,proacl FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'store_engagement_%' LOOP
  FOR gr IN SELECT * FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) LOOP
   IF gr.grantee=f.proowner THEN CONTINUE;END IF;
   IF gr.grantee='celebix_saas_app'::regrole AND f.proname IN('store_engagement_campaign_list','store_engagement_campaign_save','store_engagement_admin_operation_get','store_engagement_popup_delete') AND gr.privilege_type='EXECUTE' AND NOT gr.is_grantable THEN CONTINUE;END IF;
   IF gr.grantee='celebix_saas_host_resolver'::regrole AND f.proname IN('store_engagement_public_settings','store_engagement_public_operation_get','store_engagement_contact_capture') AND gr.privilege_type='EXECUTE' AND NOT gr.is_grantable THEN CONTINUE;END IF;
   RAISE EXCEPTION 'STORE_POPUP_DELETE_222_WIDENED_FUNCTION_ACCESS:%',f.proname;
  END LOOP;
 END LOOP;
END $authority$;
ROLLBACK;
