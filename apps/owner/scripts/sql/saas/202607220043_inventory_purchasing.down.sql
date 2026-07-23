BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.purchase_orders)
     OR EXISTS(SELECT 1 FROM saas.inventory_operations)
     OR EXISTS(
       SELECT 1 FROM saas.inventory_movements
       WHERE movement_kind<>'opening'
     ) THEN
    RAISE EXCEPTION 'INVENTORY_PURCHASING_ROLLBACK_BLOCKED';
  END IF;
END
$precondition$;

DROP TRIGGER product_variants_inventory_reconcile ON saas.product_variants;

CREATE FUNCTION saas.inventory_strip_function_marker(p_signature text)
RETURNS void
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  definition text;
  stripped text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p_signature::regprocedure) INTO definition;
  IF (
    pg_catalog.length(definition)-
    pg_catalog.length(pg_catalog.replace(definition,'-- inventory marker begin',''))
  )/pg_catalog.length('-- inventory marker begin')<>1
  OR (
    pg_catalog.length(definition)-
    pg_catalog.length(pg_catalog.replace(definition,'-- inventory marker end',''))
  )/pg_catalog.length('-- inventory marker end')<>1 THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;
  stripped:=pg_catalog.regexp_replace(
    definition,
    E'^[ \\t]*-- inventory marker begin[ \\t]*\\n(?:[ \\t]*PERFORM pg_catalog[.]set_config[(]''saas[.]inventory[.](source_marker|source_id|source_time)''[^\\r\\n]*\\n)+',
    '',
    'gn'
  );
  stripped:=pg_catalog.regexp_replace(
    stripped,
    E'(?:^[ \\t]*PERFORM pg_catalog[.]set_config[(]''saas[.]inventory[.](source_marker|source_id|source_time)''[^\\r\\n]*\\n)+^[ \\t]*-- inventory marker end[ \\t]*\\n',
    '',
    'gn'
  );
  EXECUTE stripped;
END
$f$;

SELECT saas.inventory_strip_function_marker(
  'saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'
);
SELECT saas.inventory_strip_function_marker(
  'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid)'
);

DROP FUNCTION saas.inventory_strip_function_marker(text);

DROP FUNCTION saas.inventory_recover_operation(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text
);
DROP FUNCTION saas.purchasing_receive(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,jsonb
);
DROP FUNCTION saas.purchasing_transition(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text
);
DROP FUNCTION saas.purchasing_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,text,jsonb
);
DROP FUNCTION saas.purchasing_get(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid
);
DROP FUNCTION saas.purchasing_list(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz
);
DROP FUNCTION saas.inventory_list_balances(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid
);
DROP FUNCTION saas.inventory_list_locations(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz
);

DROP FUNCTION saas.inventory_mutation_projection(uuid,uuid,boolean);
DROP FUNCTION saas.inventory_purchase_projection(uuid,uuid);
DROP FUNCTION saas.inventory_location_projection(uuid,uuid);
DROP FUNCTION saas.inventory_receipt_lines_valid(jsonb);
DROP FUNCTION saas.inventory_purchase_lines_valid(jsonb);
DROP FUNCTION saas.inventory_reconcile_variant_stock_trigger();
DROP FUNCTION saas.inventory_reconcile_variant_delta(uuid,uuid,bigint,bigint,boolean);
DROP FUNCTION saas.inventory_active_balance_total(uuid,uuid);

DROP TABLE saas.inventory_operations;
DROP TABLE saas.purchase_order_lines;
DROP TABLE saas.purchase_orders;
DROP TABLE saas.inventory_movements;
DROP TABLE saas.inventory_balances;
DROP TABLE saas.inventory_locations;

DROP FUNCTION saas.guard_inventory_operation_mutation();
DROP FUNCTION saas.guard_inventory_movement_mutation();
DROP FUNCTION saas.inventory_deterministic_uuid(text,text);

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL OR p_required_action IS NULL OR p_required_action NOT IN ('orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage','customers.read','customers.manage','customers.archive','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.import','catalog_admin.moderate','promotions.read','promotions.manage','promotions.archive','content.read','content.manage','content.archive','marketing.read','marketing.manage','configuration.read','configuration.manage','configuration.archive','integrations.read','integrations.manage','analytics.read') THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND s.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT m.role INTO membership_role FROM saas.memberships m WHERE m.id=p_membership_id AND m.store_id=p_store_id AND m.principal_id=p_principal_id AND m.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store_id AND s.plan_id=p_plan_id AND s.plan_code=p_plan_code AND s.plan_version=p_plan_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=p_plan_id AND f.enabled AND f.feature_key=p_required_feature) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (membership_role IN ('store_owner','admin') OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note','carts.read','customers.read','customers.manage','catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage','marketing.read','configuration.read','integrations.read','analytics.read')) OR (membership_role='analyst' AND p_required_action IN ('orders.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read','marketing.read','configuration.read','integrations.read','analytics.read'))) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END $f$;

COMMIT;
