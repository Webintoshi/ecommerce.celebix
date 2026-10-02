BEGIN;
CREATE TABLE saas.lightweight_storefront_shell_backup (identity text PRIMARY KEY,definition text NOT NULL);
ALTER TABLE saas.lightweight_storefront_shell_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.lightweight_storefront_shell_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.lightweight_storefront_shell_backup FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability;
INSERT INTO saas.lightweight_storefront_shell_backup SELECT 'saas.resolve_public_storefront(text,timestamptz)',pg_catalog.pg_get_functiondef('saas.resolve_public_storefront(text,timestamptz)'::regprocedure);
CREATE OR REPLACE FUNCTION saas.resolve_public_storefront(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
     OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname)
     OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253
     OR p_hostname~'[*:/?#@[:space:][:cntrl:]]'
     OR p_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,
    'id',store.id,
    'name',store.name,
    'slug',store.slug,
    'hostname',domain.hostname,
    'primaryHostname',primary_domain.hostname,
    'canonicalUrl','https://'||primary_domain.hostname||'/',
    'currency',store.currency,
    'locale',store.locale,
    'themeKey',store.theme_key,
    'presentation',presentation.payload
  ) INTO projection
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.store_domains AS primary_domain
    ON primary_domain.store_id=store.id
   AND primary_domain.status='active'
   AND primary_domain.is_primary
   AND primary_domain.verified_at<=p_now
  CROSS JOIN LATERAL (SELECT saas.public_starter_retail_presentation(store.id,p_now,domain.hostname_type='custom_domain' AND domain.is_primary) AS payload) AS presentation
  WHERE domain.hostname=p_hostname
    AND domain.status='active'
    AND domain.verified_at<=p_now
    AND presentation.payload IS NOT NULL;
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,projection;
END
$function$;

COMMIT;
