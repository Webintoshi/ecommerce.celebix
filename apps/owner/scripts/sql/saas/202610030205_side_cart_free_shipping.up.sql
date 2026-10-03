BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- The published design owns this optional policy. Existing shipping settings,
-- merchant data, drafts, order snapshots and provider configuration are untouched.
CREATE TABLE saas.side_cart_free_shipping_backup(identity text PRIMARY KEY,definition text NOT NULL,migrated_definition text,authority jsonb NOT NULL);
ALTER TABLE saas.side_cart_free_shipping_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.side_cart_free_shipping_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.side_cart_free_shipping_backup FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
DO $preconditions$ DECLARE row record; actual pg_catalog.pg_proc%ROWTYPE; BEGIN
 FOR row IN SELECT * FROM (VALUES
('saas.campaign_starter_composition_valid(jsonb)','8f6ad3c13e363fa9664d1bc6886d112ba97738165a8c55779186df8115700430'),
('saas.public_checkout_complete_v2(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[])','7083f49473d3e1b22cc7da8d5d253eda6522db3d414281b51b5c7ff77302d4c2'),
('saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)','78f80ada36abccd8328486174c002b68de9a5e54424453195075e263d47c4593'),
('saas.storefront_cart_projection_without_commerce_analytics(uuid,uuid,timestamp with time zone)','279de7b09e8d15e7c5a2492b019543a2d564bbde42c7691093731b1a76646bcb'),
('saas.storefront_intent_projection_without_commerce_analytics(uuid,uuid,timestamp with time zone)','edb869c25afd159048511b3c2582879c4ed042f8dd4863741a51c6f6a5d818c0')
 ) manifest(identity,source_hash) LOOP
  SELECT * INTO actual FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(row.identity);
  IF NOT FOUND OR actual.proowner<>'celebix_saas_owner'::regrole OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(actual.prosrc,'UTF8')),'hex')<>row.source_hash THEN RAISE EXCEPTION 'SIDE_CART_FREE_SHIPPING_PREDECESSOR_CHANGED: %',row.identity; END IF;
  INSERT INTO saas.side_cart_free_shipping_backup VALUES(row.identity,pg_catalog.pg_get_functiondef(actual.oid),NULL,pg_catalog.to_jsonb(actual)-'prosrc');
 END LOOP;
END $preconditions$;
DO $clone$ DECLARE definition text; BEGIN
 SELECT backup.definition INTO definition FROM saas.side_cart_free_shipping_backup backup WHERE identity='saas.campaign_starter_composition_valid(jsonb)';
 EXECUTE pg_catalog.replace(definition,'CREATE OR REPLACE FUNCTION saas.campaign_starter_composition_valid(','CREATE FUNCTION saas.c205_composition_predecessor(');
END $clone$;
REVOKE ALL ON FUNCTION saas.c205_composition_predecessor(jsonb) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
CREATE OR REPLACE FUNCTION saas.campaign_starter_composition_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $function$
DECLARE threshold jsonb; BEGIN
 IF p_config->'cart'?'freeShippingThresholdCents' THEN
  threshold:=p_config->'cart'->'freeShippingThresholdCents';
  IF pg_catalog.jsonb_typeof(threshold) IS DISTINCT FROM 'number' OR threshold::text!~'^[1-9][0-9]{0,8}$' OR threshold::text::numeric>100000000 THEN RETURN false; END IF;
  RETURN saas.c205_composition_predecessor(pg_catalog.jsonb_set(p_config,ARRAY['cart'],(p_config->'cart')-'freeShippingThresholdCents',false));
 END IF;
 RETURN saas.c205_composition_predecessor(p_config);
EXCEPTION WHEN others THEN RETURN false;
END $function$;
CREATE FUNCTION saas.storefront_shipping_for_subtotal(p_store_id uuid,p_subtotal bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
 WITH tariff AS MATERIALIZED (SELECT saas.storefront_shipping_projection(p_store_id) value),
 policy AS (SELECT design.published_config->'composition'->'cart' value
  FROM saas.storefront_designs design JOIN saas.stores store ON store.id=design.store_id AND store.currency='TRY'
  WHERE design.store_id=p_store_id)
 SELECT CASE WHEN tariff.value IS NULL OR p_subtotal IS NULL OR p_subtotal<0 OR p_subtotal>9007199254740991 THEN NULL
  WHEN COALESCE(policy.value->'showShippingProgress','false'::jsonb)='true'::jsonb
   AND pg_catalog.jsonb_typeof(policy.value->'freeShippingThresholdCents')='number'
   AND policy.value->>'freeShippingThresholdCents'~'^[1-9][0-9]{0,8}$'
   AND (policy.value->>'freeShippingThresholdCents')::numeric<=100000000
   AND p_subtotal>=(policy.value->>'freeShippingThresholdCents')::numeric
  THEN tariff.value||pg_catalog.jsonb_build_object('shippingCents',0)
  ELSE tariff.value END
 FROM tariff LEFT JOIN policy ON true
$function$;
REVOKE ALL ON FUNCTION saas.storefront_shipping_for_subtotal(uuid,bigint) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
DO $patch$ DECLARE row record; definition text; source text; changed text; current_function pg_catalog.pg_proc%ROWTYPE; BEGIN
 FOR row IN SELECT * FROM (VALUES
('saas.public_checkout_complete_v2(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[])','v_shipping_projection:=saas.storefront_shipping_projection(v_store_id);','v_shipping_projection:=saas.storefront_shipping_for_subtotal(v_store_id,(v_cart_payload->>''subtotalCents'')::bigint);'),
('saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)','selected_shipping:=saas.storefront_shipping_projection(selected_store);','selected_shipping:=saas.storefront_shipping_for_subtotal(selected_store,(cart_payload->>''subtotalCents'')::bigint);'),
('saas.storefront_cart_projection_without_commerce_analytics(uuid,uuid,timestamp with time zone)','SELECT saas.storefront_shipping_projection(p_store_id) projection','SELECT saas.storefront_shipping_for_subtotal(p_store_id,aggregate.subtotal) projection FROM aggregate'),
('saas.storefront_intent_projection_without_commerce_analytics(uuid,uuid,timestamp with time zone)','SELECT saas.storefront_shipping_projection(p_store_id) projection','SELECT saas.storefront_shipping_for_subtotal(p_store_id,selected.price_cents*selected.quantity) projection FROM selected')
 ) manifest(identity,old_source,new_source) LOOP
  SELECT backup.definition INTO definition FROM saas.side_cart_free_shipping_backup backup WHERE backup.identity=row.identity;
  SELECT * INTO current_function FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(row.identity);
  source:=current_function.prosrc;changed:=pg_catalog.replace(source,row.old_source,row.new_source);
  IF source=changed OR pg_catalog.strpos(definition,source)=0 THEN RAISE EXCEPTION 'SIDE_CART_FREE_SHIPPING_PATCH_ANCHOR_CHANGED'; END IF;
  EXECUTE pg_catalog.replace(definition,source,changed);
 END LOOP;
END $patch$;
UPDATE saas.side_cart_free_shipping_backup backup SET migrated_definition=pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(backup.identity));
DO $authority$ DECLARE backup record; actual pg_catalog.pg_proc%ROWTYPE; BEGIN
 FOR backup IN SELECT * FROM saas.side_cart_free_shipping_backup LOOP
  SELECT * INTO actual FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(backup.identity);
  IF pg_catalog.to_jsonb(actual)-'prosrc' IS DISTINCT FROM backup.authority THEN RAISE EXCEPTION 'SIDE_CART_FREE_SHIPPING_AUTHORITY_CHANGED: %',backup.identity; END IF;
 END LOOP;
END $authority$;
COMMIT;
