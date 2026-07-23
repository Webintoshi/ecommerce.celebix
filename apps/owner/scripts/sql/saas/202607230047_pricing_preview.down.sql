BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $pricing_preview_down$
DECLARE
  target regprocedure:=
    'saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])'::regprocedure;
  definition text;
  owner_name text;
  volatility "char";
  security_definer boolean;
  configuration text[];
BEGIN
  SELECT pg_catalog.pg_get_functiondef(proc.oid),role.rolname,proc.provolatile,
         proc.prosecdef,proc.proconfig
  INTO definition,owner_name,volatility,security_definer,configuration
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_roles AS role ON role.oid=proc.proowner
  WHERE proc.oid=target;
  IF definition IS NULL
     OR owner_name<>'celebix_saas_owner'
     OR volatility<>'s'
     OR security_definer IS DISTINCT FROM true
     OR configuration IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     OR definition NOT LIKE '%merchant_action_authority_error%'
     OR definition NOT LIKE '%resolve_effective_variant_price%'
     OR definition NOT LIKE '%NULL::text%'
     OR definition NOT LIKE '%ORDER BY selected.variant_id::text%'
     OR definition NOT LIKE '%basePriceCents%'
     OR definition NOT LIKE '%effectivePriceCents%' THEN
    RAISE EXCEPTION 'PRICING_PREVIEW_ROLLBACK_DRIFT';
  END IF;
END
$pricing_preview_down$;

REVOKE ALL ON FUNCTION
  saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[])
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.pricing_preview(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[]
);

COMMIT;
