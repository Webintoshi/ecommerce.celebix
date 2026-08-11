-- Phase 4T durable storefront-cart to merchant abandoned-cart projection.
-- The storefront cart remains authoritative; no browser-supplied capture is trusted.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.abandoned_carts
  ADD COLUMN source_cart_id uuid;

ALTER TABLE saas.abandoned_carts
  ADD CONSTRAINT abandoned_carts_source_cart_store_key UNIQUE(store_id,source_cart_id),
  ADD CONSTRAINT abandoned_carts_source_cart_store_fk
    FOREIGN KEY(store_id,source_cart_id)
    REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT;

UPDATE saas.abandoned_carts abandoned
SET source_cart_id=credential.cart_id
FROM saas.storefront_cart_credentials credential
WHERE abandoned.store_id=credential.store_id
  AND abandoned.public_cart_digest=credential.credential_digest
  AND abandoned.source_cart_id IS NULL
  AND NOT EXISTS(
    SELECT 1 FROM saas.abandoned_carts occupied
    WHERE occupied.store_id=credential.store_id
      AND occupied.source_cart_id=credential.cart_id
  );

CREATE INDEX abandoned_carts_store_source_activity_idx
  ON saas.abandoned_carts(store_id,source_cart_id,last_activity_at DESC)
  WHERE source_cart_id IS NOT NULL;

CREATE FUNCTION saas.sync_durable_abandoned_cart(
  p_store_id uuid,
  p_cart_id uuid,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  selected_cart saas.storefront_carts%ROWTYPE;
  selected_abandoned saas.abandoned_carts%ROWTYPE;
  selected_digest char(64);
  selected_currency text;
  selected_order_id uuid;
  selected_subtotal bigint;
  selected_count bigint;
  projection_id uuid;
  effective_activity_at timestamptz;
BEGIN
  IF p_store_id IS NULL OR p_cart_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RAISE EXCEPTION 'DURABLE_ABANDONED_CART_SYNC_INVALID';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.durable.abandoned-cart:'||p_store_id::text||':'||p_cart_id::text,0)
  );

  SELECT * INTO selected_cart
  FROM saas.storefront_carts cart
  WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  effective_activity_at:=GREATEST(selected_cart.updated_at,p_now);

  SELECT credential.credential_digest INTO selected_digest
  FROM saas.storefront_cart_credentials credential
  WHERE credential.store_id=p_store_id AND credential.cart_id=p_cart_id;
  IF selected_digest IS NULL THEN RETURN; END IF;

  SELECT store.currency INTO selected_currency
  FROM saas.stores store WHERE store.id=p_store_id;

  SELECT pg_catalog.count(*),COALESCE(pg_catalog.sum(item.unit_price_cents*item.quantity),0)::bigint
    INTO selected_count,selected_subtotal
  FROM saas.storefront_cart_items item
  WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id;

  SELECT * INTO selected_abandoned
  FROM saas.abandoned_carts abandoned
  WHERE abandoned.store_id=p_store_id
    AND (abandoned.source_cart_id=p_cart_id
      OR (abandoned.source_cart_id IS NULL AND abandoned.public_cart_digest=selected_digest))
  ORDER BY (abandoned.source_cart_id=p_cart_id) DESC,abandoned.created_at,abandoned.id
  LIMIT 1 FOR UPDATE;

  IF selected_cart.status='active' AND selected_count>0 THEN
    IF NOT FOUND THEN
      projection_id:=pg_catalog.gen_random_uuid();
      INSERT INTO saas.abandoned_carts(
        id,store_id,source_cart_id,public_cart_digest,status,currency,
        subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,
        version,created_at,updated_at
      ) VALUES(
        projection_id,p_store_id,p_cart_id,selected_digest,'active',selected_currency,
        selected_subtotal,0,selected_subtotal,selected_cart.created_at,effective_activity_at,
        1,selected_cart.created_at,effective_activity_at
      );
    ELSIF selected_abandoned.status IN('active','abandoned')
       OR (
         selected_abandoned.status='archived'
         AND selected_abandoned.recovered_order_id IS NULL
         AND NOT EXISTS(
           SELECT 1
           FROM saas.abandoned_cart_items archived_item
           WHERE archived_item.store_id=p_store_id
             AND archived_item.cart_id=selected_abandoned.id
         )
       ) THEN
      projection_id:=selected_abandoned.id;
      UPDATE saas.abandoned_carts
      SET source_cart_id=p_cart_id,
          public_cart_digest=selected_digest,
          status='active',
          currency=selected_currency,
          subtotal_cents=selected_subtotal,
          discount_cents=0,
          total_cents=selected_subtotal,
          last_activity_at=effective_activity_at,
          abandoned_at=NULL,
          recovered_at=NULL,
          archived_at=NULL,
          recovered_order_id=NULL,
          version=version+1,
          updated_at=effective_activity_at
      WHERE store_id=p_store_id AND id=selected_abandoned.id;
    ELSE
      RETURN;
    END IF;

    DELETE FROM saas.abandoned_cart_items
    WHERE store_id=p_store_id AND cart_id=projection_id;

    INSERT INTO saas.abandoned_cart_items(
      id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,image_url,
      unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    )
    SELECT pg_catalog.gen_random_uuid(),item.store_id,projection_id,item.product_id,item.variant_id,item.position,
      product.title,variant.title,variant.sku,primary_media.public_url,
      item.unit_price_cents,item.quantity,0,item.unit_price_cents*item.quantity,effective_activity_at
    FROM saas.storefront_cart_items item
    JOIN saas.products product
      ON product.store_id=item.store_id AND product.id=item.product_id
    JOIN saas.product_variants variant
      ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id
    LEFT JOIN LATERAL(
      SELECT media.public_url
      FROM saas.product_media media
      WHERE media.store_id=item.store_id AND media.product_id=item.product_id AND media.status='active'
        AND (media.variant_id=item.variant_id OR media.variant_id IS NULL)
      ORDER BY (media.variant_id=item.variant_id) DESC NULLS LAST,media.sort_order,media.id
      LIMIT 1
    ) primary_media ON true
    WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id
    ORDER BY item.position,item.variant_id;
    RETURN;
  END IF;

  IF NOT FOUND THEN RETURN; END IF;

  IF selected_cart.status='active' AND selected_count=0
     AND selected_abandoned.status IN('active','abandoned') THEN
    UPDATE saas.abandoned_carts
    SET status='archived',archived_at=effective_activity_at,
        last_activity_at=effective_activity_at,version=version+1,updated_at=effective_activity_at
    WHERE store_id=p_store_id AND id=selected_abandoned.id;
    DELETE FROM saas.abandoned_cart_items
    WHERE store_id=p_store_id AND cart_id=selected_abandoned.id;
    RETURN;
  END IF;

  IF selected_cart.status='converted' AND selected_abandoned.status IN('active','abandoned') THEN
    SELECT operation.order_id INTO selected_order_id
    FROM saas.storefront_checkout_operations operation
    WHERE operation.store_id=p_store_id AND operation.cart_id=p_cart_id
    ORDER BY operation.committed_at DESC,operation.operation_id DESC
    LIMIT 1;
    IF selected_order_id IS NULL THEN
      RAISE EXCEPTION 'DURABLE_ABANDONED_CART_ORDER_BINDING_MISSING';
    END IF;
    IF selected_abandoned.status='abandoned' THEN
      UPDATE saas.abandoned_carts
      SET status='recovered',recovered_at=effective_activity_at,recovered_order_id=selected_order_id,
          version=version+1,updated_at=effective_activity_at
      WHERE store_id=p_store_id AND id=selected_abandoned.id;
    ELSE
      UPDATE saas.abandoned_carts
      SET status='archived',archived_at=effective_activity_at,recovered_order_id=selected_order_id,
          last_activity_at=effective_activity_at,version=version+1,updated_at=effective_activity_at
      WHERE store_id=p_store_id AND id=selected_abandoned.id;
    END IF;
  END IF;
END
$function$;

CREATE FUNCTION saas.durable_abandoned_cart_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  PERFORM saas.sync_durable_abandoned_cart(NEW.store_id,NEW.id,NEW.updated_at);
  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER durable_abandoned_cart_sync
AFTER INSERT OR UPDATE ON saas.storefront_carts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION saas.durable_abandoned_cart_sync_trigger();

CREATE FUNCTION saas.durable_abandoned_cart_item_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  source_store_id uuid;
  source_cart_id uuid;
  source_item_updated_at timestamptz;
  source_updated_at timestamptz;
BEGIN
  IF TG_OP='DELETE' THEN
    source_store_id:=OLD.store_id;
    source_cart_id:=OLD.cart_id;
    source_item_updated_at:=pg_catalog.statement_timestamp();
  ELSE
    source_store_id:=NEW.store_id;
    source_cart_id:=NEW.cart_id;
    source_item_updated_at:=NEW.updated_at;
  END IF;

  SELECT GREATEST(cart.updated_at,source_item_updated_at) INTO source_updated_at
  FROM saas.storefront_carts cart
  WHERE cart.store_id=source_store_id AND cart.id=source_cart_id;
  IF source_updated_at IS NOT NULL THEN
    PERFORM saas.sync_durable_abandoned_cart(source_store_id,source_cart_id,source_updated_at);
  END IF;

  IF TG_OP='UPDATE'
     AND (OLD.store_id,OLD.cart_id) IS DISTINCT FROM (NEW.store_id,NEW.cart_id) THEN
    SELECT GREATEST(cart.updated_at,pg_catalog.statement_timestamp()) INTO source_updated_at
    FROM saas.storefront_carts cart
    WHERE cart.store_id=OLD.store_id AND cart.id=OLD.cart_id;
    IF source_updated_at IS NOT NULL THEN
      PERFORM saas.sync_durable_abandoned_cart(OLD.store_id,OLD.cart_id,source_updated_at);
    END IF;
  END IF;
  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER durable_abandoned_cart_item_sync
AFTER INSERT OR UPDATE OR DELETE ON saas.storefront_cart_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION saas.durable_abandoned_cart_item_sync_trigger();

CREATE FUNCTION saas.reconcile_durable_abandoned_carts(p_store_id uuid,p_now timestamptz)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE affected bigint;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RAISE EXCEPTION 'DURABLE_ABANDONED_CART_RECONCILE_INVALID';
  END IF;
  UPDATE saas.abandoned_carts abandoned
  SET status='abandoned',abandoned_at=p_now,version=abandoned.version+1,updated_at=p_now
  FROM saas.storefront_carts source
  WHERE abandoned.store_id=p_store_id
    AND abandoned.store_id=source.store_id
    AND abandoned.source_cart_id=source.id
    AND abandoned.status='active'
    AND source.status='active'
    AND abandoned.last_activity_at<=p_now-INTERVAL '30 minutes';
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END
$function$;

ALTER FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
  RENAME TO abandoned_carts_summary_without_durable_reconciliation_v101;
ALTER FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid)
  RENAME TO abandoned_carts_list_without_durable_reconciliation_v101;
ALTER FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)
  RENAME TO abandoned_carts_get_without_durable_reconciliation_v101;

CREATE FUNCTION saas.abandoned_carts_summary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM saas.reconcile_durable_abandoned_carts(p_store_id,p_now);
  RETURN QUERY SELECT * FROM saas.abandoned_carts_summary_without_durable_reconciliation_v101(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
END
$function$;

CREATE FUNCTION saas.abandoned_carts_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_status text,p_search text,p_sort text,p_page_size bigint,p_cursor_total_cents bigint,p_cursor_last_activity_at timestamptz,p_cursor_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM saas.reconcile_durable_abandoned_carts(p_store_id,p_now);
  RETURN QUERY SELECT * FROM saas.abandoned_carts_list_without_durable_reconciliation_v101(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_status,p_search,p_sort,p_page_size,p_cursor_total_cents,p_cursor_last_activity_at,p_cursor_id
  );
END
$function$;

CREATE FUNCTION saas.abandoned_carts_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_cart_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM saas.reconcile_durable_abandoned_carts(p_store_id,p_now);
  RETURN QUERY SELECT * FROM saas.abandoned_carts_get_without_durable_reconciliation_v101(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_cart_id);
END
$function$;

REVOKE ALL ON FUNCTION saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.durable_abandoned_cart_sync_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.durable_abandoned_cart_item_sync_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.reconcile_durable_abandoned_carts(uuid,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_summary_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.abandoned_carts_list_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.abandoned_carts_get_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;

COMMIT;
