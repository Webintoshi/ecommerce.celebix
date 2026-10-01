-- Optional galleries reuse existing media; legacy public product projections stay unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
CREATE TABLE saas.product_variant_gallery_state(
 store_id uuid NOT NULL,product_id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(store_id,product_id),
 FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE CASCADE
);
CREATE TABLE saas.variant_media_galleries(
 store_id uuid NOT NULL,product_id uuid NOT NULL,variant_id uuid NOT NULL,
 PRIMARY KEY(store_id,product_id,variant_id),
 FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE CASCADE,
 FOREIGN KEY(store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE CASCADE
);
CREATE TABLE saas.variant_media_links(
 store_id uuid NOT NULL,product_id uuid NOT NULL,variant_id uuid NOT NULL,media_id uuid NOT NULL,position integer NOT NULL CHECK(position BETWEEN 0 AND 15),
 PRIMARY KEY(store_id,product_id,variant_id,media_id),UNIQUE(store_id,product_id,variant_id,position),
 FOREIGN KEY(store_id,product_id,variant_id) REFERENCES saas.variant_media_galleries(store_id,product_id,variant_id) ON DELETE CASCADE,
 FOREIGN KEY(store_id,media_id) REFERENCES saas.product_media(store_id,id) ON DELETE CASCADE
);
CREATE TABLE saas.variant_media_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 principal_id uuid NOT NULL,product_id uuid NOT NULL,fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object' AND pg_column_size(result_payload)<=2097152),committed_at timestamptz NOT NULL
);
CREATE INDEX variant_media_operations_store_idx ON saas.variant_media_operations(store_id,committed_at DESC);
DO $f$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['product_variant_gallery_state','variant_media_galleries','variant_media_links','variant_media_operations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',tab);
 END LOOP;
END $f$;
CREATE FUNCTION saas.guard_variant_media_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM saas.product_variants v WHERE v.store_id=NEW.store_id AND v.product_id=NEW.product_id AND v.id=NEW.variant_id) THEN RAISE EXCEPTION 'VARIANT_MEDIA_PRODUCT_SCOPE_INVALID'; END IF;
 IF TG_TABLE_NAME='variant_media_links' THEN
 IF NOT EXISTS(SELECT 1 FROM saas.product_media m WHERE m.store_id=NEW.store_id AND m.product_id=NEW.product_id AND m.id=NEW.media_id) THEN RAISE EXCEPTION 'VARIANT_MEDIA_PRODUCT_SCOPE_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER variant_media_gallery_scope BEFORE INSERT OR UPDATE ON saas.variant_media_galleries FOR EACH ROW EXECUTE FUNCTION saas.guard_variant_media_scope();
CREATE TRIGGER variant_media_link_scope BEFORE INSERT OR UPDATE ON saas.variant_media_links FOR EACH ROW EXECUTE FUNCTION saas.guard_variant_media_scope();
CREATE TRIGGER variant_media_operations_immutable BEFORE UPDATE OR DELETE ON saas.variant_media_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_product_media_operation_mutation();
REVOKE ALL ON FUNCTION saas.guard_variant_media_scope() FROM PUBLIC;
-- Only active legacy associations are materialized. Future old writers still use the legacy fallback.
INSERT INTO saas.variant_media_galleries(store_id,product_id,variant_id)
 SELECT DISTINCT store_id,product_id,variant_id FROM saas.product_media WHERE variant_id IS NOT NULL AND status='active' AND object_deleted_at IS NULL;
INSERT INTO saas.variant_media_links(store_id,product_id,variant_id,media_id,position)
 SELECT store_id,product_id,variant_id,id,(row_number() OVER(PARTITION BY store_id,product_id,variant_id ORDER BY sort_order,id)-1)::integer
 FROM saas.product_media WHERE variant_id IS NOT NULL AND status='active' AND object_deleted_at IS NULL;
INSERT INTO saas.product_variant_gallery_state(store_id,product_id) SELECT DISTINCT store_id,product_id FROM saas.variant_media_galleries;
CREATE FUNCTION saas.variant_gallery_projection(p_store_id uuid,p_product_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('gallery',jsonb_build_object('productId',p_product_id,'version',coalesce((SELECT version FROM saas.product_variant_gallery_state WHERE store_id=p_store_id AND product_id=p_product_id),1),'assignments',
 coalesce((SELECT jsonb_agg(jsonb_build_object('variantId',g.variant_id,'mediaIds',coalesce((SELECT jsonb_agg(l.media_id ORDER BY l.position) FROM saas.variant_media_links l JOIN saas.product_media m ON m.store_id=l.store_id AND m.id=l.media_id AND m.product_id=l.product_id AND m.status='active' AND m.object_deleted_at IS NULL WHERE l.store_id=g.store_id AND l.product_id=g.product_id AND l.variant_id=g.variant_id),'[]'::jsonb)) ORDER BY g.variant_id)
 FROM saas.variant_media_galleries g JOIN saas.product_variants v ON v.store_id=g.store_id AND v.id=g.variant_id AND v.product_id=g.product_id AND v.status='active' WHERE g.store_id=p_store_id AND g.product_id=p_product_id),'[]'::jsonb)))
$f$;
REVOKE ALL ON FUNCTION saas.variant_gallery_projection(uuid,uuid) FROM PUBLIC;
CREATE FUNCTION saas.media_list_variant_gallery(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_product_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denial text;
BEGIN
 denial:=saas.media_read_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
 IF denial IS NOT NULL THEN RETURN QUERY SELECT denial,NULL::jsonb;RETURN;END IF;
 IF p_product_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived') THEN RETURN QUERY SELECT 'product_not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',saas.variant_gallery_projection(p_store_id,p_product_id);
END $f$;
CREATE FUNCTION saas.media_save_variant_gallery(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
 p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint,p_assignments jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denial text; operation saas.variant_media_operations%ROWTYPE; assignment jsonb; media jsonb; variants uuid[]:='{}'; ids uuid[]; vid uuid; mid uuid; revision bigint; payload jsonb;
BEGIN
 denial:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
 IF denial IS NOT NULL THEN RETURN QUERY SELECT denial,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
 OR p_assignments IS NULL OR jsonb_typeof(p_assignments)<>'array' OR jsonb_array_length(p_assignments) NOT BETWEEN 1 AND 100 OR pg_column_size(p_assignments)>262144 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('variant-gallery:'||p_operation_id::text,0));
 SELECT * INTO operation FROM saas.variant_media_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF operation.store_id<>p_store_id OR operation.principal_id<>p_principal_id OR operation.product_id<>p_product_id OR operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'operation_replayed',operation.result_payload;RETURN;
 END IF;
 PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived' FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found',NULL::jsonb;RETURN;END IF;
 SELECT coalesce((SELECT version FROM saas.product_variant_gallery_state WHERE store_id=p_store_id AND product_id=p_product_id),1) INTO revision;
 IF revision<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 -- Validate and lock the entire patch before changing any assignment.
 FOR assignment IN SELECT value FROM jsonb_array_elements(p_assignments) LOOP
  IF jsonb_typeof(assignment)<>'object' OR assignment-'variantId'-'mediaIds'<>'{}'::jsonb OR jsonb_typeof(assignment->'variantId') IS DISTINCT FROM 'string'
  OR assignment->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(assignment->'mediaIds') IS DISTINCT FROM 'array' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF jsonb_array_length(assignment->'mediaIds')>16 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  vid:=(assignment->>'variantId')::uuid;
  IF vid=ANY(variants) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  variants:=array_append(variants,vid);
  PERFORM 1 FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id AND id=vid AND status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'variant_not_found',NULL::jsonb;RETURN;END IF;
  ids:='{}';
  FOR media IN SELECT value FROM jsonb_array_elements(assignment->'mediaIds') LOOP
   IF jsonb_typeof(media)<>'string' OR media#>>'{}'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   mid:=(media#>>'{}')::uuid;
   IF mid=ANY(ids) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   ids:=array_append(ids,mid);
   PERFORM 1 FROM saas.product_media WHERE store_id=p_store_id AND product_id=p_product_id AND id=mid AND status='active' AND object_deleted_at IS NULL FOR SHARE;
   IF NOT FOUND THEN RETURN QUERY SELECT 'media_not_found',NULL::jsonb;RETURN;END IF;
  END LOOP;
 END LOOP;
 FOR assignment IN SELECT value FROM jsonb_array_elements(p_assignments) LOOP
  vid:=(assignment->>'variantId')::uuid;
  INSERT INTO saas.variant_media_galleries VALUES(p_store_id,p_product_id,vid) ON CONFLICT DO NOTHING;
  DELETE FROM saas.variant_media_links WHERE store_id=p_store_id AND product_id=p_product_id AND variant_id=vid;
  INSERT INTO saas.variant_media_links(store_id,product_id,variant_id,media_id,position)
  SELECT p_store_id,p_product_id,vid,(value#>>'{}')::uuid,(ordinality-1)::integer FROM jsonb_array_elements(assignment->'mediaIds') WITH ORDINALITY;
 END LOOP;
 INSERT INTO saas.product_variant_gallery_state VALUES(p_store_id,p_product_id,revision+1) ON CONFLICT(store_id,product_id) DO UPDATE SET version=EXCLUDED.version;
 payload:=saas.variant_gallery_projection(p_store_id,p_product_id);
 INSERT INTO saas.variant_media_operations VALUES(p_operation_id,p_store_id,p_principal_id,p_product_id,p_fingerprint,payload,p_now);
 RETURN QUERY SELECT 'committed',payload;
END $f$;
CREATE FUNCTION saas.public_variant_media_assignments(p_store_id uuid,p_hostname text,p_now timestamptz,p_product_ids uuid[])
 RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_product_ids IS NULL OR cardinality(p_product_ids)>1000 OR array_position(p_product_ids,NULL) IS NOT NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('assignments',coalesce(jsonb_agg(jsonb_build_object('productId',g.product_id,'variantId',g.variant_id,'mediaIds',
 coalesce((SELECT jsonb_agg(l.media_id ORDER BY l.position) FROM saas.variant_media_links l JOIN saas.product_media m ON m.store_id=l.store_id AND m.id=l.media_id AND m.product_id=l.product_id AND m.status='active' AND m.object_deleted_at IS NULL WHERE l.store_id=g.store_id AND l.product_id=g.product_id AND l.variant_id=g.variant_id),'[]'::jsonb)) ORDER BY g.product_id,g.variant_id),'[]'::jsonb))
 FROM saas.variant_media_galleries g JOIN saas.products p ON p.store_id=g.store_id AND p.id=g.product_id AND p.status='active'
 JOIN saas.product_variants v ON v.store_id=g.store_id AND v.id=g.variant_id AND v.product_id=g.product_id AND v.status='active'
 WHERE g.store_id=p_store_id AND g.product_id=ANY(p_product_ids);
END $f$;
-- Explicit empty or unavailable assignments use the general gallery, bypassing old variant associations.
CREATE FUNCTION saas.variant_primary_media_id(p_store_id uuid,p_product_id uuid,p_variant_id uuid) RETURNS uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH assigned AS(SELECT EXISTS(SELECT 1 FROM saas.variant_media_galleries WHERE store_id=p_store_id AND product_id=p_product_id AND variant_id=p_variant_id) present), candidates AS(
 SELECT m.id,0 priority,l.position position FROM saas.variant_media_links l JOIN saas.product_media m ON m.store_id=l.store_id AND m.id=l.media_id AND m.product_id=l.product_id
 WHERE l.store_id=p_store_id AND l.product_id=p_product_id AND l.variant_id=p_variant_id AND m.status='active' AND m.object_deleted_at IS NULL
 UNION ALL SELECT m.id,CASE WHEN NOT assigned.present AND p_variant_id IS NOT NULL AND m.variant_id=p_variant_id THEN 1 ELSE 2 END,m.sort_order
 FROM saas.product_media m CROSS JOIN assigned WHERE m.store_id=p_store_id AND m.product_id=p_product_id AND m.status='active' AND m.object_deleted_at IS NULL
 ) SELECT id FROM candidates ORDER BY priority,position,id LIMIT 1
$f$;
REVOKE ALL ON FUNCTION saas.variant_primary_media_id(uuid,uuid,uuid) FROM PUBLIC;
CREATE FUNCTION saas.variant_media_commerce_projection(p_store_id uuid,p_payload jsonb) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_payload IS NULL THEN NULL ELSE jsonb_set(p_payload,'{items}',coalesce((SELECT jsonb_agg(
 (item.value-'media')||jsonb_strip_nulls(jsonb_build_object('media',saas.public_media_projection(saas.variant_primary_media_id(p_store_id,(item.value->>'productId')::uuid,(item.value->>'variantId')::uuid)))) ORDER BY item.ordinality)
 FROM jsonb_array_elements(p_payload->'items') WITH ORDINALITY item(value,ordinality)),'[]'::jsonb)) END
$f$;
REVOKE ALL ON FUNCTION saas.variant_media_commerce_projection(uuid,jsonb) FROM PUBLIC;
ALTER FUNCTION saas.storefront_cart_projection(uuid,uuid,timestamptz) RENAME TO storefront_cart_projection_without_variant_galleries;
CREATE FUNCTION saas.storefront_cart_projection(p_store_id uuid,p_cart_id uuid,p_now timestamptz) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.variant_media_commerce_projection(p_store_id,saas.storefront_cart_projection_without_variant_galleries(p_store_id,p_cart_id,p_now))
$f$;
ALTER FUNCTION saas.storefront_intent_projection(uuid,uuid,timestamptz) RENAME TO storefront_intent_projection_without_variant_galleries;
CREATE FUNCTION saas.storefront_intent_projection(p_store_id uuid,p_intent_id uuid,p_now timestamptz) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.variant_media_commerce_projection(p_store_id,saas.storefront_intent_projection_without_variant_galleries(p_store_id,p_intent_id,p_now))
$f$;
REVOKE ALL ON FUNCTION saas.storefront_cart_projection(uuid,uuid,timestamptz),saas.storefront_intent_projection(uuid,uuid,timestamptz) FROM PUBLIC;
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
   AND media.store_id=p_store_id AND media.product_id=product.id AND media.id=saas.variant_primary_media_id(p_store_id,product.id,resolved.variant_id)
  LIMIT 1
 ) image ON true;
END
$function$;
REVOKE ALL ON FUNCTION saas.media_list_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid),saas.media_save_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),saas.public_variant_media_assignments(uuid,text,timestamptz,uuid[]) FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.media_list_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid),saas.media_save_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_variant_media_assignments(uuid,text,timestamptz,uuid[]) TO celebix_saas_host_resolver;
COMMIT;
