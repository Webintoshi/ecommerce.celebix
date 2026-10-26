-- Forward-only lifecycle repair. Preserve payment uncertainty, original intent
-- bindings, manual requests, rights and all historical purchase/receipt rows.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.platform-commerce.release282',0));
DO $preflight$DECLARE s text;expected text;actual text;BEGIN
 IF to_regclass('saas.platform_checkout281_predecessors')IS NULL OR to_regclass('saas.platform_checkout282_predecessors')IS NOT NULL THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PREDECESSOR_INVALID';END IF;
 FOR s,expected IN SELECT *FROM(VALUES
 ('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','9b95494afb5b74c09c737230ed635d2cc78b373d03951cf46bd7bf30457e8051'),
 ('saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)','29c07ea291cb1a9330dcf0d734aa3813042222b377f36f4052f34b0e7c6685b5'),
 ('saas.platform_tool_purchases_read(uuid,jsonb)','cb61b26e014ebbe90d59e925767a92e2de127d3d34ee761ba0c4883bab9b4f32'),
 ('saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)','a0fe2a8c0dab86f1afa18387d135da11c5bf42324e1e8e372a46f8da12e0330b'),
 ('saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb)','1572c79640d6be515279ce16b1cb46e72532c25a2152c51c24fcd3b35490bb3a'))v(signature,digest)LOOP
  SELECT encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s)),'UTF8')),'hex')INTO actual;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_ROUTINE_DRIFT:%',s;END IF;
 END LOOP;
END $preflight$;
CREATE TABLE saas.platform_checkout282_predecessors(signature text PRIMARY KEY,definition_sha256 char(64)NOT NULL,published_sha256 char(64),definition text NOT NULL,owner_name text NOT NULL,acl text,config text[],security_definer boolean NOT NULL,volatility char NOT NULL);
INSERT INTO saas.platform_checkout282_predecessors SELECT p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),NULL,pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef,p.provolatile FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace;
CREATE TABLE saas.platform_tool_purchase_origins282(
 store_id uuid NOT NULL,purchase_id uuid NOT NULL,order_id uuid NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,purchase_id),UNIQUE(store_id,purchase_id,order_id),
 FOREIGN KEY(store_id,purchase_id)REFERENCES saas.store_tool_purchases(store_id,id),
 FOREIGN KEY(store_id,order_id)REFERENCES saas.platform_checkout_orders(store_id,id)
);
CREATE TABLE saas.platform_tool_purchase_releases282(
 store_id uuid NOT NULL,purchase_id uuid NOT NULL,order_id uuid NOT NULL,released_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,purchase_id),
 FOREIGN KEY(store_id,purchase_id,order_id)REFERENCES saas.platform_tool_purchase_origins282(store_id,purchase_id,order_id)
);
CREATE TRIGGER platform_tool_purchase_origins_immutable282 BEFORE UPDATE OR DELETE ON saas.platform_tool_purchase_origins282 FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE TRIGGER platform_tool_purchase_releases_immutable282 BEFORE UPDATE OR DELETE ON saas.platform_tool_purchase_releases282 FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
DO $private$DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['platform_checkout282_predecessors','platform_tool_purchase_origins282','platform_tool_purchase_releases282']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY platform_checkout282_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;
END $private$;
CREATE FUNCTION saas.platform_tool_purchase_released282(p_store uuid,p_purchase uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.platform_tool_purchase_releases282 WHERE store_id=p_store AND purchase_id=p_purchase)
$f$;
CREATE FUNCTION saas.platform_checkout_expire282(p_store uuid,p_principal uuid,p_now timestamptz)RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE candidate record;o saas.platform_checkout_orders;BEGIN
 -- Caller has already authenticated the current store and holds the existing
 -- store-version, commercial.store and store-tools.store locks, in that order.
 FOR candidate IN SELECT id FROM saas.platform_checkout_orders WHERE store_id=p_store AND status IN('pending','processing','failed')AND expires_at<=p_now ORDER BY id LOOP
  -- Match begin/finish lock order, then take a fresh statement snapshot after
  -- that lock: a begin committed while we waited must remain financially live.
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:'||candidate.id,0));
  SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=candidate.id AND store_id=p_store FOR UPDATE;
  IF o.status NOT IN('pending','processing','failed')OR o.expires_at>p_now
   OR EXISTS(SELECT 1 FROM saas.platform_checkout_attempts WHERE order_id=o.id AND status<>'failed')THEN CONTINUE;END IF;
  UPDATE saas.platform_checkout_orders SET status='expired',updated_at=p_now WHERE id=o.id;
  INSERT INTO saas.platform_checkout_audit(order_id,actor_kind,principal_id,action,payload,created_at)
  VALUES(o.id,'buyer',p_principal,'quote_expired',jsonb_build_object('reason','unpaid_quote_expired','previousStatus',o.status),p_now);
 END LOOP;
 -- No timestamp/linkage inference for pre282 purchases: only a prospective
 -- origin written by our own successful INSERT can release a pending snapshot.
 INSERT INTO saas.platform_tool_purchase_releases282(store_id,purchase_id,order_id,released_at)
 SELECT origin.store_id,origin.purchase_id,origin.order_id,p_now
 FROM saas.platform_tool_purchase_origins282 origin JOIN saas.store_tool_purchases purchase ON purchase.store_id=origin.store_id AND purchase.id=origin.purchase_id
 WHERE origin.store_id=p_store AND purchase.status='pending'
 AND NOT EXISTS(SELECT 1 FROM saas.store_tool_receipts WHERE store_id=p_store AND purchase_id=purchase.id)
 AND NOT EXISTS(SELECT 1 FROM saas.platform_checkout_orders q WHERE q.store_id=p_store AND q.tool_purchase_id=purchase.id AND q.status<>'expired')
 AND NOT EXISTS(SELECT 1 FROM saas.platform_checkout_orders q JOIN saas.platform_checkout_attempts a ON a.order_id=q.id WHERE q.store_id=p_store AND q.tool_purchase_id=purchase.id AND a.status<>'failed')
 ON CONFLICT DO NOTHING;
END $f$;
-- Every replacement is an exact, counted edit of its reviewed predecessor.
-- CREATE OR REPLACE preserves each routine's ACL, owner and execution contract.
DO $patch$DECLARE s text;source text;needle text;replacement text;BEGIN
 s:='saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)';source:=pg_get_functiondef(to_regprocedure(s));
 needle:='keys text[]:=''{}'';new_id uuid:=gen_random_uuid();BEGIN';replacement:='keys text[]:=''{}'';new_id uuid:=gen_random_uuid();platform_new_purchase boolean:=false;BEGIN';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_DECLARATION';END IF;source:=replace(source,needle,replacement);
 needle:='SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=prior.order_id;';replacement:='PERFORM pg_advisory_xact_lock(hashtextextended(''saas.platform.checkout.order281:''||prior.order_id,0));'||E'\n   SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=prior.order_id FOR UPDATE;'||E'\n   IF o.expires_at<=moment AND o.status IN(''pending'',''processing'',''failed'',''expired'')AND NOT EXISTS(SELECT 1 FROM saas.platform_checkout_attempts WHERE order_id=o.id AND status<>''failed'')THEN RETURN QUERY SELECT ''checkout_expired'',NULL::jsonb;RETURN;END IF;';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_PRIOR';END IF;source:=replace(source,needle,replacement);
 needle:='SELECT *INTO sub FROM saas.subscriptions WHERE store_id=p_store AND status=''active''AND valid_from<=moment AND(valid_until IS NULL OR valid_until>moment);';replacement:='PERFORM saas.platform_checkout_expire282(p_store,p_principal,moment);'||E'\n '||needle;
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_CLEANUP';END IF;source:=replace(source,needle,replacement);
 needle:='SELECT *INTO purchase FROM saas.store_tool_purchases WHERE store_id=p_store AND status=''pending''AND tool_keys&&offer.tool_keys ORDER BY created_at,id LIMIT 1;';replacement:='SELECT *INTO purchase FROM saas.store_tool_purchases WHERE store_id=p_store AND status=''pending''AND tool_keys&&offer.tool_keys AND NOT saas.platform_tool_purchase_released282(store_id,id)ORDER BY created_at,id LIMIT 1;';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_OVERLAP';END IF;source:=replace(source,needle,replacement);
 needle:='moment)RETURNING *INTO purchase;';replacement:=needle||'platform_new_purchase:=true;';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_ORIGIN_FLAG';END IF;source:=replace(source,needle,replacement);
 needle:='INSERT INTO saas.platform_checkout_intents(operation_id,order_id,store_id,principal_id,intent,handoff_digest,created_at,expires_at)';replacement:='IF platform_new_purchase THEN INSERT INTO saas.platform_tool_purchase_origins282(store_id,purchase_id,order_id,created_at)VALUES(p_store,purchase.id,o.id,moment);END IF;'||E'\n '||needle;
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_ORIGIN';END IF;source:=replace(source,needle,replacement);EXECUTE source;
 s:='saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)';source:=pg_get_functiondef(to_regprocedure(s));
 needle:='WHERE store_id=p_store ORDER BY created_at DESC,id LIMIT 100';replacement:='WHERE store_id=p_store AND NOT saas.platform_tool_purchase_released282(store_id,id)ORDER BY created_at DESC,id LIMIT 100';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_WORKSPACE';END IF;EXECUTE replace(source,needle,replacement);
 s:='saas.platform_tool_purchases_read(uuid,jsonb)';source:=pg_get_functiondef(to_regprocedure(s));
 needle:='FROM saas.store_tool_purchases WHERE(NOT p_query?''storeId''';replacement:='FROM saas.store_tool_purchases WHERE NOT saas.platform_tool_purchase_released282(store_id,id)AND(NOT p_query?''storeId''';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_OWNER_LIST';END IF;EXECUTE replace(source,needle,replacement);
 s:='saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)';source:=pg_get_functiondef(to_regprocedure(s));
 needle:='IF FOUND THEN IF prior.principal_id<>p_principal';replacement:='IF FOUND THEN IF saas.platform_tool_purchase_released282(p_store,prior.id)THEN RETURN QUERY SELECT ''purchase_pending'',NULL::jsonb;RETURN;END IF;IF prior.principal_id<>p_principal';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_MANUAL_PRIOR';END IF;source:=replace(source,needle,replacement);
 needle:='status=''pending''AND tool_keys&&o.tool_keys)';replacement:='status=''pending''AND tool_keys&&o.tool_keys AND NOT saas.platform_tool_purchase_released282(store_id,id))';
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_MANUAL_OVERLAP';END IF;EXECUTE replace(source,needle,replacement);
 s:='saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb)';source:=pg_get_functiondef(to_regprocedure(s));
 needle:='IF p.status=''settled''THEN';replacement:='IF saas.platform_tool_purchase_released282(sid,p.id)THEN RAISE EXCEPTION ''record_not_found'';END IF;'||needle;
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PATCH_MANUAL_SETTLE';END IF;EXECUTE replace(source,needle,replacement);
END $patch$;
UPDATE saas.platform_checkout282_predecessors b SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(b.signature)),'UTF8')),'hex');
REVOKE ALL ON FUNCTION saas.platform_tool_purchase_released282(uuid,uuid),saas.platform_checkout_expire282(uuid,uuid,timestamptz)FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION saas.platform_tool_purchase_released282(uuid,uuid),saas.platform_checkout_expire282(uuid,uuid,timestamptz)FROM %I',r.rolname);
END LOOP;END $acl$;
COMMIT;
