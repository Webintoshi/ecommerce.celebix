BEGIN READ ONLY;
DO $assertions$ DECLARE saved record;BEGIN
 IF(SELECT count(*)FROM saas.order_edit_address276_function_backup)<>1 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_BACKUP_INVALID';END IF;
 SELECT *INTO STRICT saved FROM saas.order_edit_address276_function_backup;
 IF saved.signature<>'saas.orders_edit_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'
  OR saved.before_definition_sha<>'4c455d3dfa206da0b3ddbb6abb799a21436595eeacc797c58fcc7f457d8248dd'
  OR saved.after_definition_sha<>'101a8c2436b00783f4b308db6300fd293569c758bc6874164922063092739d6e'
  OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex')IS DISTINCT FROM saved.before_definition_sha
  OR saved.owner_oid IS DISTINCT FROM 'celebix_saas_owner'::regrole
  OR saved.acl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'
  OR saved.config IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR NOT saved.security_definer OR saved.volatility<>'s'
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_BACKUP_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
  AND encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex')=saved.after_definition_sha
  AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl
  AND p.proconfig IS NOT DISTINCT FROM saved.config AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_INSTALLED_FUNCTION_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('saas.orders_detail_projection(uuid,uuid)')
  AND encode(sha256(convert_to(pg_get_functiondef('saas.orders_detail_projection(uuid,uuid)'::regprocedure),'UTF8')),'hex')='d9c3322f5412395ad335d3d36073979e253b12f2a7430588d1538df519f5d6bf'
  AND p.proowner='celebix_saas_owner'::regrole AND p.proacl::text='{celebix_saas_owner=X/celebix_saas_owner}'
  AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[] AND NOT p.prosecdef AND p.provolatile='s')
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_CANONICAL_READER_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='saas.order_edit_address276_function_backup'::regclass
  AND c.relowner='celebix_saas_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner))
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_BACKUP_PRIVACY_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='saas.order_edit_address276_function_backup'::regclass AND p.polroles<>ARRAY['celebix_saas_owner'::regrole::oid])
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_BACKUP_POLICY_INVALID';END IF;
END $assertions$;
COMMIT;
