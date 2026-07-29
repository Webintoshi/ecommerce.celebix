-- Phase 3B3 abandoned-cart ownership, RLS, constraint, ACL and immutability assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3b3_abandoned_cart_assertions$
DECLARE
  checked_table text;
  checked_index text;
  checked_role text;
BEGIN
  FOREACH checked_table IN ARRAY ARRAY['abandoned_carts','abandoned_cart_items','abandoned_cart_operations'] LOOP
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
      RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: ownership/RLS drift on %', checked_table;
    END IF;

    FOREACH checked_role IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'] LOOP
      IF pg_catalog.has_table_privilege(
        checked_role, 'saas.' || checked_table,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) THEN
        RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: runtime table privilege % on %', checked_role, checked_table;
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation,
      LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
      WHERE relation.oid = ('saas.' || checked_table)::regclass
        AND privilege.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: PUBLIC privilege on %', checked_table;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid IN ('saas.abandoned_cart_items'::regclass, 'saas.abandoned_cart_operations'::regclass)
      AND contype = 'f'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(store_id, cart_id\) REFERENCES saas.abandoned_carts\(store_id, id\)'
  ) <> 2 THEN
    RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: cart/store composite authority drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.abandoned_carts'::regclass AND conname = 'abandoned_carts_store_currency_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, currency) REFERENCES saas.stores(id, currency) ON DELETE RESTRICT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.abandoned_cart_items'::regclass AND conname = 'abandoned_cart_items_product_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(store_id, product_id\) REFERENCES saas.products\(store_id, id\)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.abandoned_cart_items'::regclass AND conname = 'abandoned_cart_items_variant_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(store_id, variant_id\) REFERENCES saas.product_variants\(store_id, id\)'
  ) THEN
    RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: store/catalog authority drift';
  END IF;

  FOREACH checked_index IN ARRAY ARRAY[
    'abandoned_carts_store_activity_idx','abandoned_carts_store_status_activity_idx',
    'abandoned_carts_store_status_total_idx','abandoned_cart_items_cart_idx',
    'abandoned_cart_operations_store_committed_idx'
  ] LOOP
    IF pg_catalog.to_regclass('saas.' || checked_index) IS NULL THEN
      RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: missing bounded index %', checked_index;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.abandoned_cart_operations'::regclass
      AND tgname = 'abandoned_cart_operations_immutable'
      AND NOT tgisinternal
      AND (tgtype & 2) = 2
      AND (tgtype & 8) = 8
      AND (tgtype & 16) = 16
      AND tgfoid = 'saas.guard_abandoned_cart_operation_mutation()'::regprocedure
  ) OR pg_catalog.pg_get_functiondef('saas.guard_abandoned_cart_operation_mutation()'::regprocedure)
       !~ 'ABANDONED_CART_OPERATION_IMMUTABLE' THEN
    RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: operation immutability drift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid IN (
      'saas.abandoned_carts'::regclass,
      'saas.abandoned_cart_items'::regclass,
      'saas.abandoned_cart_operations'::regclass
    )
  ) THEN
    RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: permissive policy drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dependency
    JOIN pg_catalog.pg_class AS relation ON relation.oid = dependency.objid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname ~ 'abandoned_cart'
  ) THEN
    RAISE EXCEPTION 'PHASE3B3_CART_ASSERTION_FAILED: public schema authority drift';
  END IF;
END
$phase3b3_abandoned_cart_assertions$;

COMMIT;
