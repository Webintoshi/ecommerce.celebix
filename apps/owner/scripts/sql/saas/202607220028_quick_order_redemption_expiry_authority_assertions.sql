BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE checked regprocedure; source text;
BEGIN
  checked:=pg_catalog.to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)');
  IF checked IS NULL OR pg_catalog.has_function_privilege('public',checked,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app',checked,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',checked,'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow',checked,'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE3B2_REDEMPTION_EXPIRY_ASSERTION_FAILED: ACL';
  END IF;
  SELECT procedure.prosrc INTO source FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    WHERE procedure.oid=checked AND owner.rolname='celebix_saas_owner' AND procedure.prosecdef
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[];
  IF source IS NULL OR pg_catalog.strpos(source,'FOR UPDATE')=0
     OR pg_catalog.strpos(source,'effective_expires_at:=LEAST(p_expires_at,current_link.expires_at)')<=pg_catalog.strpos(source,'FOR UPDATE')
     OR pg_catalog.strpos(source,'VALUES(p_redemption_id,current_link.store_id,current_link.id,p_redemption_digest,effective_expires_at')<=pg_catalog.strpos(source,'effective_expires_at:=LEAST')
     OR pg_catalog.strpos(source,'''redemptionExpiresAt'',saas.quick_links_json_timestamp(effective_expires_at)')=0
     OR pg_catalog.strpos(source,'p_expires_at>current_link.expires_at')<>0 THEN
    RAISE EXCEPTION 'PHASE3B2_REDEMPTION_EXPIRY_ASSERTION_FAILED: source';
  END IF;
END
$assertions$;
COMMIT;
