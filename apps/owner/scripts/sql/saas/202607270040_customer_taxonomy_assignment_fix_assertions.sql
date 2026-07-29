DO $assertions$
DECLARE
  signature constant text := 'saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,uuid[])';
  definition text;
BEGIN
  IF pg_catalog.to_regprocedure(signature) IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_TAXONOMY_ASSIGNMENT_FUNCTION_MISSING';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(signature::regprocedure) INTO definition;
  IF definition LIKE '%pg_catalog.coalesce%' THEN
    RAISE EXCEPTION 'CUSTOMER_TAXONOMY_ASSIGNMENT_COALESCE_INVALID';
  END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',signature,'EXECUTE')
  THEN
    RAISE EXCEPTION 'CUSTOMER_TAXONOMY_ASSIGNMENT_GRANT_INVALID';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    WHERE procedure.oid=signature::regprocedure
      AND (
        owner.rolname<>'celebix_saas_owner'
        OR NOT procedure.prosecdef
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_TAXONOMY_ASSIGNMENT_AUTHORITY_INVALID';
  END IF;
END
$assertions$;
