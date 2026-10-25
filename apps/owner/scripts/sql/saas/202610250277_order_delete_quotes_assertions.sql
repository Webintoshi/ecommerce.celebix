BEGIN READ ONLY;
DO $assertions$DECLARE saved record;reviewed record;BEGIN
 IF(SELECT count(*)FROM saas.order_delete_quotes277_function_backup)<>3 THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_BACKUP_INVALID';END IF;
 FOR reviewed IN SELECT *FROM(VALUES
  ('saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','fb468a3acb086d49fdbc277796315561dc097f7dee3d42cade890c439a62d9ce','4d0aff86c32516560b29838b94b3f912edf2509e71c49b2729cac55814f11a17',true,'v'),
  ('saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','17463828e29c9eff02fb559ce9558d61606218e31e3e98f02c238912359a0fae','02f7e8703024041b73d8d91a0d49cd139f6e66702ffd3369840f991ae8d65546',true,'s'),
  ('saas.shipping_fulfillment_guard_immutable()','6f6a3572fa2a865010db8b06c6f7a1e84b489c37e5786ab4b8e9ecc812a28f31','1307a3c5e52e512357adc4c57010284b71632860efd8cf37341c97e63750d66b',false,'v')
 )evidence(signature,sha256,after_sha256,definer,volatility)LOOP
  SELECT *INTO STRICT saved FROM saas.order_delete_quotes277_function_backup WHERE signature=reviewed.signature;
  IF saved.before_definition_sha IS DISTINCT FROM reviewed.sha256 OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex')IS DISTINCT FROM reviewed.sha256
   OR saved.after_definition_sha IS DISTINCT FROM reviewed.after_sha256
   OR saved.owner_oid IS DISTINCT FROM 'celebix_saas_owner'::regrole
   OR saved.acl::text IS DISTINCT FROM(CASE WHEN reviewed.definer THEN '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'ELSE '{celebix_saas_owner=X/celebix_saas_owner}'END)
   OR saved.config IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR saved.security_definer IS DISTINCT FROM reviewed.definer OR saved.volatility::text IS DISTINCT FROM reviewed.volatility
  THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_BACKUP_DRIFT:%',saved.signature;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
   AND encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl AND p.proconfig IS NOT DISTINCT FROM saved.config
   AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
  THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_INSTALLED_FUNCTION_INVALID:%',saved.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='saas.order_delete_quotes277_function_backup'::regclass
  AND c.relowner='celebix_saas_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner))
 THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_BACKUP_PRIVACY_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='saas.order_delete_quotes277_function_backup'::regclass AND p.polroles<>ARRAY['celebix_saas_owner'::regrole::oid])
 THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_BACKUP_POLICY_INVALID';END IF;
END $assertions$;
COMMIT;
