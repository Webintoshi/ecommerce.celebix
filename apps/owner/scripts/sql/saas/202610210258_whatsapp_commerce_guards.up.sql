-- Apply after native256/257 before enabling any restrictive WhatsApp policy.
-- Keep all existing function identities, ACLs and replay/payment result handlers.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.whatsapp_commerce_258_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.whatsapp_commerce_258_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.whatsapp_commerce_258_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.whatsapp_commerce_258_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;

CREATE FUNCTION saas.whatsapp_commerce_allowed_258(
 p_hostname text,p_now timestamptz,p_action text,p_credentials jsonb,p_cart_id uuid,p_variant_id uuid,p_quantity integer,p_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE s uuid;r saas.merchant_admin_records;records integer;hide_add boolean;block_checkout boolean;selected_cart uuid;current_quantity integer;
BEGIN
 s:=saas.storefront_public_store(p_hostname,p_now);
 -- Preserve existing validation and not_found outcomes for invalid authorities.
 IF s IS NULL THEN RETURN true;END IF;
 -- Same authority lock as native256 save. It covers the absence of a setting too.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.whatsapp_order_setting.store:'||s::text,256));
 SELECT count(*) INTO records FROM saas.merchant_admin_records WHERE store_id=s AND record_kind='whatsapp_order_setting' AND status<>'archived';
 IF records=0 THEN RETURN true;END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=s AND record_kind='whatsapp_order_setting' AND status<>'archived' ORDER BY id LIMIT 1;
 IF records<>1 OR r.status<>'active' OR saas.whatsapp_order_config_valid(r.config) IS DISTINCT FROM true THEN
  hide_add:=true;block_checkout:=true;
 ELSE
  hide_add:=r.config->'enabled'='true'::jsonb AND r.config->'hideAddToCart'='true'::jsonb;
  block_checkout:=r.config->'enabled'='true'::jsonb AND (r.config->'hidePrices'='true'::jsonb OR hide_add);
 END IF;
 -- Durable native replay still validates its own fingerprint/credentials below.
 IF p_action='complete' AND EXISTS(SELECT 1 FROM saas.storefront_checkout_operations WHERE store_id=s AND operation_id=p_operation_id) THEN RETURN true;END IF;
 IF p_action='hosted' AND EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations WHERE store_id=s AND operation_id=p_operation_id AND operation_kind='start') THEN RETURN true;END IF;
 IF p_action IN('add','quantity') AND EXISTS(SELECT 1 FROM saas.storefront_cart_operations WHERE store_id=s AND operation_id=p_operation_id) THEN RETURN true;END IF;
 IF p_action IN('checkout','complete','hosted','buy_now') THEN RETURN NOT block_checkout;END IF;
 IF NOT hide_add OR p_action NOT IN('add','quantity') THEN RETURN true;END IF;
 IF p_action='add' THEN RETURN false;END IF;
 -- Compare against the authenticated cart under its ordinary write lock. Removal
 -- and decreases remain available, including the final line of an existing cart.
 IF jsonb_typeof(p_credentials)='array' AND jsonb_array_length(p_credentials)>0 THEN
  SELECT cart.id INTO selected_cart FROM saas.storefront_carts cart
  JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
  JOIN jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE cart.store_id=s ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
 ELSE selected_cart:=p_cart_id;END IF;
 SELECT quantity INTO current_quantity FROM saas.storefront_cart_items WHERE store_id=s AND cart_id=selected_cart AND variant_id=p_variant_id;
 RETURN coalesce(p_quantity<=coalesce(current_quantity,0),false);
END $f$;

CREATE FUNCTION saas.whatsapp_commerce_setting_lock_258() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF NEW.record_kind='whatsapp_order_setting' OR OLD.record_kind='whatsapp_order_setting' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.whatsapp_order_setting.store:'||coalesce(NEW.store_id,OLD.store_id)::text,256));
 END IF;
 RETURN coalesce(NEW,OLD);
END $f$;
CREATE TRIGGER whatsapp_commerce_setting_lock_258 BEFORE INSERT OR UPDATE OR DELETE ON saas.merchant_admin_records FOR EACH ROW EXECUTE FUNCTION saas.whatsapp_commerce_setting_lock_258();

DO $patch$
DECLARE target record;definition text;guard text;action text;args text;targets text[]:=ARRAY[
 'public_cart_mutate','public_buy_now_create','public_checkout_quote','public_checkout_quote_v2','public_checkout_quote_v3',
 'public_checkout_complete','public_checkout_complete_v2','public_checkout_complete_v3',
 'public_storefront_hosted_checkout_authority','public_storefront_hosted_checkout_authority_v2','public_storefront_hosted_checkout_authority_v3',
 'public_storefront_hosted_checkout_begin','public_storefront_hosted_checkout_begin_v2','public_storefront_hosted_checkout_begin_v3'];
BEGIN
 IF (SELECT count(DISTINCT proname) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname=ANY(targets))<>14
 OR to_regprocedure('saas.whatsapp_order_config_valid(jsonb)') IS NULL THEN RAISE EXCEPTION 'WHATSAPP_COMMERCE258_PREDECESSOR_INVALID';END IF;
 FOR target IN SELECT p.*,l.lanname FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='saas'::regnamespace AND p.proname=ANY(targets) LOOP
  definition:=pg_get_functiondef(target.oid);
  -- The legacy14-argument SQL cart overload delegates to the guarded15-argument entrypoint.
  IF target.lanname='sql' AND target.proname='public_cart_mutate' AND target.pronargs=14 AND position('saas.public_cart_mutate(' IN target.prosrc)>0 THEN CONTINUE;END IF;
  IF target.lanname<>'plpgsql' OR NOT ('p_hostname'=ANY(target.proargnames)) OR NOT ('p_now'=ANY(target.proargnames)) THEN RAISE EXCEPTION 'WHATSAPP_COMMERCE258_LANGUAGE_DRIFT %',target.oid::regprocedure;END IF;
  action:=CASE WHEN target.proname='public_cart_mutate' THEN 'p_action' WHEN target.proname='public_buy_now_create' THEN '''buy_now''' WHEN target.proname LIKE 'public_checkout_complete%' THEN '''complete''' WHEN target.proname LIKE 'public_storefront_hosted_checkout_%' THEN '''hosted''' ELSE '''checkout''' END;
  args:=CASE WHEN target.proname='public_cart_mutate' THEN 'p_credentials,p_cart_id,p_variant_id,p_quantity,p_operation_id' ELSE '''[]''::jsonb,NULL::uuid,NULL::uuid,NULL::integer,'||CASE WHEN 'p_operation_id'=ANY(target.proargnames) THEN 'p_operation_id' ELSE 'NULL::uuid' END END;
  guard:=E'\n IF NOT saas.whatsapp_commerce_allowed_258(p_hostname,p_now,'||action||','||args||E') THEN RETURN QUERY SELECT ''unavailable''::text,NULL::jsonb;RETURN;END IF;\n';
  INSERT INTO saas.whatsapp_commerce_258_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl)
   VALUES(target.oid::regprocedure::text,definition,encode(sha256(convert_to(definition,'UTF8')),'hex'),target.oid,target.proowner,target.proacl);
  IF definition!~E'\\nBEGIN\\n' THEN RAISE EXCEPTION 'WHATSAPP_COMMERCE258_BODY_DRIFT %',target.oid::regprocedure;END IF;
  EXECUTE regexp_replace(definition,E'\\nBEGIN\\n',E'\nBEGIN\n'||guard);
 END LOOP;
 IF (SELECT count(*) FROM saas.whatsapp_commerce_258_backup)<>17 THEN RAISE EXCEPTION 'WHATSAPP_COMMERCE258_TARGET_COUNT';END IF;
 UPDATE saas.whatsapp_commerce_258_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
END $patch$;
REVOKE ALL ON FUNCTION saas.whatsapp_commerce_allowed_258(text,timestamptz,text,jsonb,uuid,uuid,integer,uuid),saas.whatsapp_commerce_setting_lock_258() FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
COMMIT;
