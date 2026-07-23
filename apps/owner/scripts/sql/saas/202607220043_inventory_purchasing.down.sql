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

CREATE FUNCTION saas.inventory_strip_function_marker(
  p_signature text,
  p_expected_marker text,
  p_expected_source_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  definition text;
  stripped text;
  marker_set text;
  source_id_set text;
  source_time_set text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_time'',p_now::text,true);';
  marker_clear text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_marker'','''',true);';
  source_id_clear text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_id'','''',true);';
  source_time_clear text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_time'','''',true);';
  prefix_fragment text;
  suffix_fragment text;
  prefix_residue text;
  suffix_residue text;
  prefix_start integer;
  prefix_end integer;
  suffix_start integer;
  suffix_end integer;
  definition_length integer;
  begin_position integer;
  end_position integer;
  marker_set_position integer;
  source_id_set_position integer;
  source_time_set_position integer;
  marker_clear_position integer;
  source_id_clear_position integer;
  source_time_clear_position integer;
  guc_call_count integer;
BEGIN
  IF p_expected_marker NOT IN('catalog_adjustment','checkout_sale')
     OR p_expected_source_id NOT IN('p_operation_id::text','current_attempt.id::text') THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;
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
  marker_set:=pg_catalog.format(
    'PERFORM pg_catalog.set_config(''saas.inventory.source_marker'',''%s'',true);',
    p_expected_marker
  );
  source_id_set:=pg_catalog.format(
    'PERFORM pg_catalog.set_config(''saas.inventory.source_id'',%s,true);',
    p_expected_source_id
  );
  begin_position:=pg_catalog.strpos(definition,'-- inventory marker begin');
  end_position:=pg_catalog.strpos(definition,'-- inventory marker end');
  marker_set_position:=pg_catalog.strpos(definition,marker_set);
  source_id_set_position:=pg_catalog.strpos(definition,source_id_set);
  source_time_set_position:=pg_catalog.strpos(definition,source_time_set);
  marker_clear_position:=pg_catalog.strpos(definition,marker_clear);
  source_id_clear_position:=pg_catalog.strpos(definition,source_id_clear);
  source_time_clear_position:=pg_catalog.strpos(definition,source_time_clear);
  guc_call_count:=(
    pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(
      definition,
      'PERFORM pg_catalog.set_config(''saas.inventory.',
      ''
    ))
  )/pg_catalog.length('PERFORM pg_catalog.set_config(''saas.inventory.');
  IF guc_call_count<>6
     OR NOT(
       begin_position<marker_set_position
       AND marker_set_position<source_id_set_position
       AND source_id_set_position<source_time_set_position
       AND source_time_set_position<marker_clear_position
       AND marker_clear_position<source_id_clear_position
       AND source_id_clear_position<source_time_clear_position
       AND source_time_clear_position<end_position
  ) THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;
  definition_length:=pg_catalog.length(definition);

  prefix_start:=begin_position;
  WHILE prefix_start>1
    AND pg_catalog.substr(definition,prefix_start-1,1) IN(' ',E'\t') LOOP
    prefix_start:=prefix_start-1;
  END LOOP;
  IF prefix_start>1
     AND pg_catalog.substr(definition,prefix_start-1,1)<>E'\n' THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;
  prefix_end:=source_time_set_position+pg_catalog.length(source_time_set);
  WHILE prefix_end<=definition_length
    AND pg_catalog.substr(definition,prefix_end,1) IN(' ',E'\t',E'\r') LOOP
    prefix_end:=prefix_end+1;
  END LOOP;
  IF prefix_end>definition_length
     OR pg_catalog.substr(definition,prefix_end,1)<>E'\n' THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;
  prefix_end:=prefix_end+1;
  prefix_fragment:=pg_catalog.substr(
    definition,prefix_start,prefix_end-prefix_start
  );
  prefix_residue:=prefix_fragment;
  prefix_residue:=pg_catalog.replace(
    prefix_residue,'-- inventory marker begin',''
  );
  prefix_residue:=pg_catalog.replace(prefix_residue,marker_set,'');
  prefix_residue:=pg_catalog.replace(prefix_residue,source_id_set,'');
  prefix_residue:=pg_catalog.replace(prefix_residue,source_time_set,'');
  IF pg_catalog.btrim(prefix_residue,E' \t\r\n')<>'' THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;

  suffix_start:=marker_clear_position;
  WHILE suffix_start>1
    AND pg_catalog.substr(definition,suffix_start-1,1) IN(' ',E'\t') LOOP
    suffix_start:=suffix_start-1;
  END LOOP;
  IF suffix_start>1
     AND pg_catalog.substr(definition,suffix_start-1,1)<>E'\n' THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;
  suffix_end:=end_position+pg_catalog.length('-- inventory marker end');
  WHILE suffix_end<=definition_length
    AND pg_catalog.substr(definition,suffix_end,1) IN(' ',E'\t',E'\r') LOOP
    suffix_end:=suffix_end+1;
  END LOOP;
  IF suffix_end>definition_length
     OR pg_catalog.substr(definition,suffix_end,1)<>E'\n' THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;
  suffix_end:=suffix_end+1;
  suffix_fragment:=pg_catalog.substr(
    definition,suffix_start,suffix_end-suffix_start
  );
  suffix_residue:=suffix_fragment;
  suffix_residue:=pg_catalog.replace(suffix_residue,marker_clear,'');
  suffix_residue:=pg_catalog.replace(suffix_residue,source_id_clear,'');
  suffix_residue:=pg_catalog.replace(suffix_residue,source_time_clear,'');
  suffix_residue:=pg_catalog.replace(
    suffix_residue,'-- inventory marker end',''
  );
  IF pg_catalog.btrim(suffix_residue,E' \t\r\n')<>'' THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_DRIFT: %',p_signature;
  END IF;

  stripped:=pg_catalog.replace(definition,prefix_fragment,'');
  stripped:=pg_catalog.replace(stripped,suffix_fragment,'');
  IF stripped LIKE '%-- inventory marker begin%'
     OR stripped LIKE '%-- inventory marker end%'
     OR stripped LIKE '%saas.inventory.source_marker%'
     OR stripped LIKE '%saas.inventory.source_id%'
     OR stripped LIKE '%saas.inventory.source_time%' THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_RESTORE_RESIDUE: %',p_signature;
  END IF;
  EXECUTE stripped;
END
$f$;

SELECT saas.inventory_strip_function_marker(
  'saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
  'catalog_adjustment','p_operation_id::text'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
  'catalog_adjustment','p_operation_id::text'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
  'catalog_adjustment','p_operation_id::text'
);
SELECT saas.inventory_strip_function_marker(
  'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)',
  'checkout_sale','current_attempt.id::text'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)',
  'catalog_adjustment','p_operation_id::text'
);
SELECT saas.inventory_strip_function_marker(
  'saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid)',
  'catalog_adjustment','p_operation_id::text'
);

DROP FUNCTION saas.inventory_strip_function_marker(text,text,text);

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
