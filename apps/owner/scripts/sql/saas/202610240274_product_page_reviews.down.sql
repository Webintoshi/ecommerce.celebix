BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.product-page-reviews.release274',0));
DO $safe$BEGIN
 IF current_setting('celebix.allow_product_page_review274_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'PRODUCT_PAGE_REVIEW274_DOWN_OPT_IN_REQUIRED';END IF;
 LOCK TABLE saas.product_page_review_settings,saas.product_page_review_submissions,saas.product_page_review_operations,saas.product_page_review_limits IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.product_page_review_settings)OR EXISTS(SELECT 1 FROM saas.product_page_review_submissions)OR EXISTS(SELECT 1 FROM saas.product_page_review_operations)OR EXISTS(SELECT 1 FROM saas.product_page_review_limits)THEN RAISE EXCEPTION 'PRODUCT_PAGE_REVIEW274_USED_AUTHORITY_FORWARD_FIX_REQUIRED';END IF;
END $safe$;
DO $assertions$
DECLARE signature text;role_name text;table_name text;expected_role text;expected_hash text;BEGIN
 FOREACH signature IN ARRAY ARRAY['saas.product_page_review_admin_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz)','saas.product_page_review_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,boolean)','saas.public_product_page_review_availability(text,timestamptz,uuid,jsonb)','saas.public_product_page_review_submit(text,timestamptz,uuid,jsonb,uuid,text,jsonb)']LOOP
  expected_role:=CASE WHEN signature LIKE 'saas.public_%'THEN 'celebix_saas_host_resolver'ELSE 'celebix_saas_app'END;
  expected_hash:=CASE
   WHEN signature LIKE 'saas.product_page_review_admin_get(%'THEN 'a4d30f3a379a932fd0cd1e226c247caa6e3c329c1a644760042c48056bab01c2'
   WHEN signature LIKE 'saas.product_page_review_admin_save(%'THEN '051bf3ac38d94602af147b105093ef4fce7706025d50fe073fd06cf8100d6ec6'
   WHEN signature LIKE 'saas.public_product_page_review_availability(%'THEN '83fc33883f2b1ecbc1756adc9d6f3af60614a2c2cf38b332a246654c9411f60d'
   WHEN signature LIKE 'saas.public_product_page_review_submit(%'THEN 'f7914f162ce4eb3e9e3b7b7da2f5fb12602493df380499d34f5b98c808449129'END;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(signature)AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=expected_hash AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile=CASE WHEN signature LIKE '%_get(%'OR signature LIKE '%_availability(%'THEN 's'::"char"ELSE 'v'::"char"END AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]AND NOT p.proisstrict AND p.proparallel='u'
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee NOT IN('celebix_saas_owner'::regrole,expected_role::regrole)))THEN RAISE EXCEPTION 'PRODUCT_PAGE_REVIEW274_FUNCTION_AUTHORITY:%',signature;END IF;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_function_privilege(role_name,signature,'EXECUTE')IS DISTINCT FROM(role_name=expected_role)THEN RAISE EXCEPTION 'PRODUCT_PAGE_REVIEW274_ROLE_BOUNDARY:%:%',signature,role_name;END IF;
  END LOOP;
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['product_page_review_settings','product_page_review_submissions','product_page_review_operations','product_page_review_limits']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('saas.'||table_name)AND c.relowner='celebix_saas_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>'celebix_saas_owner'::regrole))THEN RAISE EXCEPTION 'PRODUCT_PAGE_REVIEW274_PRIVATE_TABLE:%',table_name;END IF;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_table_privilege(role_name,'saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')THEN RAISE EXCEPTION 'PRODUCT_PAGE_REVIEW274_TABLE_BOUNDARY:%:%',table_name,role_name;END IF;
  END LOOP;
 END LOOP;
END $assertions$;
DROP FUNCTION saas.product_page_review_admin_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.product_page_review_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,boolean),saas.public_product_page_review_availability(text,timestamptz,uuid,jsonb),saas.public_product_page_review_submit(text,timestamptz,uuid,jsonb,uuid,text,jsonb);
DROP TABLE saas.product_page_review_limits,saas.product_page_review_operations,saas.product_page_review_submissions,saas.product_page_review_settings;
COMMIT;
