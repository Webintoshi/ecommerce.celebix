BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_custom_domains_down_guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname_type='custom_domain' AND status='active')
     OR EXISTS(SELECT 1 FROM saas.store_domain_provisioning WHERE lease_id IS NOT NULL) THEN
    RAISE EXCEPTION 'STOREFRONT_CUSTOM_DOMAINS_DOWN_BLOCKED';
  END IF;
END
$storefront_custom_domains_down_guard$;

CREATE OR REPLACE FUNCTION saas.resolve_public_storefront(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE projection jsonb;
BEGIN
 IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname) OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253 OR p_hostname~'[*:/?#@[:space:][:cntrl:]]' OR p_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 SELECT pg_catalog.jsonb_build_object('schemaVersion',2,'id',store.id,'name',store.name,'slug',store.slug,'hostname',domain.hostname,'primaryHostname',primary_domain.hostname,'canonicalUrl','https://'||domain.hostname||'/','currency',store.currency,'locale',store.locale,'themeKey',store.theme_key,'presentation',home.result_payload->'presentation') INTO projection
 FROM saas.store_domains domain JOIN saas.stores store ON store.id=domain.store_id AND store.status='active' JOIN saas.store_domains primary_domain ON primary_domain.store_id=store.id AND primary_domain.status='active' AND primary_domain.is_primary AND primary_domain.verified_at<=p_now CROSS JOIN LATERAL saas.public_starter_retail_home(store.id,domain.hostname,p_now) home
 WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now AND home.outcome='found';
 RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,projection;
END
$function$;

DROP FUNCTION saas.store_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean);
DROP FUNCTION saas.store_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,timestamptz);
DROP FUNCTION saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid);
DROP FUNCTION saas.merchant_store_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,jsonb,jsonb);
DROP FUNCTION saas.merchant_store_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text);
DROP FUNCTION saas.merchant_store_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.store_domain_projection(uuid);
DROP FUNCTION saas.store_domain_timestamp(timestamptz);
DROP TABLE saas.store_domain_operations;
DROP TRIGGER store_domain_provisioning_guard ON saas.store_domain_provisioning;
DROP FUNCTION saas.guard_store_domain_provisioning();
DROP FUNCTION saas.guard_store_domain_operation_mutation();
DROP TABLE saas.store_domain_provisioning;

COMMIT;
