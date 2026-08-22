BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION saas.public_starter_retail_home(p_store_id uuid,p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE presentation jsonb; section jsonb; result record; items jsonb; rows jsonb:='[]'::jsonb; allow_index boolean:=false;
BEGIN
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT domain.hostname_type='custom_domain' AND domain.is_primary INTO allow_index FROM saas.store_domains domain WHERE domain.store_id=p_store_id AND domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now;
 presentation:=saas.public_starter_retail_presentation(p_store_id,p_now,COALESCE(allow_index,false)); IF presentation IS NULL OR presentation->>'schemaVersion'<>'3' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(presentation->'sections') LOOP
  IF section->>'kind'<>'product_row' THEN CONTINUE; END IF;
  IF section->>'source'='category' THEN
   SELECT * INTO result FROM saas.public_list_products_by_category(p_store_id,p_hostname,p_now,section->>'categorySlug',(section->>'limit')::integer);
   items:=result.result_payload->'items';
  ELSE
   SELECT * INTO result FROM saas.public_list_products(p_store_id,p_hostname,p_now,CASE WHEN section->>'source'='sale' THEN 48 ELSE (section->>'limit')::integer END);
   items:=result.result_payload;
   IF section->>'source'='sale' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(value),'[]'::jsonb) INTO items FROM (SELECT value FROM pg_catalog.jsonb_array_elements(items) value WHERE value?'compareAtCents' AND (value->>'compareAtCents')::bigint>(value->>'priceCents')::bigint LIMIT (section->>'limit')::integer) selected;
   END IF;
  END IF;
  IF result.outcome<>'found' OR items IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(filtered.value ORDER BY filtered.ordinality),'[]'::jsonb) INTO items
  FROM pg_catalog.jsonb_array_elements(items) WITH ORDINALITY AS filtered(value,ordinality)
  WHERE COALESCE((filtered.value->>'available')::boolean,false);
  rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key',section->>'key','items',items));
 END LOOP;
 RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('presentation',presentation,'productRows',rows);
END
$f$;

REVOKE ALL ON FUNCTION saas.public_starter_retail_home(uuid,text,timestamptz) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_starter_retail_home(uuid,text,timestamptz) TO celebix_saas_host_resolver;

COMMIT;
