BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE selected_count bigint; search_body text;
BEGIN
  IF pg_catalog.to_regclass('saas.store_policy_pages') IS NULL
     OR pg_catalog.to_regclass('saas.store_policy_operations') IS NULL
     OR pg_catalog.to_regprocedure('saas.store_policy_list_admin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.store_policy_recover(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_policy_index(text,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_policy_get(text,timestamp with time zone,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_search_products(text,timestamp with time zone,text,integer,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_resolve_product_ids(text,timestamp with time zone,uuid[])') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_POLICY_SEARCH_CATALOG_INVALID'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_class relation
    WHERE relation.oid IN('saas.store_policy_pages'::regclass,'saas.store_policy_operations'::regclass)
      AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) THEN RAISE EXCEPTION 'STOREFRONT_POLICY_SEARCH_RLS_INVALID'; END IF;

  SELECT pg_catalog.count(*) INTO selected_count
  FROM saas.stores store
  LEFT JOIN saas.store_policy_pages page ON page.store_id=store.id
  GROUP BY store.id HAVING pg_catalog.count(page.policy_key)<>7 LIMIT 1;
  IF selected_count IS NOT NULL THEN RAISE EXCEPTION 'STOREFRONT_POLICY_SEARCH_SEED_INVALID'; END IF;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint,text,text)','EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint,text,text)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_policy_index(text,timestamp with time zone)','EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app','saas.public_policy_index(text,timestamp with time zone)','EXECUTE')
  THEN RAISE EXCEPTION 'STOREFRONT_POLICY_SEARCH_FUNCTION_ACL_INVALID'; END IF;

  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.store_policy_pages','SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.store_policy_pages','UPDATE')
     OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.store_policy_pages','SELECT')
  THEN RAISE EXCEPTION 'STOREFRONT_POLICY_SEARCH_TABLE_ACL_INVALID'; END IF;

  SELECT pg_catalog.pg_get_functiondef('saas.public_search_products(text,timestamp with time zone,text,integer,text)'::regprocedure) INTO search_body;
  IF pg_catalog.strpos(search_body,'pg_catalog.octet_length(p_query)>100')=0
    OR pg_catalog.strpos(search_body,'catalog_product_categories')=0
    OR pg_catalog.strpos(search_body,'catalog_admin_resource_products')=0
    OR pg_catalog.strpos(search_body,'resource.resource_kind IN(''brand'',''tag'')')=0
    OR pg_catalog.strpos(search_body,'SELECT * FROM candidates WHERE payload IS NOT NULL')=0
  THEN RAISE EXCEPTION 'STOREFRONT_POLICY_SEARCH_AUTHORITY_BODY_INVALID'; END IF;
END
$assertions$;

COMMIT;
