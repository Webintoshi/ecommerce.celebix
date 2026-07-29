BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  resource_constraint text;
  list_definition text;
  save_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid)
  INTO resource_constraint
  FROM pg_catalog.pg_constraint c
  WHERE
    c.conrelid='saas.catalog_admin_resources'::regclass
    AND c.conname='catalog_admin_resources_resource_kind_check'
    AND c.contype='c'
    AND c.convalidated;
  IF resource_constraint IS NULL
    OR resource_constraint NOT LIKE '%collection%'
    OR resource_constraint NOT LIKE '%brand%'
    OR resource_constraint NOT LIKE '%attribute%'
    OR resource_constraint NOT LIKE '%extra%'
    OR resource_constraint NOT LIKE '%definition%'
    OR resource_constraint NOT LIKE '%tag%'
  THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_TAG_KIND_CONSTRAINT_INVALID';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM information_schema.columns
    WHERE table_schema='saas' AND table_name='catalog_admin_resources'
  )<>12 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_TAG_RELATION_SHAPE_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE
      n.nspname='saas'
      AND c.relname='catalog_admin_resources'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE
      n.nspname='saas'
      AND c.relname='catalog_admin_resource_products'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE
      n.nspname='saas'
      AND c.relname='catalog_admin_operations'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_TAG_RLS_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege(
    'celebix_saas_app','saas.catalog_admin_resources','INSERT,UPDATE,DELETE'
  ) OR pg_catalog.has_table_privilege(
    'celebix_saas_app','saas.catalog_admin_resource_products','INSERT,UPDATE,DELETE'
  ) OR pg_catalog.has_table_privilege(
    'celebix_saas_app','saas.catalog_admin_operations','INSERT,UPDATE,DELETE'
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_TAG_DIRECT_DML_INVALID';
  END IF;

  IF to_regprocedure(
    'saas.catalog_admin_list_resources(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)'
  ) IS NULL OR to_regprocedure(
    'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'
  ) IS NULL THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_TAG_FUNCTION_SIGNATURE_INVALID';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.catalog_admin_list_resources(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)'::regprocedure
  ) INTO list_definition;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure
  ) INTO save_definition;
  IF list_definition NOT LIKE '%catalog_admin.read%'
    OR save_definition NOT LIKE '%catalog_admin.manage%'
    OR list_definition NOT LIKE '%''tag''%'
    OR save_definition NOT LIKE '%''tag''%'
    OR list_definition LIKE '%x-store-id%'
    OR save_definition LIKE '%x-store-id%'
  THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_TAG_FUNCTION_BODY_INVALID';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.catalog_admin_list_resources(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_TAG_ACL_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE
      tgrelid='saas.catalog_admin_operations'::regclass
      AND tgname='catalog_admin_operations_immutable'
      AND tgenabled='O'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'catalog_admin_operations_immutable';
  END IF;
END
$f$;

ROLLBACK;
