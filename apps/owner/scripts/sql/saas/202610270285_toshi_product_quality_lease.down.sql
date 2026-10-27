-- Restore the exact migration170 delegator for future claims.
-- Already-issued leases are not shortened or redispatched during rollback.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.toshi-product-quality.release285',0));
DO $guard285$
DECLARE p pg_proc%ROWTYPE; language_name text;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('saas.content_authoring_claim(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint)');
 IF NOT FOUND THEN RAISE EXCEPTION 'TOSHI_QUALITY_LEASE285_PREDECESSOR_MISSING';END IF;
 IF  p.proowner <> 'celebix_saas_owner'::regrole OR NOT p.prosecdef
  OR p.provolatile <> 'v' OR p.prokind <> 'f' OR NOT p.proretset
  OR p.prorettype <> 'record'::regtype OR p.proisstrict OR p.proparallel <> 'u'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR pg_get_function_result(p.oid) <> 'TABLE(outcome text, result_payload jsonb)'
  OR p.proacl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'  THEN
  RAISE EXCEPTION 'TOSHI_QUALITY_LEASE285_METADATA_INVALID';
 END IF;
 SELECT lanname INTO language_name FROM pg_language WHERE oid=p.prolang;
 -- Exact reviewed migration170 identity, or this exact installed wrapper.
 -- Repeated up/down are safe; an unexpected local edit is never overwritten.
 IF NOT (
  (language_name='sql' AND md5(pg_get_functiondef(p.oid))='e51b56bcf1f2f62a7ff555dc1dabbae3')
  OR (language_name='plpgsql' AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='eeb53d46eda5bb5a15b59da6c67afbb9ee43ece06c4554936e7cd686311932c8')
 ) THEN RAISE EXCEPTION 'TOSHI_QUALITY_LEASE285_PREDECESSOR_INVALID';END IF;
END $guard285$;
CREATE OR REPLACE FUNCTION saas.content_authoring_claim(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'claim',p_id,p_version,NULL,'{}'::jsonb) $f$;
COMMIT;
