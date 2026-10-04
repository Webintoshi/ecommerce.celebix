-- Additive popup/contact campaigns. Unverified cart contacts never create or link customers.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $ready$ BEGIN
 IF to_regclass('saas.store_engagement_campaigns') IS NOT NULL
 OR to_regprocedure('saas.store_policy_public_store(text,timestamptz)') IS NULL
 OR to_regprocedure('saas.promotion_effective_status_v1(text,jsonb,bigint,bigint,timestamptz)') IS NULL
 OR to_regclass('saas.storefront_cart_credentials') IS NULL
 THEN RAISE EXCEPTION 'STORE_ENGAGEMENT_215_PREDECESSOR_INVALID'; END IF;
END $ready$;

-- Historical witness only: existing native function definitions, owners and ACLs remain unchanged.
CREATE TABLE saas.store_engagement_215_function_baseline(identity text PRIMARY KEY,definition_hash text NOT NULL,owner_oid oid NOT NULL,acl text);
INSERT INTO saas.store_engagement_215_function_baseline
 SELECT p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),p.proowner,p.proacl::text
 FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.prokind='f';

CREATE FUNCTION saas.store_engagement_text_valid(p_value jsonb,p_min integer,p_max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_typeof(p_value)='string' AND p_value#>>'{}'=btrim(p_value#>>'{}')
 AND char_length(p_value#>>'{}') BETWEEN p_min AND p_max AND p_value#>>'{}'!~'[[:cntrl:]]'
$f$;
CREATE FUNCTION saas.store_engagement_uuid_valid(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_typeof(p_value)='string' AND p_value#>>'{}'~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
$f$;
CREATE FUNCTION saas.store_engagement_config_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF saas.catalog_onboarding_json_exact(p_config,ARRAY['schemaVersion','template','heading','body','buttonLabel','delaySeconds','repeatDays','devices','collectMode'],ARRAY['image','marketingOptInLabel','promotionId']) IS DISTINCT FROM true
 OR p_config->'schemaVersion'<>'1'::jsonb OR jsonb_typeof(p_config->'template')<>'string' OR p_config->>'template' NOT IN('minimal','image_left','discount')
 OR saas.store_engagement_text_valid(p_config->'heading',1,120) IS DISTINCT FROM true
 OR saas.store_engagement_text_valid(p_config->'body',0,1000) IS DISTINCT FROM true
 OR saas.store_engagement_text_valid(p_config->'buttonLabel',1,40) IS DISTINCT FROM true
 OR jsonb_typeof(p_config->'delaySeconds')<>'number' OR p_config->>'delaySeconds'!~'^[0-9]+$' OR (p_config->>'delaySeconds')::numeric NOT BETWEEN 0 AND 120
 OR jsonb_typeof(p_config->'repeatDays')<>'number' OR p_config->>'repeatDays'!~'^[0-9]+$' OR (p_config->>'repeatDays')::numeric NOT BETWEEN 1 AND 90
 OR saas.catalog_onboarding_json_exact(p_config->'devices',ARRAY['desktop','mobile'],ARRAY[]::text[]) IS DISTINCT FROM true
 OR jsonb_typeof(p_config->'devices'->'desktop')<>'boolean' OR jsonb_typeof(p_config->'devices'->'mobile')<>'boolean'
 OR NOT(p_config->'devices'->'desktop'='true'::jsonb OR p_config->'devices'->'mobile'='true'::jsonb)
 OR jsonb_typeof(p_config->'collectMode')<>'string' OR p_config->>'collectMode' NOT IN('email','phone','either') THEN RETURN false; END IF;
 IF p_config?'marketingOptInLabel' AND saas.store_engagement_text_valid(p_config->'marketingOptInLabel',1,240) IS DISTINCT FROM true THEN RETURN false; END IF;
 IF p_config?'promotionId' AND saas.store_engagement_uuid_valid(p_config->'promotionId') IS DISTINCT FROM true THEN RETURN false; END IF;
 IF p_config?'image' THEN
  IF p_config->'image'->>'kind'='media' THEN
   IF saas.catalog_onboarding_json_exact(p_config->'image',ARRAY['kind','mediaId'],ARRAY[]::text[]) IS DISTINCT FROM true OR saas.store_engagement_uuid_valid(p_config->'image'->'mediaId') IS DISTINCT FROM true THEN RETURN false; END IF;
  ELSIF p_config->'image'->>'kind'='asset' THEN
   IF saas.catalog_onboarding_json_exact(p_config->'image',ARRAY['kind','assetId'],ARRAY[]::text[]) IS DISTINCT FROM true OR saas.store_engagement_uuid_valid(p_config->'image'->'assetId') IS DISTINCT FROM true THEN RETURN false; END IF;
  ELSE RETURN false; END IF;
 END IF;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $f$;

CREATE TABLE saas.store_engagement_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN('popup','cart_capture')),name text NOT NULL CHECK(name=btrim(name) AND char_length(name) BETWEEN 1 AND 160 AND name!~'[[:cntrl:]]'),
 enabled boolean NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 config jsonb NOT NULL CHECK(pg_column_size(config)<=16384 AND saas.store_engagement_config_valid(config)),
 created_by uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,updated_by uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at),UNIQUE(store_id,id)
);
CREATE UNIQUE INDEX store_engagement_cart_capture_215 ON saas.store_engagement_campaigns(store_id) WHERE kind='cart_capture';
CREATE INDEX store_engagement_campaign_list_215 ON saas.store_engagement_campaigns(store_id,kind,created_at,id);
CREATE TABLE saas.store_engagement_admin_operations(
 store_id uuid NOT NULL REFERENCES saas.stores(id),operation_id uuid NOT NULL,principal_id uuid NOT NULL REFERENCES saas.principals(id),
 fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),request_payload jsonb NOT NULL,result_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL,PRIMARY KEY(store_id,operation_id),CHECK(pg_column_size(request_payload)<=20000 AND pg_column_size(result_payload)<=20000)
);
CREATE TABLE saas.store_engagement_cart_contacts(
 store_id uuid NOT NULL,source_cart_id uuid NOT NULL,campaign_id uuid NOT NULL,
 email text,phone text,marketing_consent boolean NOT NULL,marketing_label text,config_version bigint NOT NULL,coupon_code text,
 captured_at timestamptz NOT NULL,PRIMARY KEY(store_id,source_cart_id),
 FOREIGN KEY(store_id,source_cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,campaign_id) REFERENCES saas.store_engagement_campaigns(store_id,id) ON DELETE RESTRICT,
 CHECK(email IS NOT NULL OR phone IS NOT NULL),CHECK(NOT marketing_consent OR marketing_label IS NOT NULL),
 CHECK(email IS NULL OR(email=lower(btrim(email)) AND char_length(email)<=254 AND email!~'[[:cntrl:][:space:]]')),
 CHECK(phone IS NULL OR phone~'^\+[1-9][0-9]{7,14}$'),CHECK(isfinite(captured_at)),CHECK(config_version>0)
);
CREATE TABLE saas.store_engagement_capture_operations(
 store_id uuid NOT NULL,operation_id uuid NOT NULL,source_cart_id uuid NOT NULL,credential_digest text NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),request_payload jsonb NOT NULL,result_payload jsonb NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,operation_id),FOREIGN KEY(store_id,source_cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
 CHECK(credential_digest~'^[a-f0-9]{64}$'),CHECK(pg_column_size(request_payload)<=2048 AND pg_column_size(result_payload)<=2048)
);
CREATE TABLE saas.store_engagement_request_limits(
 store_id uuid NOT NULL,source_cart_id uuid NOT NULL,bucket timestamptz NOT NULL,requests integer NOT NULL CHECK(requests>0),
 PRIMARY KEY(store_id,source_cart_id,bucket),FOREIGN KEY(store_id,source_cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT
);
DO $tables$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['store_engagement_215_function_baseline','store_engagement_campaigns','store_engagement_admin_operations','store_engagement_cart_contacts','store_engagement_capture_operations','store_engagement_request_limits'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',t);
 END LOOP;
END $tables$;

CREATE FUNCTION saas.store_engagement_image_url(p_store uuid,p_config jsonb)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE p_config->'image'->>'kind'
 WHEN 'media' THEN(SELECT public_url FROM saas.storefront_design_media WHERE store_id=p_store AND id=(p_config->'image'->>'mediaId')::uuid AND status='active')
 WHEN 'asset' THEN(SELECT public_url FROM saas.storefront_assets WHERE store_id=p_store AND id=(p_config->'image'->>'assetId')::uuid AND status='active') END
$f$;
CREATE FUNCTION saas.store_engagement_coupon(p_store uuid,p_promotion uuid,p_now timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT code.code FROM saas.promotions p JOIN saas.promotion_codes code ON code.store_id=p.store_id AND code.promotion_id=p.id AND code.batch_id IS NULL AND code.status='active'
 LEFT JOIN LATERAL(SELECT count(*) FILTER(WHERE r.status='committed' OR(r.status='reserved' AND r.expires_at>p_now))::bigint used,
 coalesce(sum(r.reserved_budget_minor) FILTER(WHERE r.status='committed' OR(r.status='reserved' AND r.expires_at>p_now)),0)::bigint budget
 FROM saas.promotion_usage_reservations r WHERE r.store_id=p.store_id AND r.promotion_id=p.id) usage ON true
 WHERE p.store_id=p_store AND p.id=p_promotion AND p.status='active' AND p.rule_document->'trigger'->>'kind'='code'
 AND p.rule_document->'trigger'->'codes' @> to_jsonb(ARRAY[code.code])
 AND p.rule_document->'audience'->>'mode'='everyone' AND p.rule_document->'limits'->'perCustomerUsage'='null'::jsonb
 AND saas.promotion_effective_status_v1(p.status,p.rule_document,coalesce(usage.used,0),coalesce(usage.budget,0),p_now)='active'
 ORDER BY code.code LIMIT 1
$f$;
CREATE FUNCTION saas.store_engagement_projection(p_campaign saas.store_engagement_campaigns)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',p_campaign.id,'kind',p_campaign.kind,'name',p_campaign.name,'enabled',p_campaign.enabled,'version',p_campaign.version,'config',p_campaign.config,'updatedAt',saas.storefront_design_timestamp(p_campaign.updated_at))
$f$;
CREATE FUNCTION saas.store_engagement_public_projection(p_campaign saas.store_engagement_campaigns,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT saas.store_engagement_projection(p_campaign)||jsonb_build_object('imageUrl',saas.store_engagement_image_url(p_campaign.store_id,p_campaign.config),'couponCode',CASE WHEN p_campaign.kind='popup' THEN saas.store_engagement_coupon(p_campaign.store_id,(p_campaign.config->>'promotionId')::uuid,p_now) END)
$f$;

CREATE FUNCTION saas.store_engagement_campaign_list(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',coalesce(jsonb_agg(saas.store_engagement_projection(c) ORDER BY c.kind,c.created_at,c.id),'[]'::jsonb) FROM saas.store_engagement_campaigns c WHERE c.store_id=p_store;
END $f$;
CREATE FUNCTION saas.store_engagement_admin_operation_get(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.store_engagement_admin_operations;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.store_engagement_admin_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;ELSIF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;
END $f$;
CREATE FUNCTION saas.store_engagement_campaign_save(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text,p_campaign uuid,p_expected_version bigint,p_kind text,p_name text,p_enabled boolean,p_config jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.store_engagement_admin_operations;c saas.store_engagement_campaigns;request jsonb;result jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT isfinite(p_now)
 OR p_kind IS NULL OR p_kind NOT IN('popup','cart_capture') OR p_name IS NULL OR p_name<>btrim(p_name) OR char_length(p_name) NOT BETWEEN 1 AND 160 OR p_name~'[[:cntrl:]]'
 OR p_enabled IS NULL OR(p_campaign IS NULL)<>(p_expected_version IS NULL) OR p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 1 AND 9007199254740991
 OR saas.store_engagement_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('campaignId',p_campaign,'expectedVersion',p_expected_version,'kind',p_kind,'name',p_name,'enabled',p_enabled,'config',p_config);
 PERFORM pg_advisory_xact_lock(hashtextextended('store-engagement-save:'||p_store::text,215));
 SELECT * INTO op FROM saas.store_engagement_admin_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF FOUND THEN IF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 IF p_config?'image' AND saas.store_engagement_image_url(p_store,p_config) IS NULL
 AND NOT(p_enabled=false AND p_campaign IS NOT NULL AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns prior WHERE prior.store_id=p_store AND prior.id=p_campaign AND prior.kind=p_kind AND prior.version=p_expected_version AND prior.config->'image'=p_config->'image'))
 THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
 -- Turning off an existing campaign remains possible after its linked coupon expires.
 IF p_config?'promotionId' THEN
  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store AND id=(p_config->>'promotionId')::uuid) THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
  IF p_enabled AND saas.store_engagement_coupon(p_store,(p_config->>'promotionId')::uuid,p_now) IS NULL THEN RETURN QUERY SELECT 'promotion_unavailable',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_campaign IS NULL THEN
  IF p_kind='popup' AND(SELECT count(*) FROM saas.store_engagement_campaigns WHERE store_id=p_store AND kind='popup')>=20 THEN RETURN QUERY SELECT 'limit_exceeded',NULL::jsonb;RETURN;END IF;
  IF p_kind='cart_capture' AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE store_id=p_store AND kind='cart_capture') THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.store_engagement_campaigns(store_id,kind,name,enabled,config,created_by,updated_by,created_at,updated_at) VALUES(p_store,p_kind,p_name,p_enabled,p_config,p_principal,p_principal,date_trunc('milliseconds',p_now),date_trunc('milliseconds',p_now)) RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM saas.store_engagement_campaigns WHERE store_id=p_store AND id=p_campaign FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF c.version<>p_expected_version OR c.kind<>p_kind THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF c.version>=9007199254740991 OR p_now<c.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.store_engagement_campaigns SET name=p_name,enabled=p_enabled,config=p_config,version=version+1,updated_by=p_principal,updated_at=date_trunc('milliseconds',p_now) WHERE store_id=p_store AND id=c.id RETURNING * INTO c;
 END IF;
 result:=saas.store_engagement_projection(c);
 INSERT INTO saas.store_engagement_admin_operations VALUES(p_store,p_operation,p_principal,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'saved',result;
END $f$;
CREATE FUNCTION saas.store_engagement_public_settings(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',jsonb_build_object('popups',coalesce((SELECT jsonb_agg(saas.store_engagement_public_projection(c,p_now) ORDER BY c.created_at,c.id) FROM saas.store_engagement_campaigns c WHERE c.store_id=st AND c.enabled AND c.kind='popup' AND(NOT c.config?'promotionId' OR saas.store_engagement_coupon(st,(c.config->>'promotionId')::uuid,p_now) IS NOT NULL)),'[]'::jsonb),'cartCapture',(SELECT saas.store_engagement_public_projection(c,p_now) FROM saas.store_engagement_campaigns c WHERE c.store_id=st AND c.enabled AND c.kind='cart_capture' AND(NOT c.config?'promotionId' OR saas.store_engagement_coupon(st,(c.config->>'promotionId')::uuid,p_now) IS NOT NULL)));
END $f$;
CREATE FUNCTION saas.store_engagement_public_operation_get(p_hostname text,p_cart_digest text,p_now timestamptz,p_operation uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;op saas.store_engagement_capture_operations;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_cart_digest IS NULL OR p_cart_digest!~'^[a-f0-9]{64}$' OR p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.store_engagement_capture_operations WHERE store_id=st AND operation_id=p_operation;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
 ELSIF op.credential_digest<>p_cart_digest OR op.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
 ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;
END $f$;

CREATE FUNCTION saas.store_engagement_abandoned_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE contact saas.store_engagement_cart_contacts;BEGIN
 IF NEW.customer_id IS NULL AND NEW.source_cart_id IS NOT NULL THEN
  SELECT * INTO contact FROM saas.store_engagement_cart_contacts WHERE store_id=NEW.store_id AND source_cart_id=NEW.source_cart_id;
  IF FOUND THEN NEW.customer_email:=contact.email;NEW.customer_phone:=contact.phone;END IF;
 END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER store_engagement_abandoned_contact_215 BEFORE INSERT OR UPDATE ON saas.abandoned_carts FOR EACH ROW EXECUTE FUNCTION saas.store_engagement_abandoned_contact();

CREATE FUNCTION saas.store_engagement_contact_capture(p_hostname text,p_cart_digest text,p_now timestamptz,p_operation uuid,p_campaign uuid,p_email text,p_phone text,p_marketing_consent boolean,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;cart uuid;op saas.store_engagement_capture_operations;c saas.store_engagement_campaigns;contact saas.store_engagement_cart_contacts;request jsonb;result jsonb;quota integer;coupon text;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_operation IS NULL OR p_campaign IS NULL OR p_marketing_consent IS NULL OR p_cart_digest IS NULL OR p_cart_digest!~'^[a-f0-9]{64}$' OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
 OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('campaignId',p_campaign,'email',p_email,'phone',p_phone,'marketingConsent',p_marketing_consent);
 PERFORM pg_advisory_xact_lock(hashtextextended('store-engagement-capture:'||st::text||':'||p_cart_digest,215));
 SELECT * INTO op FROM saas.store_engagement_capture_operations WHERE store_id=st AND operation_id=p_operation;
 IF FOUND THEN IF op.credential_digest<>p_cart_digest OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 SELECT cc.cart_id INTO cart FROM saas.storefront_cart_credentials cc JOIN saas.storefront_carts sc ON sc.store_id=cc.store_id AND sc.id=cc.cart_id
 WHERE cc.store_id=st AND cc.credential_digest=p_cart_digest AND cc.expires_at>p_now AND sc.status='active' AND sc.expires_at>p_now;
 IF cart IS NULL THEN RETURN QUERY SELECT 'cart_unavailable',NULL::jsonb;RETURN;END IF;
 -- Lock the source cart like commerce mutations. Do not invert the existing sync advisory lock order.
 PERFORM 1 FROM saas.storefront_carts WHERE store_id=st AND id=cart AND status='active' AND expires_at>p_now FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items WHERE store_id=st AND cart_id=cart AND quantity>0) THEN RETURN QUERY SELECT 'cart_unavailable',NULL::jsonb;RETURN;END IF;
 DELETE FROM saas.store_engagement_request_limits WHERE store_id=st AND source_cart_id=cart AND bucket<p_now-interval '48 hours';
 INSERT INTO saas.store_engagement_request_limits VALUES(st,cart,date_trunc('hour',p_now),1) ON CONFLICT(store_id,source_cart_id,bucket) DO UPDATE SET requests=saas.store_engagement_request_limits.requests+1 RETURNING requests INTO quota;
 IF quota>20 THEN RETURN QUERY SELECT 'rate_limited',NULL::jsonb;RETURN;END IF;
 IF(p_email IS NULL AND p_phone IS NULL) OR(p_email IS NOT NULL AND(p_email<>lower(btrim(p_email)) OR char_length(p_email)>254 OR p_email!~$regex$^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$$regex$))
 OR(p_phone IS NOT NULL AND(p_phone!~'^\+[1-9][0-9]{7,14}$' OR(p_phone LIKE '+90%' AND p_phone!~'^\+90[2-5][0-9]{9}$'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO c FROM saas.store_engagement_campaigns WHERE store_id=st AND id=p_campaign AND kind='cart_capture' AND enabled;
 IF NOT FOUND THEN RETURN QUERY SELECT 'campaign_unavailable',NULL::jsonb;RETURN;END IF;
 IF(c.config->>'collectMode'='email' AND p_email IS NULL) OR(c.config->>'collectMode'='phone' AND p_phone IS NULL) OR(p_marketing_consent AND NOT c.config?'marketingOptInLabel') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO contact FROM saas.store_engagement_cart_contacts WHERE store_id=st AND source_cart_id=cart;
 IF FOUND AND(contact.email IS DISTINCT FROM p_email OR contact.phone IS DISTINCT FROM p_phone OR contact.marketing_consent<>p_marketing_consent) THEN RETURN QUERY SELECT 'contact_conflict',NULL::jsonb;RETURN;END IF;
 coupon:=saas.store_engagement_coupon(st,(c.config->>'promotionId')::uuid,p_now);
 IF c.config?'promotionId' AND coupon IS NULL THEN RETURN QUERY SELECT 'promotion_unavailable',NULL::jsonb;RETURN;END IF;
 IF contact.source_cart_id IS NULL THEN
  INSERT INTO saas.store_engagement_cart_contacts VALUES(st,cart,c.id,p_email,p_phone,p_marketing_consent,CASE WHEN p_marketing_consent THEN c.config->>'marketingOptInLabel' END,c.version,coupon,date_trunc('milliseconds',p_now));
  UPDATE saas.abandoned_carts SET customer_email=p_email,customer_phone=p_phone,version=version+1,updated_at=greatest(updated_at,date_trunc('milliseconds',p_now)) WHERE store_id=st AND source_cart_id=cart AND customer_id IS NULL;
 END IF;
 result:=jsonb_build_object('contactCaptured',true,'couponCode',coupon);
 INSERT INTO saas.store_engagement_capture_operations VALUES(st,p_operation,cart,p_cart_digest,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'captured',result;
END $f$;

DO $grants$ DECLARE p record;BEGIN
 FOR p IN SELECT oid,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'store_engagement_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',p.oid::regprocedure);
  IF p.proname IN('store_engagement_campaign_list','store_engagement_campaign_save','store_engagement_admin_operation_get') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',p.oid::regprocedure);
  ELSIF p.proname IN('store_engagement_public_settings','store_engagement_public_operation_get','store_engagement_contact_capture') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_host_resolver',p.oid::regprocedure);END IF;
 END LOOP;
END $grants$;
COMMIT;
