-- Public store identity/route output only: no campaign, recipient or token data.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef('saas.native_marketing_branding(uuid,timestamptz)'::regprocedure),'UTF8')),'hex')<>'686c8b97440f8272daa8e0336571bf8f9cc2a5ac2bea026c51b98c73735c6803' THEN RAISE EXCEPTION 'NATIVE253_VERIFICATION_SOURCE_DRIFT';END IF;
 IF(SELECT count(*) FROM saas.stores s WHERE s.status='active' AND saas.native_marketing_branding(s.id,transaction_timestamp()) IS NOT NULL)<>4 THEN RAISE EXCEPTION 'NATIVE253_EXPECTED_FOUR_ACTIVE_STORES';END IF;
END $guard$;
SELECT jsonb_build_object('kind','native253SupportUrlReadOnlyVerification','checkedAt',transaction_timestamp(),'expectedRuntimeSource','5256aae9b6bd1e6e58aa8246eea3c6a4755f3288','functionSha256','686c8b97440f8272daa8e0336571bf8f9cc2a5ac2bea026c51b98c73735c6803','stores',jsonb_agg(jsonb_build_object('storeId',s.id,'storeUrl',b.value->>'storeUrl','supportUrl',b.value->>'supportUrl') ORDER BY s.id))
FROM saas.stores s CROSS JOIN LATERAL(SELECT saas.native_marketing_branding(s.id,transaction_timestamp()) value) b
WHERE s.status='active' AND b.value IS NOT NULL;
ROLLBACK;
