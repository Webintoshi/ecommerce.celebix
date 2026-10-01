BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.media_list_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.media_save_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb);
DROP FUNCTION saas.public_variant_media_assignments(uuid,text,timestamptz,uuid[]);
DROP FUNCTION saas.storefront_cart_projection(uuid,uuid,timestamptz);
ALTER FUNCTION saas.storefront_cart_projection_without_variant_galleries(uuid,uuid,timestamptz) RENAME TO storefront_cart_projection;
DROP FUNCTION saas.storefront_intent_projection(uuid,uuid,timestamptz);
ALTER FUNCTION saas.storefront_intent_projection_without_variant_galleries(uuid,uuid,timestamptz) RENAME TO storefront_intent_projection;
DROP FUNCTION saas.variant_media_commerce_projection(uuid,jsonb);
CREATE OR REPLACE FUNCTION saas.merchant_product_images(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
 p_plan_code text,p_plan_version bigint,p_now timestamptz,p_scope text,p_references jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE denial text;reference jsonb;seen_keys text[]:='{}';key_value text;can_read_archived boolean:=false;
BEGIN
 IF p_scope IS NULL OR p_scope NOT IN('pos','orders','analytics') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_scope='pos' THEN
  denial:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 ELSE
  denial:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_scope,p_scope||'.read');
 END IF;
 IF denial IS NOT NULL THEN RETURN QUERY SELECT denial,NULL::jsonb;RETURN;END IF;
 IF p_scope='orders' THEN can_read_archived:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage') IS NULL;END IF;
 IF p_references IS NULL OR jsonb_typeof(p_references)<>'array' OR jsonb_array_length(p_references)>5000 OR pg_column_size(p_references)>2097152 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOR reference IN SELECT value FROM jsonb_array_elements(p_references) LOOP
  IF jsonb_typeof(reference)<>'object' OR jsonb_typeof(reference->'key') IS DISTINCT FROM 'string' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  key_value:=reference->>'key';
  IF char_length(key_value) NOT BETWEEN 1 AND 160 OR key_value<>btrim(key_value) OR key_value~'[[:cntrl:]]' OR key_value=ANY(seen_keys) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  seen_keys:=array_append(seen_keys,key_value);
  IF p_scope='orders' THEN
   IF reference-'key'-'orderId'-'orderItemId'<>'{}'::jsonb
    OR jsonb_typeof(reference->'orderId') IS DISTINCT FROM 'string' OR jsonb_typeof(reference->'orderItemId') IS DISTINCT FROM 'string'
    OR reference->>'orderId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR reference->>'orderItemId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ELSE
   IF reference-'key'-'productId'-'variantId'<>'{}'::jsonb
    OR jsonb_typeof(reference->'productId') IS DISTINCT FROM 'string'
    OR reference->>'productId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (reference?'variantId' AND reference->'variantId'<>'null'::jsonb AND (jsonb_typeof(reference->'variantId') IS DISTINCT FROM 'string' OR reference->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
   THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
 END LOOP;
 RETURN QUERY
 WITH requested AS MATERIALIZED(
  SELECT input.ordinal,input.reference->>'key' AS key,
   (input.reference->>'productId')::uuid AS product_id,(input.reference->>'variantId')::uuid AS variant_id,
   (input.reference->>'orderId')::uuid AS order_id,(input.reference->>'orderItemId')::uuid AS order_item_id
  FROM jsonb_array_elements(p_references) WITH ORDINALITY AS input(reference,ordinal)
 ), resolved AS MATERIALIZED(
  SELECT requested.ordinal,requested.key,
   CASE WHEN p_scope='orders' THEN item.product_id ELSE requested.product_id END AS product_id,
   CASE WHEN p_scope='orders' THEN item.variant_id ELSE requested.variant_id END AS variant_id
  FROM requested
  LEFT JOIN saas.orders source_order ON p_scope='orders' AND source_order.store_id=p_store_id AND source_order.id=requested.order_id
   AND (can_read_archived OR NOT EXISTS(SELECT 1 FROM saas.order_archive_state archive WHERE archive.store_id=p_store_id AND archive.order_id=source_order.id AND archive.archived))
  LEFT JOIN saas.order_items item ON p_scope='orders' AND item.store_id=p_store_id AND item.order_id=source_order.id AND item.id=requested.order_item_id
 )
 SELECT 'found'::text,jsonb_build_object('images',coalesce(jsonb_agg(jsonb_build_object('key',resolved.key,'imageUrl',image.public_url) ORDER BY resolved.ordinal),'[]'::jsonb))
 FROM resolved
 LEFT JOIN saas.products product ON product.store_id=p_store_id AND product.id=resolved.product_id AND (p_scope<>'pos' OR product.status='active')
 LEFT JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.product_id=product.id AND variant.id=resolved.variant_id AND (p_scope<>'pos' OR variant.status='active')
 LEFT JOIN LATERAL(
  SELECT media.public_url FROM saas.product_media media
  WHERE product.id IS NOT NULL AND (resolved.variant_id IS NULL OR variant.id IS NOT NULL)
   AND media.store_id=p_store_id AND media.product_id=product.id AND media.status='active' AND media.object_deleted_at IS NULL
   AND (resolved.variant_id IS NULL OR media.variant_id IS NULL OR media.variant_id=resolved.variant_id)
  ORDER BY CASE WHEN resolved.variant_id IS NOT NULL AND media.variant_id=resolved.variant_id THEN 0 ELSE 1 END,media.sort_order,media.id
  LIMIT 1
 ) image ON true;
END
$function$;
DROP FUNCTION saas.variant_primary_media_id(uuid,uuid,uuid);
DROP FUNCTION saas.variant_gallery_projection(uuid,uuid);
DROP TABLE saas.variant_media_links;
DROP TABLE saas.variant_media_galleries;
DROP TABLE saas.product_variant_gallery_state;
DROP TABLE saas.variant_media_operations;
DROP FUNCTION saas.guard_variant_media_scope();
COMMIT;
