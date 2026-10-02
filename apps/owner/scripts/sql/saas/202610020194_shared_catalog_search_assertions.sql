BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$
DECLARE tab text; fn text; selected regprocedure; expected_role text;
BEGIN
  IF saas.catalog_search_normalize(E'Iİıi ÇĞÖŞÜ çğöşü É  Mavi\tGömlek')<>'iiii cgosu cgosu e mavi gomlek' THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_NORMALIZATION_INVALID';END IF;
  FOREACH tab IN ARRAY ARRAY['catalog_search_documents','catalog_search_outbox','catalog_search_194_backup'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=('saas.'||tab)::regclass AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_RLS_INVALID:%',tab;END IF;
    IF pg_catalog.has_table_privilege('celebix_saas_app','saas.'||tab,'SELECT') OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.'||tab,'SELECT') OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.'||tab,'SELECT') THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_TABLE_AUTHORITY_INVALID:%',tab;END IF;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['saas.public_catalog_search_scope(text,timestamptz)','saas.catalog_search_claim(timestamptz,integer,uuid)','saas.catalog_search_ack(uuid,uuid,uuid,bigint,timestamptz,text)','saas.catalog_search_requeue_all(timestamptz)'] LOOP
    selected:=fn::regprocedure; expected_role:=CASE WHEN fn LIKE '%public_catalog_search_scope%' THEN 'celebix_saas_host_resolver' ELSE 'celebix_saas_workflow' END;
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid=selected AND p.prosecdef AND r.rolname='celebix_saas_owner' AND p.proconfig @> ARRAY['search_path=pg_catalog, saas'])
      OR NOT pg_catalog.has_function_privilege(expected_role,selected,'EXECUTE') OR pg_catalog.has_function_privilege('celebix_saas_app',selected,'EXECUTE') THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_FUNCTION_AUTHORITY_INVALID:%',fn;END IF;
  END LOOP;
  IF pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.catalog_search_claim(timestamptz,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_WORKER_LEAK';END IF;
  IF EXISTS(SELECT 1 FROM saas.catalog_search_documents d WHERE d.document ?| ARRAY['priceCents','price','stockQuantity','available','costCents'] OR d.document->>'storeId'<>d.store_id::text OR d.document->>'productId'<>d.product_id::text OR d.document->>'id'<>d.store_id::text||'_'||d.product_id::text) THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_DOCUMENT_INVALID';END IF;
END $assert$;
COMMIT;
