DO $exact_record_lookups_analytics_assertions$
DECLARE
  catalog_get regprocedure :=
    'saas.catalog_admin_get_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid)'::regprocedure;
  merchant_get regprocedure :=
    'saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid)'::regprocedure;
  top_products regprocedure :=
    'saas.merchant_analytics_top_products(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure;
  dashboard regprocedure :=
    'saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)'::regprocedure;
  target regprocedure;
  definition text;
  function_owner oid;
  app_role oid;
BEGIN
  SELECT oid INTO app_role
  FROM pg_catalog.pg_roles
  WHERE rolname='celebix_saas_app';

  FOREACH target IN ARRAY ARRAY[catalog_get,merchant_get] LOOP
    SELECT pg_catalog.pg_get_functiondef(proc.oid),proc.proowner
    INTO definition,function_owner
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid=target
      AND proc.provolatile='s'
      AND proc.prosecdef
      AND proc.proconfig=ARRAY['search_path=pg_catalog, saas']::text[];

    IF definition IS NULL
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',target,'EXECUTE')
       OR pg_catalog.has_function_privilege('public',target,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_identity',target,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',target,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',target,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_bootstrap',target,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_observability',target,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_migrator',target,'EXECUTE') THEN
      RAISE EXCEPTION 'exact record lookup metadata or ACL drift: %',target;
    END IF;

    IF EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
      ) AS privilege
      WHERE proc.oid=target
        AND privilege.privilege_type='EXECUTE'
        AND privilege.grantee NOT IN(function_owner,app_role)
    ) THEN
      RAISE EXCEPTION 'exact record lookup contains an unexpected grantee: %',target;
    END IF;
  END LOOP;

  definition:=pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(catalog_get),'[[:space:]]+','','g'
  );
  IF pg_catalog.strpos(definition,'resource.store_id=p_store_id')=0
     OR pg_catalog.strpos(definition,'resource.id=p_resource_id')=0
     OR pg_catalog.strpos(definition,'resource.resource_kind=p_kind')=0 THEN
    RAISE EXCEPTION 'catalog exact lookup scope drift';
  END IF;

  definition:=pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(merchant_get),'[[:space:]]+','','g'
  );
  IF pg_catalog.strpos(definition,'record.store_id=p_store_id')=0
     OR pg_catalog.strpos(definition,'record.id=p_record_id')=0
     OR pg_catalog.strpos(definition,'record.record_kind=p_kind')=0 THEN
    RAISE EXCEPTION 'merchant exact lookup scope drift';
  END IF;

  definition:=pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(top_products),'[[:space:]]+','','g'
  );
  IF pg_catalog.strpos(definition,'GROUPBYproduct_id')=0
     OR pg_catalog.strpos(definition,'DISTINCTON(product_id)')=0
     OR pg_catalog.strpos(definition,'ORDERBYproduct_id,created_atDESC,idDESC')=0 THEN
    RAISE EXCEPTION 'analytics product identity drift';
  END IF;

  definition:=pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(dashboard),'[[:space:]]+','','g'
  );
  IF pg_catalog.strpos(definition,'GROUPBYitem.product_idHAVING')=0 THEN
    RAISE EXCEPTION 'analytics overflow identity drift';
  END IF;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_app',dashboard,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',dashboard,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app',top_products,'EXECUTE')
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.catalog_admin_resources','SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.catalog_admin_resource_products','SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.merchant_admin_records','SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.order_items','SELECT') THEN
    RAISE EXCEPTION 'analytics or direct relation ACL drift';
  END IF;
END
$exact_record_lookups_analytics_assertions$;
