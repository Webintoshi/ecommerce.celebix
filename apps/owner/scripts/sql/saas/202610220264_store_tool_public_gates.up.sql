-- Store-tool licenses guard the public readers and writes independently of package tiers.
-- Existing signatures, DTOs, policy locks, delivery leases and durable replay remain compatible.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.store_tool.public.release264',0));
DO $pre$BEGIN
 IF to_regprocedure('saas.store_tool_is_licensed(uuid,text,timestamp with time zone)')IS NULL OR to_regclass('saas.store_tool_licenses')IS NULL OR to_regclass('saas.store_tool_purchases')IS NULL OR to_regprocedure('saas.restock_enabled(uuid,timestamp with time zone)')IS NOT NULL THEN RAISE EXCEPTION 'STORE_TOOL264_PREDECESSOR_REQUIRED';END IF;
END $pre$;
CREATE TABLE saas.store_tool_public264_functions(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text NOT NULL,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],function_config text[],function_security boolean NOT NULL,function_volatility char NOT NULL,function_strict boolean NOT NULL,function_parallel char NOT NULL,function_language oid NOT NULL,is_new boolean NOT NULL);
ALTER TABLE saas.store_tool_public264_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_tool_public264_functions FORCE ROW LEVEL SECURITY;
CREATE POLICY store_tool_public264_owner ON saas.store_tool_public264_functions TO celebix_saas_owner USING(true)WITH CHECK(true);
REVOKE ALL ON saas.store_tool_public264_functions FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.store_tool_public264_functions FROM %I',r.rolname);END LOOP;END $acl$;
DO $reviewed$DECLARE r record;p record;BEGIN
 FOR r IN SELECT * FROM(VALUES
  ('saas.google_merchant_whatsapp_catalog_only(uuid)','40f72beceb1a3f8b173f5a1f663f4cb57f70dbff23c68ba127d144415f80b3fc','{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[],false,'s'),
  ('saas.order_bump_public_offers(text,timestamp with time zone,jsonb,text)','d96ffd168585010ffad95d1618536d94dfc336b951c4b662471029f139c49056','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'s'),
  ('saas.public_contact_widget_get(text,timestamp with time zone)','e4724cdd46f000d29aeedb9df88a6de49ea88da141adce952f03a9b7c7d3e350','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'s'),
  ('saas.public_restock_alerts_get(text,timestamp with time zone)','a1bbde2177ba218ca1c654c175ea65400a812101b21c82816a2aaa543700f218','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'s'),
  ('saas.public_whatsapp_order_get(text,timestamp with time zone)','253516b18e1a8441dfc84e6387b1b46dff1edcc0f5e3dfcc8609d078255f6c96','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'s'),
  ('saas.restock_authorize(uuid,uuid,text,timestamp with time zone)','f35a5f1b80ecad92c658d35a1a3ede5500686800199b8190e81cfe8f1d19a6a1','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'::aclitem[],true,'v'),
  ('saas.restock_claim(timestamp with time zone,text,integer)','198d6bbf869abe837274d4d33ebff04e40b05c6c62f1737409a406b153504df4','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'::aclitem[],true,'v'),
  ('saas.restock_enabled(uuid)','b70f46ca55c26b1c061561d186c223b25a8761c31e3e0aa203b1eeb7a5b40bc4','{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[],false,'s'),
  ('saas.restock_manage(text,text,text,timestamp with time zone)','f289f29d1b4c780dbb6f1408f0f2d320c600c4c9a2c58d31d69081acc15b68ac','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'v'),
  ('saas.restock_subscribe(text,uuid,text,text,text,text,timestamp with time zone)','7be818fc19c19ddfb3a5a3b8bfd3774c3cf75995e8eeb9332f7f29a4b40a4a89','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'v'),
  ('saas.store_engagement_contact_capture(text,text,timestamp with time zone,uuid,uuid,text,text,boolean,text)','7cd368c398132331e24e3391a54108d277fac35a2a1e9b06b82e5d3e016c0577','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'v'),
  ('saas.store_engagement_public_settings(text,timestamp with time zone)','5acf3fb386575bbf039e567e51d69bdac56ba48c00e908c9e47ca08adda512dd','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'::aclitem[],true,'s'),
  ('saas.whatsapp_commerce_allowed_258(text,timestamp with time zone,text,jsonb,uuid,uuid,integer,uuid)','ea778ed0c1c4aebd381671141e5c299f30e73c75eed85006f489af5d8a15e790','{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[],true,'v')
 )v(signature,sha,acl,security,volatility)LOOP
  SELECT f.*,pg_get_functiondef(f.oid)definition INTO p FROM pg_proc f WHERE f.oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR encode(sha256(convert_to(p.definition,'UTF8')),'hex')<>r.sha OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM r.acl OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR p.prosecdef IS DISTINCT FROM r.security OR p.provolatile::text<>r.volatility OR p.proisstrict OR p.proparallel<>'u' THEN RAISE EXCEPTION 'STORE_TOOL264_PREDECESSOR_DRIFT:%',r.signature;END IF;
  INSERT INTO saas.store_tool_public264_functions VALUES(r.signature,p.definition,r.sha,r.sha,p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang,false);
 END LOOP;
END $reviewed$;

-- Trusted caller time is propagated to the worker and public subscription writes.
CREATE OR REPLACE FUNCTION saas.restock_enabled(p_store uuid, p_now timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT EXISTS(SELECT 1 FROM saas.stores s JOIN saas.merchant_admin_records r ON r.store_id=s.id WHERE s.id=p_store AND saas.store_tool_is_licensed(p_store,'restock',p_now) AND s.status='active' AND r.record_kind='restock_alerts' AND r.status='active' AND r.config->'enabled'='true'::jsonb AND saas.restock_alerts_config_valid(r.config))
$function$
;
REVOKE ALL ON FUNCTION saas.restock_enabled(uuid,timestamptz) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.restock_enabled(uuid,timestamptz) FROM %I',r.rolname);END LOOP;END $acl$;
INSERT INTO saas.store_tool_public264_functions SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang,true FROM pg_proc p WHERE p.oid='saas.restock_enabled(uuid,timestamptz)'::regprocedure;

DO $patch$DECLARE r record;d text;change jsonb;anchor text;expected integer;BEGIN
 FOR r IN SELECT * FROM saas.store_tool_public264_functions WHERE NOT is_new LOOP
  d:=r.definition;
  FOR change IN SELECT value FROM jsonb_array_elements(CASE r.signature
   WHEN 'saas.google_merchant_whatsapp_catalog_only(uuid)' THEN '[[" SELECT count(*)>1 OR coalesce(bool_or(", " SELECT saas.store_tool_is_licensed(p_store,''whatsapp_ordering'',statement_timestamp()) AND (count(*)>1 OR coalesce(bool_or(", 1], [")),false)\n FROM saas.merchant_admin_records", ")),false))\n FROM saas.merchant_admin_records", 1]]'::jsonb
   WHEN 'saas.order_bump_public_offers(text,timestamp with time zone,jsonb,text)' THEN '[["IF NOT saas.commercial_plan_has_capability(saas.commercial_current_plan(st),''growth_tools'') THEN", "IF NOT saas.store_tool_is_licensed(st,''order_bump'',p_now) THEN", 1]]'::jsonb
   WHEN 'saas.public_contact_widget_get(text,timestamp with time zone)' THEN '[["WHERE r.store_id=selected_store AND r.record_kind=''contact_widget''", "WHERE r.store_id=selected_store AND saas.store_tool_is_licensed(selected_store,''contact_widget'',p_now) AND r.record_kind=''contact_widget''", 1]]'::jsonb
   WHEN 'saas.public_restock_alerts_get(text,timestamp with time zone)' THEN '[["WHERE r.store_id=st AND r.record_kind=''restock_alerts''", "WHERE r.store_id=st AND saas.store_tool_is_licensed(st,''restock'',p_now) AND r.record_kind=''restock_alerts''", 1]]'::jsonb
   WHEN 'saas.public_whatsapp_order_get(text,timestamp with time zone)' THEN '[[" SELECT count(*) INTO total FROM saas.merchant_admin_records", " IF NOT saas.store_tool_is_licensed(st,''whatsapp_ordering'',p_now) THEN RETURN QUERY SELECT ''found'',NULL::jsonb;RETURN;END IF;\n SELECT count(*) INTO total FROM saas.merchant_admin_records", 1]]'::jsonb
   WHEN 'saas.restock_authorize(uuid,uuid,text,timestamp with time zone)' THEN '[["saas.restock_enabled(s.store_id)", "saas.restock_enabled(s.store_id,p_now)", 1]]'::jsonb
   WHEN 'saas.restock_claim(timestamp with time zone,text,integer)' THEN '[["saas.restock_enabled(s.store_id)", "saas.restock_enabled(s.store_id,p_now)", 2]]'::jsonb
   WHEN 'saas.restock_enabled(uuid)' THEN '[["WHERE s.id=p_store AND s.status=''active''", "WHERE s.id=p_store AND saas.store_tool_is_licensed(p_store,''restock'',statement_timestamp()) AND s.status=''active''", 1]]'::jsonb
   WHEN 'saas.restock_manage(text,text,text,timestamp with time zone)' THEN '[["saas.restock_enabled(st)", "saas.restock_enabled(st,p_now)", 1]]'::jsonb
   WHEN 'saas.restock_subscribe(text,uuid,text,text,text,text,timestamp with time zone)' THEN '[["saas.restock_enabled(st)", "saas.restock_enabled(st,p_now)", 1]]'::jsonb
   WHEN 'saas.store_engagement_contact_capture(text,text,timestamp with time zone,uuid,uuid,text,text,boolean,text)' THEN '[[" SELECT cc.cart_id INTO cart FROM saas.storefront_cart_credentials", " IF NOT saas.store_tool_is_licensed(st,''cart_capture'',p_now) THEN RETURN QUERY SELECT ''campaign_unavailable'',NULL::jsonb;RETURN;END IF;\n SELECT cc.cart_id INTO cart FROM saas.storefront_cart_credentials", 1]]'::jsonb
   WHEN 'saas.store_engagement_public_settings(text,timestamp with time zone)' THEN '[[" IF NOT saas.commercial_plan_has_capability(saas.commercial_current_plan(st),''growth_tools'') THEN RETURN QUERY SELECT ''ok'',jsonb_build_object(''popups'',''[]''::jsonb,''cartCapture'',NULL);RETURN;END IF;\n", "", 1], ["WHERE c.store_id=st AND c.enabled AND c.kind=''popup''", "WHERE c.store_id=st AND c.enabled AND c.kind=''popup'' AND saas.commercial_plan_has_capability(saas.commercial_current_plan(st),''growth_tools'')", 1], ["WHERE c.store_id=st AND c.enabled AND c.kind=''cart_capture''", "WHERE c.store_id=st AND c.enabled AND c.kind=''cart_capture'' AND saas.store_tool_is_licensed(st,''cart_capture'',p_now)", 1]]'::jsonb
   WHEN 'saas.whatsapp_commerce_allowed_258(text,timestamp with time zone,text,jsonb,uuid,uuid,integer,uuid)' THEN '[[" SELECT count(*) INTO records FROM saas.merchant_admin_records", " IF NOT saas.store_tool_is_licensed(s,''whatsapp_ordering'',p_now) THEN RETURN true;END IF;\n SELECT count(*) INTO records FROM saas.merchant_admin_records", 1]]'::jsonb
   ELSE '[]'::jsonb END)LOOP
   anchor:=change->>0;expected:=(change->>2)::integer;
   IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>expected THEN RAISE EXCEPTION 'STORE_TOOL264_PATCH_ANCHOR:%:%',r.signature,anchor;END IF;
   d:=replace(d,anchor,change->>1);
  END LOOP;
  EXECUTE d;
 END LOOP;
 UPDATE saas.store_tool_public264_functions SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
 IF(SELECT count(*) FROM saas.store_tool_public264_functions)<>14 OR(SELECT count(*) FROM saas.store_tool_public264_functions WHERE is_new)<>1 THEN RAISE EXCEPTION 'STORE_TOOL264_PATCH_COUNT';END IF;
END $patch$;
COMMIT;
