-- Phase 3A1 catalog ownership, RLS, ACL, function and structural assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3a1_product_catalog_assertions$
DECLARE
  checked_table text;
  checked_function regprocedure;
  public_function regprocedure;
  function_config text[];
BEGIN
  IF pg_catalog.to_regclass('saas.stores') IS NULL
     OR pg_catalog.to_regclass('saas.products') IS NULL
     OR pg_catalog.to_regclass('saas.product_variants') IS NULL
     OR pg_catalog.to_regclass('saas.catalog_operations') IS NULL THEN
    RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: additive table set missing';
  END IF;

  FOREACH checked_table IN ARRAY ARRAY['products', 'product_variants', 'catalog_operations'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
      WHERE namespace.nspname = 'saas'
        AND relation.relname = checked_table
        AND relation.relkind = 'r'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND owner_role.rolname = 'celebix_saas_owner'
    ) THEN
      RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: ownership/RLS drift on %', checked_table;
    END IF;

    IF EXISTS (
         SELECT 1
         FROM pg_catalog.pg_class AS relation,
              LATERAL pg_catalog.aclexplode(
                COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
              ) AS privilege
         WHERE relation.oid = ('saas.' || checked_table)::regclass
           AND privilege.grantee = 0
       )
       OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.' || checked_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: broad table privilege on %', checked_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.product_variants'::regclass
      AND conname = 'product_variants_product_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(store_id, product_id\) REFERENCES saas.products\(store_id, id\) ON DELETE RESTRICT'
  ) THEN
    RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: composite product/store authority missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname = 'saas'
      AND indexname = 'product_variants_store_sku_key'
      AND indexdef ~ 'UNIQUE.*\(store_id, sku\).*WHERE \(sku IS NOT NULL\)'
  ) THEN
    RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: partial SKU authority missing';
  END IF;

  IF pg_catalog.to_regprocedure('saas.catalog_delete_product(uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('saas.catalog_delete_variant(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: hard-delete surface exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.catalog_operations'::regclass
      AND tgname = 'catalog_operations_immutable'
      AND NOT tgisinternal
      AND (tgtype & 1) = 1
      AND (tgtype & 2) = 2
      AND (tgtype & 8) = 8
      AND (tgtype & 16) = 16
      AND tgfoid = 'saas.guard_catalog_operation_mutation()'::regprocedure
  )
  OR pg_catalog.pg_get_functiondef('saas.guard_catalog_operation_mutation()'::regprocedure)
     !~ 'CATALOG_OPERATION_IMMUTABLE' THEN
    RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: operation immutability guard missing';
  END IF;

  FOREACH checked_function IN ARRAY ARRAY[
    'saas.catalog_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)'::regprocedure,
    'saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure,
    'saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)'::regprocedure,
    'saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
    'saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,text)'::regprocedure,
    'saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,
    'saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
    'saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
    'saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)'::regprocedure,
    'saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'::regprocedure
  ] LOOP
    SELECT procedure.proconfig INTO function_config
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE procedure.oid = checked_function
      AND procedure.prosecdef
      AND owner_role.rolname = 'celebix_saas_owner';
    IF function_config IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN
      RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: SECURITY DEFINER drift on %', checked_function;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure,
           LATERAL pg_catalog.aclexplode(
             COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
           ) AS privilege
      WHERE procedure.oid = checked_function
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: PUBLIC EXECUTE on %', checked_function;
    END IF;
  END LOOP;

  FOREACH public_function IN ARRAY ARRAY[
    'saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure,
    'saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)'::regprocedure,
    'saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
    'saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,text)'::regprocedure,
    'saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,
    'saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
    'saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
    'saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)'::regprocedure,
    'saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'::regprocedure
  ] LOOP
    IF NOT pg_catalog.has_function_privilege('celebix_saas_app', public_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: app EXECUTE missing on %', public_function;
    END IF;
  END LOOP;

  IF pg_catalog.pg_get_functiondef(
       'saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure
     ) !~ 'pg_advisory_xact_lock.*saas.catalog.store:' THEN
    RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: product-limit serialization missing';
  END IF;

  IF pg_catalog.pg_get_functiondef(
       'saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'::regprocedure
     ) ~* '\m(INSERT|UPDATE|DELETE)\M' THEN
    RAISE EXCEPTION 'PHASE3A1_CATALOG_ASSERTION_FAILED: recovery is not read-only';
  END IF;
END
$phase3a1_product_catalog_assertions$;

ROLLBACK;
