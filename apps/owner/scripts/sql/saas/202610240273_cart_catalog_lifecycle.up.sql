-- Keep unavailable saved cart lines removable and clear saved carts only within
-- an authorized, successful permanent catalog deletion.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.cart-catalog-lifecycle.release273',0));

DO $absence$BEGIN
 IF to_regclass('saas.cart_catalog_lifecycle273_functions')IS NOT NULL THEN
  RAISE EXCEPTION 'CART_CATALOG273_ALREADY_INSTALLED';
 END IF;
END $absence$;
CREATE TABLE saas.cart_catalog_lifecycle273_functions(
 signature text PRIMARY KEY,definition text NOT NULL,predecessor_sha256 text NOT NULL,
 published_sha256 text NOT NULL,function_oid oid NOT NULL,owner_oid oid NOT NULL,
 acl aclitem[],config text[],definer boolean NOT NULL,volatility "char" NOT NULL
);
ALTER TABLE saas.cart_catalog_lifecycle273_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.cart_catalog_lifecycle273_functions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.cart_catalog_lifecycle273_functions FROM PUBLIC;
DO $private$DECLARE r record;BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  EXECUTE format('REVOKE ALL ON saas.cart_catalog_lifecycle273_functions FROM %I',r.rolname);
 END LOOP;
END $private$;

DO $patch$
DECLARE target record;p record;definition text;revised text;old_fragment text;new_fragment text;
BEGIN
 FOR target IN SELECT * FROM(VALUES
  ('saas.public_cart_mutate_without_available_stock_v090(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer)',
   '8d84f757f57fa4d32f5a917f8c82a285a9dcb8b0206d9bd6af9ce0796dc6c6cd','{celebix_saas_owner=X/celebix_saas_owner}',1),
  ('saas.delete_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text)',
   '55bd940ebadda212e949bb3d1fdd421e79002e68857401720fb91cf8a2c4a706','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}',2),
  ('saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid)',
   '0a44dd5a0db3c80b862cc8383c0dc72b064bbe8e2045b374fdbe86979a316998','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}',3),
  ('saas.guard_inventory_movement_mutation()',
   'a267db0db6f3a14a0f4e1067f295402321e807a81f6fffdb9e145fd29060452a','{celebix_saas_owner=X/celebix_saas_owner}',4)
 )t(signature,expected_sha256,expected_acl,kind)LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(target.signature);
  IF p.oid IS NULL OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl::text IS DISTINCT FROM target.expected_acl
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR p.prosecdef IS DISTINCT FROM(target.kind<>4)
   OR p.provolatile<>(CASE WHEN target.kind=3 THEN 's'::"char" ELSE 'v'::"char" END)
   OR p.proisstrict OR p.proparallel<>'u'
  THEN RAISE EXCEPTION 'CART_CATALOG273_PREDECESSOR_DRIFT:%',target.signature;END IF;
  definition:=pg_get_functiondef(p.oid);
  IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>target.expected_sha256 THEN
   RAISE EXCEPTION 'CART_CATALOG273_PREDECESSOR_DRIFT:%',target.signature;
  END IF;
  revised:=definition;
  IF target.kind=1 THEN
   -- Existing credential, operation replay and expected-version checks precede
   -- this branch. Removing an owned line needs no current catalog authority.
   old_fragment:=$old$  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'$old$;
   new_fragment:=$new$  IF p_action<>'remove' THEN
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
   old_fragment:=$old$  IF resolved_price.outcome<>'found' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  IF p_action='add' THEN$old$;
   new_fragment:=$new$  IF resolved_price.outcome<>'found' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  END IF;

  IF p_action='add' THEN$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
  ELSIF target.kind=2 THEN
   revised:=replace(revised,'dependency regclass; dependency_found boolean;',
    'dependency regclass; dependency_found boolean; selected_cart_id uuid; cart_cleanup_outcome text; cart_cleanup_result jsonb; previous_inventory_marker text;');
   old_fragment:=$old$'pricing_variant_policy_versions','barcode_print_job_items','google_merchant_preferences'$old$;
   new_fragment:=$new$'pricing_variant_policy_versions','barcode_print_job_items','google_merchant_preferences',
        'storefront_cart_items','abandoned_cart_items',
        'catalog_variant_order_state','variant_media_galleries','product_variant_gallery_state',
        'inventory_balances','inventory_movements'$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
   old_fragment:=$old$  FOR dependency IN
    SELECT DISTINCT constraint_row.conrelid::regclass$old$;
   new_fragment:=$new$  PERFORM 1 FROM saas.product_variants
  WHERE store_id=p_store_id AND product_id=p_product_id ORDER BY id FOR UPDATE;
  -- Creation writes a zero opening even for an untracked, never stocked
  -- variant. Only that synthetic row and zero current balances are disposable.
  -- Any real inventory history remains a permanent-deletion blocker.
  IF EXISTS(SELECT 1 FROM saas.inventory_balances balance
    JOIN saas.product_variants variant ON variant.store_id=balance.store_id AND variant.id=balance.variant_id
    WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id AND balance.quantity<>0)
  OR EXISTS(SELECT 1 FROM saas.inventory_movements movement
    JOIN saas.product_variants variant ON variant.store_id=movement.store_id AND variant.id=movement.variant_id
    WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id AND NOT(
      movement.movement_kind='opening' AND movement.direction='in' AND movement.quantity_delta=0
      AND movement.source_kind='opening' AND movement.source_id=movement.variant_id
      AND movement.id=saas.inventory_deterministic_uuid('inventory-opening-movement',p_store_id::text||':'||movement.variant_id::text)
    ))
  THEN RETURN QUERY SELECT 'cleanup_failed'::text,NULL::jsonb;RETURN;END IF;

  FOR dependency IN
    SELECT DISTINCT constraint_row.conrelid::regclass$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
   old_fragment:=$old$  UPDATE saas.order_items SET product_id=NULL,variant_id=NULL$old$;
   new_fragment:=$new$  -- All other catalog-reference blockers have passed. A subtransaction keeps
  -- carts unchanged if the final eligibility or removal step rejects deletion.
  BEGIN
  FOR selected_cart_id IN
    SELECT cart.id FROM saas.storefront_carts cart
    WHERE cart.store_id=p_store_id AND EXISTS(
      SELECT 1 FROM saas.storefront_cart_items item
      WHERE item.store_id=p_store_id AND item.cart_id=cart.id AND item.product_id=p_product_id
    ) ORDER BY cart.id FOR UPDATE OF cart
  LOOP
    UPDATE saas.storefront_carts SET version=version+1,updated_at=GREATEST(updated_at,p_now)
    WHERE store_id=p_store_id AND id=selected_cart_id;
    DELETE FROM saas.storefront_cart_items
    WHERE store_id=p_store_id AND cart_id=selected_cart_id AND product_id=p_product_id;
    PERFORM saas.sync_durable_abandoned_cart(p_store_id,selected_cart_id,p_now);
  END LOOP;
  -- Historical descriptions, quantities and money remain available after the
  -- catalog identity is gone. Episode and operation snapshots are untouched.
  UPDATE saas.abandoned_cart_items SET product_id=NULL,variant_id=NULL
  WHERE store_id=p_store_id AND (product_id=p_product_id OR variant_id IN(
    SELECT id FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id
  ));

  previous_inventory_marker:=current_setting('celebix.catalog_delete_empty_inventory',true);
  PERFORM set_config('celebix.catalog_delete_empty_inventory',p_store_id::text||':'||p_product_id::text,true);
  DELETE FROM saas.inventory_movements movement USING saas.product_variants variant
  WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id
    AND movement.store_id=variant.store_id AND movement.variant_id=variant.id;
  DELETE FROM saas.inventory_balances balance USING saas.product_variants variant
  WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id
    AND balance.store_id=variant.store_id AND balance.variant_id=variant.id AND balance.quantity=0;
  PERFORM set_config('celebix.catalog_delete_empty_inventory',COALESCE(previous_inventory_marker,''),true);

  UPDATE saas.order_items SET product_id=NULL,variant_id=NULL$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
   old_fragment:=$old$  IF eligibility.outcome<>'found' THEN RETURN QUERY SELECT eligibility.outcome,NULL::jsonb; RETURN; END IF;
  IF NOT (eligibility.result_payload->>'eligible')::boolean THEN
    RETURN QUERY SELECT 'cleanup_failed'::text,eligibility.result_payload; RETURN;
  END IF;$old$;
   new_fragment:=$new$  IF eligibility.outcome<>'found' THEN
    cart_cleanup_outcome:=eligibility.outcome;cart_cleanup_result:=NULL;
    RAISE EXCEPTION USING ERRCODE='P2730',MESSAGE='CART_CATALOG273_DELETE_ABORT';
  END IF;
  IF NOT (eligibility.result_payload->>'eligible')::boolean THEN
    cart_cleanup_outcome:='cleanup_failed';cart_cleanup_result:=eligibility.result_payload;
    RAISE EXCEPTION USING ERRCODE='P2730',MESSAGE='CART_CATALOG273_DELETE_ABORT';
  END IF;$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
   old_fragment:=$old$  IF removed.outcome NOT IN('removed','operation_replayed') THEN RETURN QUERY SELECT removed.outcome,removed.result_payload; RETURN; END IF;$old$;
   new_fragment:=$new$  IF removed.outcome NOT IN('removed','operation_replayed') THEN
    cart_cleanup_outcome:=removed.outcome;cart_cleanup_result:=removed.result_payload;
    RAISE EXCEPTION USING ERRCODE='P2730',MESSAGE='CART_CATALOG273_DELETE_ABORT';
  END IF;$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
   old_fragment:=$old$  RETURN QUERY SELECT 'deleted'::text,result;
END$old$;
   new_fragment:=$new$  RETURN QUERY SELECT 'deleted'::text,result;
  EXCEPTION WHEN SQLSTATE 'P2730' THEN
    RETURN QUERY SELECT cart_cleanup_outcome,cart_cleanup_result;
  END;
END$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
  ELSIF target.kind=3 THEN
   -- These are catalog-owned CASCADE rows, including native271 display order.
   -- All other business, inventory and checkout dependencies remain blockers.
   old_fragment:=$old$'product_media_cleanup_operations'$old$;
   new_fragment:=$new$'product_media_cleanup_operations','catalog_variant_order_state',
        'variant_media_galleries','product_variant_gallery_state','google_merchant_preferences'$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
  ELSE
   old_fragment:=$old$BEGIN
  RAISE EXCEPTION 'INVENTORY_MOVEMENT_IMMUTABLE';$old$;
   new_fragment:=$new$BEGIN
  IF TG_OP='DELETE' AND OLD.movement_kind='opening' AND OLD.direction='in' AND OLD.quantity_delta=0
    AND OLD.source_kind='opening' AND OLD.source_id=OLD.variant_id
    AND OLD.id=saas.inventory_deterministic_uuid('inventory-opening-movement',OLD.store_id::text||':'||OLD.variant_id::text)
    AND EXISTS(SELECT 1 FROM saas.product_variants variant
      WHERE variant.store_id=OLD.store_id AND variant.id=OLD.variant_id
        AND current_setting('celebix.catalog_delete_empty_inventory',true)=OLD.store_id::text||':'||variant.product_id::text)
    AND NOT EXISTS(SELECT 1 FROM saas.inventory_movements movement
      WHERE movement.store_id=OLD.store_id AND movement.variant_id=OLD.variant_id AND movement.id<>OLD.id)
    AND NOT EXISTS(SELECT 1 FROM saas.inventory_balances balance
      WHERE balance.store_id=OLD.store_id AND balance.variant_id=OLD.variant_id AND balance.quantity<>0)
  THEN RETURN OLD;END IF;
  RAISE EXCEPTION 'INVENTORY_MOVEMENT_IMMUTABLE';$new$;
   IF array_length(string_to_array(revised,old_fragment),1)<>2 THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_AMBIGUOUS';END IF;
   revised:=replace(revised,old_fragment,new_fragment);
  END IF;
  IF revised=definition THEN RAISE EXCEPTION 'CART_CATALOG273_PATCH_EMPTY';END IF;
  INSERT INTO saas.cart_catalog_lifecycle273_functions VALUES(target.signature,definition,target.expected_sha256,
   encode(sha256(convert_to(revised,'UTF8')),'hex'),p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile);
  EXECUTE revised;
  IF NOT EXISTS(SELECT 1 FROM pg_proc installed WHERE installed.oid=p.oid
    AND installed.proowner=p.proowner AND installed.proacl IS NOT DISTINCT FROM p.proacl
    AND installed.proconfig IS NOT DISTINCT FROM p.proconfig AND installed.prosecdef=p.prosecdef
    AND installed.provolatile=p.provolatile AND installed.proisstrict=p.proisstrict AND installed.proparallel=p.proparallel
    AND encode(sha256(convert_to(pg_get_functiondef(installed.oid),'UTF8')),'hex')=encode(sha256(convert_to(revised,'UTF8')),'hex'))
  THEN RAISE EXCEPTION 'CART_CATALOG273_POSTCONDITION_INVALID';END IF;
 END LOOP;
END $patch$;
COMMIT;
