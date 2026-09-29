-- Content data, immutable history, legacy write firewall and public read bridge survive downgrade.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE OR REPLACE FUNCTION saas.merchant_content_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_request jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT 'unavailable'::text,NULL::jsonb $f$;
COMMIT;
