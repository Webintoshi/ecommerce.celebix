-- Preserve usage, operations, bindings, history and save/read bridges.
-- Existing in-flight completion/failure may settle; no new resource begin/claim.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_begin(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_fingerprint text,p_source text,p_target jsonb,p_stage text,p_config_id uuid,p_provider text,p_model text,p_credential_version bigint,p_prompt_version text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT 'unavailable'::text,NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_claim(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT 'unavailable'::text,NULL::jsonb $f$;
COMMIT;
