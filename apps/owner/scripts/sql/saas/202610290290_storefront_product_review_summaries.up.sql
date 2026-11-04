BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.storefront-product-review-summaries.release290',0));

CREATE INDEX product_reviews_approved_product_summary_idx
 ON saas.product_reviews(store_id,product_id) INCLUDE(rating) WHERE status='approved';

CREATE FUNCTION saas.public_product_review_summaries(p_hostname text,p_now timestamptz,p_product_ids uuid[])
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;items jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_product_ids IS NULL
  OR cardinality(p_product_ids)>500 OR coalesce(array_ndims(p_product_ids),1)<>1
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF array_position(p_product_ids,NULL::uuid) IS NOT NULL
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.storefront_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 -- Match public_product_page_review_availability before reading any review rows.
 IF NOT EXISTS(SELECT 1 FROM saas.product_page_review_settings s WHERE s.store_id=selected_store AND s.enabled)
 THEN RETURN QUERY SELECT 'found','{"enabled":false,"items":[]}'::jsonb;RETURN;END IF;
 WITH requested AS(
  SELECT product_id,min(ordinal) AS first_ordinal
  FROM unnest(p_product_ids) WITH ORDINALITY r(product_id,ordinal) GROUP BY product_id
 ), visible AS(
  SELECT p.id,r.first_ordinal FROM requested r JOIN saas.products p
   ON p.store_id=selected_store AND p.id=r.product_id AND p.status='active'
 ), summaries AS(
  SELECT p.id,p.first_ordinal,coalesce(avg(r.rating),0) AS average_rating,count(r.rating) AS review_count
  FROM visible p LEFT JOIN saas.product_reviews r
   ON r.store_id=selected_store AND r.product_id=p.id AND r.status='approved'
  GROUP BY p.id,p.first_ordinal
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('productId',s.id,'averageRating',s.average_rating,'reviewCount',s.review_count) ORDER BY s.first_ordinal),'[]'::jsonb)
 INTO items FROM summaries s;
 RETURN QUERY SELECT 'found',jsonb_build_object('enabled',true,'items',items);
END $f$;

REVOKE ALL ON FUNCTION saas.public_product_review_summaries(text,timestamptz,uuid[])
 FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
 celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_product_review_summaries(text,timestamptz,uuid[]) TO celebix_saas_host_resolver;
COMMIT;
