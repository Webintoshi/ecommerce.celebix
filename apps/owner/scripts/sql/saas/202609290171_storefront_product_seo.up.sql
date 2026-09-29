-- Additive opt-in SEO detail projection. Existing V1 clients remain strict.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE FUNCTION saas.public_starter_product_detail_v2(p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE detail record; selected_title text; selected_description text;
BEGIN
 SELECT * INTO detail FROM saas.public_starter_product_detail(p_store_id,p_hostname,p_now,p_slug);
 IF detail.outcome IS DISTINCT FROM 'found' THEN
  RETURN QUERY SELECT detail.outcome,detail.result_payload; RETURN;
 END IF;
 -- The authorized V1 projection supplies identity, never an unchecked caller ID.
 SELECT profile.seo_title,profile.seo_description INTO selected_title,selected_description
 FROM saas.catalog_product_profiles profile
 WHERE profile.store_id=p_store_id AND profile.product_id=(detail.result_payload->>'id')::uuid;
 RETURN QUERY SELECT 'found'::text,detail.result_payload||pg_catalog.jsonb_build_object('seoTitle',selected_title,'seoDescription',selected_description);
END
$f$;
REVOKE ALL ON FUNCTION saas.public_starter_product_detail_v2(uuid,text,timestamptz,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_starter_product_detail_v2(uuid,text,timestamptz,text) TO celebix_saas_host_resolver;
COMMIT;
