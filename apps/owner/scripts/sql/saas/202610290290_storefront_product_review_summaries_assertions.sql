BEGIN;
DO $assert290$
DECLARE signature text:='saas.public_product_review_summaries(text,timestamptz,uuid[])';role_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(signature)
  AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s'
  AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[] AND NOT p.proisstrict AND p.proparallel='u'
  AND p.prokind='f' AND p.proretset AND p.prorettype='record'::regtype
  AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  AND pg_get_function_result(p.oid)='TABLE(outcome text, result_payload jsonb)'
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='099b5e383a35657779e840734899d0d982b3d40320cb3880a5c39f4f561c26ed'
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.grantee NOT IN('celebix_saas_owner'::regrole,'celebix_saas_host_resolver'::regrole)))
 THEN RAISE EXCEPTION 'STOREFRONT_REVIEW_SUMMARY290_FUNCTION_AUTHORITY';END IF;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP
  IF has_function_privilege(role_name,signature,'EXECUTE') IS DISTINCT FROM(role_name='celebix_saas_host_resolver')
  THEN RAISE EXCEPTION 'STOREFRONT_REVIEW_SUMMARY290_ROLE_BOUNDARY:%',role_name;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
  WHERE c.oid=to_regclass('saas.product_reviews_approved_product_summary_idx')
   AND i.indrelid='saas.product_reviews'::regclass AND i.indisvalid AND i.indisready AND NOT i.indisunique
   AND pg_get_indexdef(i.indexrelid)='CREATE INDEX product_reviews_approved_product_summary_idx ON saas.product_reviews USING btree (store_id, product_id) INCLUDE (rating) WHERE (status = ''approved''::text)')
 THEN RAISE EXCEPTION 'STOREFRONT_REVIEW_SUMMARY290_INDEX_INVALID';END IF;
END $assert290$;
ROLLBACK;
