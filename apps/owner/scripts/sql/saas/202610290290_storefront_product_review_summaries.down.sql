BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.storefront-product-review-summaries.release290',0));
DO $guard290$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('saas.public_product_review_summaries(text,timestamptz,uuid[])')
  AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s'
  AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='099b5e383a35657779e840734899d0d982b3d40320cb3880a5c39f4f561c26ed')
 THEN RAISE EXCEPTION 'STOREFRONT_REVIEW_SUMMARY290_DOWN_STATE_INVALID';END IF;
END $guard290$;
DROP FUNCTION saas.public_product_review_summaries(text,timestamptz,uuid[]);
DROP INDEX saas.product_reviews_approved_product_summary_idx;
COMMIT;
