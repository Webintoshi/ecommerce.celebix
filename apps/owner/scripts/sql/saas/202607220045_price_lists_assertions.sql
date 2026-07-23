BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  relation_name text;
  signature text;
  unexpected bigint;
  definition text;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  host_oid oid:='celebix_saas_host_resolver'::regrole;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'price_lists','price_list_items','price_list_rules','price_list_operations'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
        AND relation.relname=relation_name
        AND relation.relkind='r'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner)='celebix_saas_owner'
    ) THEN
      RAISE EXCEPTION 'PRICE_LIST_RELATION_AUTHORITY_INVALID:%',relation_name;
    END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname='saas' AND policy.tablename=relation_name
    ) OR EXISTS(
      SELECT 1 FROM information_schema.role_table_grants grant_row
      WHERE grant_row.table_schema='saas'
        AND grant_row.table_name=relation_name
        AND grant_row.grantee IN(
          'PUBLIC','celebix_saas_app','celebix_saas_workflow',
          'celebix_saas_host_resolver','celebix_saas_identity',
          'celebix_saas_bootstrap','celebix_saas_observability',
          'celebix_saas_migrator'
        )
    ) THEN
      RAISE EXCEPTION 'PRICE_LIST_RELATION_ACL_INVALID:%',relation_name;
    END IF;
  END LOOP;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid='saas.price_list_operations'::regclass
      AND trigger_row.tgname='price_list_operations_immutable'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'PRICE_LIST_OPERATION_TRIGGER_INVALID';
  END IF;

  IF (
    SELECT pg_catalog.array_agg(value ORDER BY value)
    FROM (
      SELECT DISTINCT status AS value FROM saas.price_lists
      UNION ALL SELECT 'active'
      UNION ALL SELECT 'archived'
      UNION ALL SELECT 'draft'
    ) vocabulary
  ) IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.price_lists'::regclass
      AND conname='price_lists_lifecycle_check'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.price_list_rules'::regclass
      AND conname='price_list_rules_channel_check'
      AND pg_catalog.pg_get_constraintdef(oid)
        ~ 'storefront.*quick_order'
  ) THEN
    RAISE EXCEPTION 'PRICE_LIST_FINITE_VOCABULARY_INVALID';
  END IF;

  FOREACH signature IN ARRAY ARRAY[
    'saas.pricing_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.pricing_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.pricing_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb,jsonb)',
    'saas.pricing_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.pricing_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.pricing_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    IF pg_catalog.pg_get_userbyid(
      (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=signature::regprocedure)
    )<>'celebix_saas_owner'
       OR NOT pg_catalog.has_function_privilege(
         'celebix_saas_app',signature,'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'celebix_saas_workflow',signature,'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'celebix_saas_host_resolver',signature,'EXECUTE'
       ) THEN
      RAISE EXCEPTION 'PRICE_LIST_FUNCTION_ACL_INVALID:%',signature;
    END IF;
    SELECT pg_catalog.count(*) INTO unexpected
    FROM pg_catalog.pg_proc proc
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
    ) acl
    WHERE proc.oid=signature::regprocedure
      AND acl.privilege_type='EXECUTE'
      AND acl.grantee<>ALL(ARRAY[app_oid,proc.proowner]);
    IF unexpected<>0 THEN
      RAISE EXCEPTION 'PRICE_LIST_FUNCTION_ACL_INVALID:%',signature;
    END IF;
  END LOOP;

  signature:=
    'saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)';
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc proc
    WHERE proc.oid=signature::regprocedure
      AND proc.provolatile='s'
      AND proc.prosecdef
      AND pg_catalog.pg_get_userbyid(proc.proowner)='celebix_saas_owner'
      AND proc.proconfig=ARRAY['search_path=pg_catalog, saas']
  ) THEN
    RAISE EXCEPTION 'PRICE_LIST_RESOLVER_DEFINITION_INVALID';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'
  ] LOOP
    IF NOT pg_catalog.has_function_privilege(relation_name,signature,'EXECUTE') THEN
      RAISE EXCEPTION 'PRICE_LIST_RESOLVER_ACL_INVALID:%',relation_name;
    END IF;
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY[
    'celebix_saas_identity','celebix_saas_bootstrap',
    'celebix_saas_observability','celebix_saas_migrator'
  ] LOOP
    IF pg_catalog.has_function_privilege(relation_name,signature,'EXECUTE') THEN
      RAISE EXCEPTION 'PRICE_LIST_RESOLVER_ACL_INVALID:%',relation_name;
    END IF;
  END LOOP;
  SELECT pg_catalog.count(*) INTO unexpected
  FROM pg_catalog.pg_proc proc
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
  ) acl
  WHERE proc.oid=signature::regprocedure
    AND acl.privilege_type='EXECUTE'
    AND acl.grantee<>ALL(
      ARRAY[app_oid,workflow_oid,host_oid,proc.proowner]
    );
  IF unexpected<>0 THEN
    RAISE EXCEPTION 'PRICE_LIST_RESOLVER_ACL_INVALID';
  END IF;

  FOREACH signature IN ARRAY ARRAY[
    'saas.pricing_json_timestamp(timestamp with time zone)',
    'saas.pricing_items_valid(uuid,jsonb)',
    'saas.pricing_rules_valid(uuid,jsonb,timestamp with time zone)',
    'saas.pricing_projection(uuid,uuid)',
    'saas.guard_price_list_operation_mutation()'
  ] LOOP
    FOREACH relation_name IN ARRAY ARRAY[
      'celebix_saas_app','celebix_saas_workflow',
      'celebix_saas_host_resolver','celebix_saas_identity',
      'celebix_saas_bootstrap','celebix_saas_observability',
      'celebix_saas_migrator'
    ] LOOP
      IF pg_catalog.has_function_privilege(
        relation_name,signature,'EXECUTE'
      ) THEN
        RAISE EXCEPTION 'PRICE_LIST_HELPER_ACL_INVALID:%:%',
          signature,relation_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'saas.public_list_products(uuid,text,timestamp with time zone,integer)',
    'saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)',
    'saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)',
    'saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)',
    'saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)',
    'saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)',
    'saas.quick_links_duplicate_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(signature::regprocedure)
    INTO definition;
    IF definition NOT LIKE '%resolve_effective_variant_price%' THEN
      RAISE EXCEPTION 'PRICE_LIST_READER_PATCH_INVALID:%',signature;
    END IF;
  END LOOP;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.price_list_items'::regclass
      AND conname='price_list_items_variant_store_fk'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.price_list_rules'::regclass
      AND conname='price_list_rules_tag_store_fk'
  ) THEN
    RAISE EXCEPTION 'PRICE_LIST_STORE_COMPOSITE_INVALID';
  END IF;
END
$assertions$;

COMMIT;
