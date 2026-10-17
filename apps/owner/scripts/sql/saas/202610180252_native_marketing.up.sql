BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE saas.native_marketing_settings(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),enabled boolean NOT NULL DEFAULT true,
 cart_reminder_enabled boolean NOT NULL DEFAULT false,second_cart_reminder_enabled boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),updated_at timestamptz NOT NULL
);
-- Platform operations may adjust this private allowance. It is not a tariff.
CREATE TABLE saas.native_marketing_store_limits(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),monthly_limit integer NOT NULL DEFAULT 1000 CHECK(monthly_limit BETWEEN 0 AND 1000000)
);
CREATE TABLE saas.native_marketing_templates(
 store_id uuid NOT NULL REFERENCES saas.stores(id),template_id text NOT NULL CHECK(template_id IN('cart','new_products','offer','welcome')),
 content jsonb NOT NULL,version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),updated_at timestamptz NOT NULL,PRIMARY KEY(store_id,template_id)
);
CREATE TABLE saas.native_marketing_campaigns(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 template_id text NOT NULL CHECK(template_id IN('cart','new_products','offer','welcome')),template_snapshot jsonb NOT NULL,branding_snapshot jsonb NOT NULL,items_snapshot jsonb NOT NULL,
 product_ids uuid[] NOT NULL DEFAULT '{}',scheduled_at timestamptz NOT NULL,status text NOT NULL CHECK(status IN('scheduled','queued','sending','completed','cancelled')),
 is_test boolean NOT NULL DEFAULT false,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),created_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,UNIQUE(store_id,id),FOREIGN KEY(store_id,created_by_membership_id) REFERENCES saas.memberships(store_id,id),
 CHECK(cardinality(product_ids)<=8 AND jsonb_typeof(items_snapshot)='array' AND jsonb_array_length(items_snapshot)<=8)
);
CREATE TABLE saas.native_marketing_deliveries(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),campaign_id uuid,episode_id uuid,cart_id uuid,reminder_number integer,
 recipient text NOT NULL CHECK(recipient=lower(btrim(recipient)) AND length(recipient) BETWEEN 3 AND 254 AND recipient!~'[[:space:][:cntrl:]]'),
 projection jsonb NOT NULL,product_ids uuid[] NOT NULL DEFAULT '{}',variant_ids uuid[] NOT NULL DEFAULT '{}',is_test boolean NOT NULL DEFAULT false,
 quota_period timestamptz NOT NULL,status text NOT NULL CHECK(status IN('pending','leased','retry','uncertain','accepted','delivered','delayed','failed','bounced','complained','suppressed','cancelled')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),next_attempt_at timestamptz NOT NULL,
 lease_id uuid,lease_owner text,lease_expires_at timestamptz,first_attempt_at timestamptz,idempotency_expires_at timestamptz,
 seal_key_id text,sealed_request bytea,request_digest char(64),unsubscribe_token_digest char(64),provider_message_id text,last_error_code text,provider_event_at timestamptz,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,UNIQUE(store_id,id),UNIQUE(store_id,campaign_id,recipient),UNIQUE(store_id,episode_id,reminder_number),UNIQUE(provider_message_id),
 FOREIGN KEY(store_id,campaign_id) REFERENCES saas.native_marketing_campaigns(store_id,id),FOREIGN KEY(store_id,episode_id) REFERENCES saas.abandoned_cart_episodes(store_id,id),FOREIGN KEY(store_id,cart_id) REFERENCES saas.abandoned_carts(store_id,id),
 CHECK((campaign_id IS NOT NULL AND episode_id IS NULL AND cart_id IS NULL AND reminder_number IS NULL) OR(campaign_id IS NULL AND episode_id IS NOT NULL AND cart_id IS NOT NULL AND reminder_number IN(1,2))),
 CHECK(jsonb_typeof(projection)='object' AND pg_column_size(projection)<=65536),
 CHECK((sealed_request IS NULL AND seal_key_id IS NULL AND request_digest IS NULL AND first_attempt_at IS NULL AND idempotency_expires_at IS NULL AND unsubscribe_token_digest IS NULL)
 OR(sealed_request IS NOT NULL AND octet_length(sealed_request) BETWEEN 29 AND 262144 AND seal_key_id~'^[a-z][a-z0-9_-]{2,31}$' AND request_digest~'^[a-f0-9]{64}$' AND unsubscribe_token_digest~'^[a-f0-9]{64}$' AND first_attempt_at IS NOT NULL AND idempotency_expires_at=first_attempt_at+interval '24 hours')),
 CHECK((lease_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL) OR(lease_id IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX native_marketing_work_idx ON saas.native_marketing_deliveries(next_attempt_at,store_id,id) WHERE status IN('pending','retry','uncertain','leased');
CREATE INDEX native_marketing_quota_idx ON saas.native_marketing_deliveries(store_id,quota_period,status);
CREATE UNIQUE INDEX native_marketing_unsubscribe_token_idx ON saas.native_marketing_deliveries(unsubscribe_token_digest) WHERE unsubscribe_token_digest IS NOT NULL;
CREATE TABLE saas.native_marketing_operations(operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),principal_id uuid NOT NULL REFERENCES saas.principals(id),membership_id uuid NOT NULL,action text NOT NULL,fingerprint char(64) NOT NULL,result_payload jsonb NOT NULL,created_at timestamptz NOT NULL,FOREIGN KEY(store_id,membership_id) REFERENCES saas.memberships(store_id,id));
CREATE TABLE saas.native_marketing_suppressions(store_id uuid NOT NULL REFERENCES saas.stores(id),email text NOT NULL,reason text NOT NULL CHECK(reason IN('unsubscribe','bounced','complained','suppressed')),created_at timestamptz NOT NULL,PRIMARY KEY(store_id,email));
CREATE TABLE saas.native_marketing_provider_events(event_id text PRIMARY KEY,delivery_id uuid NOT NULL REFERENCES saas.native_marketing_deliveries(id),event_type text NOT NULL,occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL);
CREATE TABLE saas.native_marketing_sender_budget(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),daily_limit integer NOT NULL DEFAULT 90 CHECK(daily_limit BETWEEN 0 AND 1000000),monthly_limit integer NOT NULL DEFAULT 2900 CHECK(monthly_limit BETWEEN 0 AND 10000000),blocked_until timestamptz,blocked_reason text);
INSERT INTO saas.native_marketing_sender_budget(singleton) VALUES(true);
CREATE TABLE saas.native_marketing_sender_attempts(delivery_id uuid NOT NULL REFERENCES saas.native_marketing_deliveries(id),lease_id uuid NOT NULL,reserved_at timestamptz NOT NULL,lease_expires_at timestamptz NOT NULL,dispatched_at timestamptz,PRIMARY KEY(delivery_id,lease_id));
CREATE INDEX native_marketing_sender_attempt_period_idx ON saas.native_marketing_sender_attempts(reserved_at);

ALTER TABLE saas.abandoned_cart_recovery_tokens ALTER COLUMN created_by_membership_id DROP NOT NULL;
ALTER TABLE saas.abandoned_cart_recovery_tokens ADD COLUMN issued_by_delivery_id uuid;
ALTER TABLE saas.abandoned_cart_recovery_tokens ADD CONSTRAINT abandoned_cart_recovery_tokens_delivery_store_fk FOREIGN KEY(store_id,issued_by_delivery_id) REFERENCES saas.native_marketing_deliveries(store_id,id);
ALTER TABLE saas.abandoned_cart_recovery_tokens ADD CONSTRAINT abandoned_cart_recovery_tokens_exact_issuer CHECK((created_by_membership_id IS NOT NULL)::integer+(issued_by_delivery_id IS NOT NULL)::integer=1);

CREATE FUNCTION saas.native_marketing_content_valid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_typeof(p)='object' AND saas.campaign_starter_exact_keys(p,ARRAY['subject','heading','body','buttonLabel','buttonPath'])
 AND jsonb_typeof(p->'subject')='string' AND length(p->>'subject') BETWEEN 1 AND 200 AND p->>'subject'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'heading')='string' AND length(p->>'heading') BETWEEN 1 AND 160 AND p->>'heading'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'body')='string' AND length(p->>'body') BETWEEN 1 AND 4000 AND p->>'body'!~'[\x00-\x09\x0b-\x1f\x7f]'
 AND jsonb_typeof(p->'buttonLabel')='string' AND length(p->>'buttonLabel') BETWEEN 1 AND 80 AND p->>'buttonLabel'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'buttonPath')='string' AND length(p->>'buttonPath') BETWEEN 1 AND 500 AND p->>'buttonPath'~'^/($|[^/])' AND p->>'buttonPath'!~'[[:space:][:cntrl:]\\]',false)
$f$;
ALTER TABLE saas.native_marketing_templates ADD CONSTRAINT native_marketing_template_content_valid CHECK(saas.native_marketing_content_valid(content));
CREATE FUNCTION saas.native_marketing_template(p_store uuid,p_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce((SELECT content||jsonb_build_object('id',template_id,'version',version) FROM saas.native_marketing_templates WHERE store_id=p_store AND template_id=p_id),
 CASE p_id
 WHEN 'cart' THEN '{"id":"cart","subject":"Sepetiniz sizi bekliyor","heading":"Beğendikleriniz burada","body":"Sepetinizdeki ürünleri sizin için bir araya getirdik. Alışverişinize kaldığınız yerden devam edebilirsiniz.","buttonLabel":"Sepetime dön","buttonPath":"/cart","version":1}'::jsonb
 WHEN 'new_products' THEN '{"id":"new_products","subject":"Yeni gelenleri keşfedin","heading":"Yeni favorilerinizle tanışın","body":"Koleksiyonumuza yeni eklenen ürünleri sizin için seçtik. Ayrıntıları mağazamızda inceleyebilirsiniz.","buttonLabel":"Yeni ürünleri keşfet","buttonPath":"/products","version":1}'::jsonb
 WHEN 'offer' THEN '{"id":"offer","subject":"Size özel bir haberimiz var","heading":"Seçtiklerinize yeniden bakın","body":"Mağazamızdan sizinle paylaşmak istediğimiz bir haber var. Güncel ürünleri ve teklifleri mağazamızda bulabilirsiniz.","buttonLabel":"Mağazayı ziyaret et","buttonPath":"/","version":1}'::jsonb
 WHEN 'welcome' THEN '{"id":"welcome","subject":"Aramıza hoş geldiniz","heading":"Sizi burada görmek güzel","body":"Mağazamızdan haber almak istediğiniz için teşekkür ederiz. Yeni ürünleri ve size uygun haberleri burada paylaşacağız.","buttonLabel":"Mağazayı keşfet","buttonPath":"/","version":1}'::jsonb END)
$f$;
CREATE FUNCTION saas.native_marketing_settings_json(p_store uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('enabled',coalesce(s.enabled,true),'cartReminderEnabled',coalesce(s.cart_reminder_enabled,false),'secondCartReminderEnabled',coalesce(s.second_cart_reminder_enabled,false),'firstDelayMinutes',60,'secondDelayMinutes',1440,'version',coalesce(s.version,0)) FROM(SELECT 1) x LEFT JOIN saas.native_marketing_settings s ON s.store_id=p_store
$f$;
CREATE FUNCTION saas.native_marketing_branding(p_store uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('storeName',coalesce(nullif(general.config->>'storeDisplayName',''),s.name),'accentColor',CASE WHEN d.published_config->'brand'->>'primaryColor'~'^#[a-fA-F0-9]{6}$' THEN d.published_config->'brand'->>'primaryColor' ELSE '#292524' END,'logoUrl',coalesce(CASE WHEN d.published_version>1 THEN saas.storefront_design_public_media(p_store,d.published_config->'brand'->'logo')->>'url' END,saas.public_storefront_asset(p_store,'logo',jsonb_build_object('assetId',theme.config->>'logoAssetId'))->>'url'),'storeUrl','https://'||domain.hostname,'supportUrl','https://'||domain.hostname||'/contact'))
 FROM saas.stores s JOIN LATERAL(SELECT hostname FROM saas.store_domains WHERE store_id=s.id AND status='active' AND is_primary AND saas.public_storefront_authorized(s.id,hostname,p_now) ORDER BY updated_at DESC,id LIMIT 1) domain ON true
 LEFT JOIN saas.storefront_designs d ON d.store_id=s.id
 LEFT JOIN LATERAL(SELECT config FROM saas.merchant_admin_records WHERE store_id=s.id AND record_kind='general_setting' AND status='active' ORDER BY updated_at DESC,id DESC LIMIT 1) general ON true
 LEFT JOIN LATERAL(SELECT config FROM saas.merchant_admin_records WHERE store_id=s.id AND record_kind='theme_setting' AND status='active' ORDER BY updated_at DESC,id DESC LIMIT 1) theme ON true WHERE s.id=p_store AND s.status='active'
$f$;
CREATE FUNCTION saas.native_marketing_audience(p_store uuid) RETURNS TABLE(email text,first_name text,last_name text,eligible boolean,reason text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH current AS(SELECT DISTINCT ON(lower(a.email)) lower(a.email) email,a.kind,a.consented_at,a.evidence_version,a.first_name,a.last_name FROM saas.email_marketing_proven_audience a WHERE a.store_id=p_store ORDER BY lower(a.email),a.effective_at DESC,(a.kind='deny') DESC,(a.kind<>'grant') DESC,a.sequence DESC NULLS LAST)
 SELECT c.email,c.first_name,c.last_name,(c.kind='grant' AND c.consented_at IS NOT NULL AND c.evidence_version IS NOT NULL AND x.email IS NULL),CASE WHEN x.email IS NOT NULL THEN 'suppressed' WHEN c.kind<>'grant' THEN 'consent_denied' WHEN c.consented_at IS NULL OR c.evidence_version IS NULL THEN 'consent_unproven' ELSE 'eligible' END FROM current c LEFT JOIN saas.native_marketing_suppressions x ON x.store_id=p_store AND x.email=c.email
$f$;
CREATE FUNCTION saas.native_marketing_quota(p_store uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH q AS(SELECT coalesce((SELECT monthly_limit FROM saas.native_marketing_store_limits WHERE store_id=p_store),1000) lim,count(*) FILTER(WHERE status NOT IN('pending','leased','retry','uncertain') AND sealed_request IS NOT NULL) used,count(*) FILTER(WHERE status IN('pending','leased','retry','uncertain')) reserved FROM saas.native_marketing_deliveries WHERE store_id=p_store AND quota_period=date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
 SELECT jsonb_build_object('limit',lim,'used',used,'reserved',reserved,'remaining',greatest(0,lim-used-reserved),'periodEndsAt',saas.catalog_admin_timestamp((date_trunc('month',p_now AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC')) FROM q
$f$;
CREATE FUNCTION saas.native_marketing_product_items(p_store uuid,p_ids uuid[],p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('productId',p.id,'productName',p.title,'url',b->>'storeUrl'||'/products/'||p.slug,'imageUrl',media.public_url,'quantity',1,'unitPriceCents',price.price_cents,'currency',p.currency)) ORDER BY ids.position),'[]'::jsonb)
 FROM unnest(p_ids) WITH ORDINALITY ids(id,position) JOIN saas.products p ON p.store_id=p_store AND p.id=ids.id AND p.status='active'
 JOIN LATERAL(SELECT v.id,pr.price_cents FROM saas.product_variants v JOIN LATERAL saas.resolve_effective_variant_price(p_store,v.id,'storefront',p_now,NULL) pr ON pr.outcome='found' WHERE v.store_id=p_store AND v.product_id=p.id AND v.status='active' AND(NOT v.stock_tracking OR saas.storefront_available_stock(p_store,v.id,p_now,NULL)>0) ORDER BY v.id LIMIT 1) price ON true
 LEFT JOIN LATERAL(SELECT public_url FROM saas.product_media WHERE store_id=p_store AND product_id=p.id AND status='active' ORDER BY sort_order,id LIMIT 1) media ON true CROSS JOIN LATERAL(SELECT saas.native_marketing_branding(p_store,p_now) b) brand
$f$;
CREATE FUNCTION saas.native_marketing_projection(p_brand jsonb,p_template jsonb,p_items jsonb,p_email text,p_name text,p_cart boolean,p_test boolean) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('recipient',p_email,'recipientName',nullif(btrim(p_name),''),'senderLabel',p_brand->>'storeName','storeName',p_brand->>'storeName','primaryColor',p_brand->>'accentColor','logoUrl',p_brand->'logoUrl','storefrontOrigin',p_brand->>'storeUrl','supportUrl',p_brand->>'supportUrl','postalAddress',p_brand->'postalAddress','template',p_template,'items',p_items,'recoveryNeeded',p_cart,'isTest',p_test))
$f$;
CREATE FUNCTION saas.native_marketing_campaign_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',c.id,'name',c.name,'templateId',c.template_id,'status',CASE WHEN c.status='cancelled' THEN 'cancelled' WHEN count(d.id) FILTER(WHERE d.status IN('pending','leased','retry','uncertain'))=0 THEN 'completed' WHEN count(d.id) FILTER(WHERE d.attempt_count>0)>0 THEN 'sending' ELSE c.status END,'scheduledAt',saas.catalog_admin_timestamp(c.scheduled_at),'recipientCount',count(d.id),'sentCount',count(d.id) FILTER(WHERE d.status IN('accepted','delivered','delayed')),'failedCount',count(d.id) FILTER(WHERE d.status IN('failed','bounced','complained','suppressed')),'version',c.version,'isTest',c.is_test) FROM saas.native_marketing_campaigns c LEFT JOIN saas.native_marketing_deliveries d ON d.store_id=c.store_id AND d.campaign_id=c.id WHERE c.id=p_id GROUP BY c.id
$f$;
CREATE FUNCTION saas.native_marketing_command(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_action text,p_input jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;v jsonb;op saas.native_marketing_operations%ROWTYPE;sid uuid;oid uuid;fp text;brand jsonb;tmpl jsonb;items jsonb;ids uuid[];cfg saas.native_marketing_settings%ROWTYPE;c saas.native_marketing_campaigns%ROWTYPE;payload jsonb;recipient_count integer;quota jsonb;t timestamptz;test boolean;old_version bigint;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_action IS NULL OR p_action NOT IN('overview','products','preview','settings','template','queue','test','cancel') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR pg_column_size(p_input)>16384 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 err:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_code,p_version,p_now,'integrations',CASE WHEN p_action IN('overview','products','preview') THEN 'integrations.read' ELSE 'integrations.manage' END);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.commercial_plan_has_capability(p_plan,'email_marketing') THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 brand:=saas.native_marketing_branding(p_store,p_now);IF brand IS NULL THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb;RETURN;END IF;
 IF p_action='overview' THEN
 RETURN QUERY SELECT 'found',jsonb_build_object('settings',saas.native_marketing_settings_json(p_store),'branding',brand,'quota',saas.native_marketing_quota(p_store,p_now),'eligibleRecipientCount',(SELECT count(*) FROM saas.native_marketing_audience(p_store) WHERE eligible),'skippedReasonCounts',coalesce((SELECT jsonb_object_agg(reason,n) FROM(SELECT reason,count(*) n FROM saas.native_marketing_audience(p_store) WHERE NOT eligible GROUP BY reason) x),'{}'::jsonb),'templates',(SELECT jsonb_agg(saas.native_marketing_template(p_store,id)) FROM unnest(ARRAY['cart','new_products','offer','welcome']) id),'campaigns',coalesce((SELECT jsonb_agg(saas.native_marketing_campaign_json(id) ORDER BY created_at DESC,id) FROM(SELECT id,created_at FROM saas.native_marketing_campaigns WHERE store_id=p_store ORDER BY created_at DESC,id LIMIT 100) c),'[]'::jsonb),'summary',(SELECT jsonb_build_object('queued',count(*) FILTER(WHERE status IN('pending','leased','retry','uncertain')),'sent',count(*) FILTER(WHERE status IN('accepted','delivered','delayed')),'failed',count(*) FILTER(WHERE status IN('failed','bounced','complained')),'suppressed',count(*) FILTER(WHERE status='suppressed')) FROM saas.native_marketing_deliveries WHERE store_id=p_store));RETURN;
 ELSIF p_action='products' THEN
 IF NOT saas.campaign_starter_exact_keys(p_input,ARRAY['query','limit']) OR jsonb_typeof(p_input->'query')<>'string' OR length(p_input->>'query')>100 OR(p_input->>'limit')!~'^[0-9]{1,2}$' OR(p_input->>'limit')::integer NOT BETWEEN 1 AND 20 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT array_agg(id ORDER BY title,id) INTO ids FROM(SELECT id,title FROM saas.products WHERE store_id=p_store AND status='active' AND(position(lower(p_input->>'query') IN lower(title))>0 OR p_input->>'query'='') ORDER BY title,id LIMIT(p_input->>'limit')::integer) p;
 items:=saas.native_marketing_product_items(p_store,coalesce(ids,'{}'),p_now);
 RETURN QUERY SELECT 'found',jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',x->'productId','title',x->'productName','url',x->'url','imageUrl',x->'imageUrl','priceCents',x->'unitPriceCents','currency',x->'currency'))) FROM jsonb_array_elements(items) x),'[]'::jsonb));RETURN;
 END IF;
 IF p_action='preview' THEN v:=p_input;ELSE
 IF NOT saas.campaign_starter_exact_keys(p_input,ARRAY['operationId','fingerprint','value']) OR(p_input->>'fingerprint')!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 oid:=(p_input->>'operationId')::uuid;fp:=p_input->>'fingerprint';v:=p_input->'value';IF oid IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.operation:'||oid::text,0));SELECT * INTO op FROM saas.native_marketing_operations WHERE operation_id=oid;
 IF FOUND THEN IF(op.store_id,op.principal_id,op.membership_id,op.action,op.fingerprint) IS DISTINCT FROM(p_store,p_principal,p_membership,p_action,fp) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload;END IF;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.store:'||p_store::text,0));
 END IF;
 IF p_action='settings' THEN
 IF NOT saas.campaign_starter_exact_keys(v,ARRAY['expectedVersion','enabled','cartReminderEnabled','secondCartReminderEnabled']) OR jsonb_typeof(v->'enabled')<>'boolean' OR jsonb_typeof(v->'cartReminderEnabled')<>'boolean' OR jsonb_typeof(v->'secondCartReminderEnabled')<>'boolean' OR(v->>'expectedVersion')!~'^[0-9]{1,16}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO cfg FROM saas.native_marketing_settings WHERE store_id=p_store FOR UPDATE;IF coalesce(cfg.version,0)<>(v->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.native_marketing_settings VALUES(p_store,(v->>'enabled')::boolean,(v->>'cartReminderEnabled')::boolean,(v->>'secondCartReminderEnabled')::boolean,1,p_now) ON CONFLICT(store_id) DO UPDATE SET enabled=excluded.enabled,cart_reminder_enabled=excluded.cart_reminder_enabled,second_cart_reminder_enabled=excluded.second_cart_reminder_enabled,version=saas.native_marketing_settings.version+1,updated_at=p_now;
 payload:=saas.native_marketing_settings_json(p_store);
 ELSIF p_action='template' THEN
 tmpl:=v->'template';IF NOT saas.campaign_starter_exact_keys(v,ARRAY['expectedVersion','template']) OR(v->>'expectedVersion')!~'^[0-9]{1,16}$' OR tmpl->>'id' NOT IN('cart','new_products','offer','welcome') OR NOT saas.native_marketing_content_valid(tmpl-'id'-'version') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO old_version FROM saas.native_marketing_templates WHERE store_id=p_store AND template_id=tmpl->>'id' FOR UPDATE;IF coalesce(old_version,1)<>(v->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.native_marketing_templates VALUES(p_store,tmpl->>'id',tmpl-'id'-'version',2,p_now) ON CONFLICT(store_id,template_id) DO UPDATE SET content=excluded.content,version=saas.native_marketing_templates.version+1,updated_at=p_now;payload:=saas.native_marketing_template(p_store,tmpl->>'id');
 ELSIF p_action='cancel' THEN
 IF NOT saas.campaign_starter_exact_keys(v,ARRAY['campaignId','expectedVersion']) OR(v->>'expectedVersion')!~'^[0-9]{1,16}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO c FROM saas.native_marketing_campaigns WHERE store_id=p_store AND id=(v->>'campaignId')::uuid FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;IF c.version<>(v->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 UPDATE saas.native_marketing_campaigns SET status='cancelled',version=version+1,updated_at=p_now WHERE id=c.id;
 UPDATE saas.native_marketing_deliveries SET status='cancelled',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE store_id=p_store AND campaign_id=c.id AND status IN('pending','retry','uncertain');payload:=saas.native_marketing_campaign_json(c.id);
 ELSE
 IF v->>'templateId' IS NULL OR v->>'templateId' NOT IN('cart','new_products','offer','welcome') OR jsonb_typeof(v->'productIds') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'productIds')>8 OR(v?'content' AND NOT saas.native_marketing_content_valid(v->'content')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(v) key WHERE key NOT IN('templateId','productIds','content','name','scheduledAt','recipient')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT coalesce(array_agg(x::uuid),'{}') INTO ids FROM jsonb_array_elements_text(v->'productIds') x;IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 tmpl:=saas.native_marketing_template(p_store,v->>'templateId');IF v?'content' THEN tmpl:=(v->'content')||jsonb_build_object('id',tmpl->'id','version',tmpl->'version');END IF;
 items:=saas.native_marketing_product_items(p_store,ids,p_now);IF jsonb_array_length(items)<>cardinality(ids) THEN RETURN QUERY SELECT 'product_unavailable',NULL::jsonb;RETURN;END IF;
 IF p_action='preview' THEN RETURN QUERY SELECT 'found',saas.native_marketing_projection(brand,tmpl,items,'preview@example.invalid',NULL,false,true);RETURN;END IF;
 test:=p_action='test';t:=coalesce((v->>'scheduledAt')::timestamptz,p_now);
 IF jsonb_typeof(v->'name')<>'string' OR length(v->>'name') NOT BETWEEN 1 AND 160 OR t IS NULL OR NOT isfinite(t) OR t<p_now-interval '1 second' OR t>p_now+interval '90 days' OR(test AND(v->>'recipient' IS NULL OR length(v->>'recipient')>254 OR v->>'recipient'!~'^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF coalesce((saas.native_marketing_settings_json(p_store)->>'enabled')::boolean,true)=false THEN RETURN QUERY SELECT 'disabled',NULL::jsonb;RETURN;END IF;
 IF test AND((SELECT count(*) FROM saas.native_marketing_deliveries WHERE store_id=p_store AND is_test AND created_at>p_now-interval '1 hour')>=5 OR EXISTS(SELECT 1 FROM saas.native_marketing_deliveries WHERE store_id=p_store AND is_test AND recipient=lower(v->>'recipient') AND created_at>p_now-interval '10 minutes')) THEN RETURN QUERY SELECT 'test_limit',NULL::jsonb;RETURN;END IF;
 IF test THEN recipient_count:=1;ELSE SELECT count(*) INTO recipient_count FROM saas.native_marketing_audience(p_store) WHERE eligible;END IF;
 IF recipient_count=0 THEN RETURN QUERY SELECT 'no_eligible_recipients',NULL::jsonb;RETURN;END IF;
 quota:=saas.native_marketing_quota(p_store,t);IF recipient_count>(quota->>'remaining')::integer THEN RETURN QUERY SELECT 'quota_exceeded',NULL::jsonb;RETURN;END IF;
 sid:=gen_random_uuid();INSERT INTO saas.native_marketing_campaigns(id,store_id,name,template_id,template_snapshot,branding_snapshot,items_snapshot,product_ids,scheduled_at,status,is_test,created_by_membership_id,created_at,updated_at) VALUES(sid,p_store,v->>'name',v->>'templateId',tmpl,brand,items,ids,t,CASE WHEN t>p_now THEN 'scheduled' ELSE 'queued' END,test,p_membership,p_now,p_now);
 INSERT INTO saas.native_marketing_deliveries(id,store_id,campaign_id,recipient,projection,product_ids,is_test,quota_period,status,next_attempt_at,created_at,updated_at)
 SELECT gen_random_uuid(),p_store,sid,a.email,saas.native_marketing_projection(brand,tmpl,items,a.email,concat_ws(' ',a.first_name,a.last_name),false,test),ids,test,date_trunc('month',t AT TIME ZONE 'UTC') AT TIME ZONE 'UTC','pending',t,p_now,p_now FROM(SELECT email,first_name,last_name FROM saas.native_marketing_audience(p_store) WHERE eligible AND NOT test UNION ALL SELECT lower(v->>'recipient'),NULL,NULL WHERE test) a;
 payload:=saas.native_marketing_campaign_json(sid);
 END IF;
 INSERT INTO saas.native_marketing_operations VALUES(oid,p_store,p_principal,p_membership,p_action,fp,payload,p_now);RETURN QUERY SELECT 'saved',payload;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;

CREATE FUNCTION saas.native_marketing_delivery_eligible(p_id uuid,p_now timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(s.status='active' AND coalesce(cfg.enabled,true) AND saas.commercial_plan_has_capability(saas.commercial_current_plan(d.store_id),'email_marketing')
 AND saas.native_marketing_branding(d.store_id,p_now)->>'storeUrl'=d.projection->>'storefrontOrigin'
 AND(c.id IS NULL OR c.status<>'cancelled') AND(d.is_test OR EXISTS(SELECT 1 FROM saas.native_marketing_audience(d.store_id) a WHERE a.email=d.recipient AND a.eligible))
 AND NOT EXISTS(SELECT 1 FROM saas.native_marketing_suppressions sup WHERE sup.store_id=d.store_id AND sup.email=d.recipient)
 AND NOT EXISTS(SELECT 1 FROM unnest(d.product_ids) pid WHERE NOT EXISTS(SELECT 1 FROM saas.products p JOIN saas.product_variants v ON v.store_id=p.store_id AND v.product_id=p.id AND v.status='active' JOIN LATERAL saas.resolve_effective_variant_price(p.store_id,v.id,'storefront',p_now,NULL) price ON price.outcome='found' WHERE p.store_id=d.store_id AND p.id=pid AND p.status='active' AND(NOT v.stock_tracking OR saas.storefront_available_stock(v.store_id,v.id,p_now,NULL)>0)))
 AND(d.episode_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.projection->'items') shown WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(saas.native_marketing_product_items(d.store_id,d.product_ids,p_now)) current WHERE current->>'productId'=shown->>'productId' AND current->>'unitPriceCents'=shown->>'unitPriceCents' AND current->>'currency'=shown->>'currency')))
 AND(d.episode_id IS NULL OR(cfg.cart_reminder_enabled AND(d.reminder_number=1 OR cfg.second_cart_reminder_enabled) AND ac.lifecycle_status='abandoned' AND ac.status<>'archived' AND ac.recovered_order_id IS NULL AND lower(ac.customer_email)=d.recipient AND ac.last_activity_at<=ep.abandoned_at AND ac.last_activity_at<=p_now-interval '1 hour' AND ep.closed_at IS NULL AND ep.resumed_at IS NULL AND ep.recovered_at IS NULL AND ep.linked_order_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM saas.abandoned_cart_episodes newer WHERE newer.store_id=d.store_id AND newer.cart_id=d.cart_id AND newer.episode_number>ep.episode_number)
 AND EXISTS(SELECT 1 FROM saas.storefront_carts sc WHERE sc.store_id=d.store_id AND sc.id=ac.source_cart_id AND sc.status='active' AND sc.expires_at>p_now)
 AND EXISTS(SELECT 1 FROM saas.storefront_cart_items ci WHERE ci.store_id=d.store_id AND ci.cart_id=ac.source_cart_id)
 AND NOT EXISTS(SELECT 1 FROM saas.storefront_checkout_start_snapshots cs WHERE cs.store_id=d.store_id AND cs.cart_id=ac.source_cart_id AND cs.started_at>p_now-interval '1 hour')
 AND NOT EXISTS(SELECT 1 FROM saas.orders o WHERE o.store_id=d.store_id AND lower(o.customer_email)=d.recipient AND o.created_at>=ep.candidate_at AND o.payment_status='completed')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.projection->'items') WITH ORDINALITY shown(item,position) WHERE NOT EXISTS(SELECT 1 FROM saas.product_variants v JOIN LATERAL saas.resolve_effective_variant_price(v.store_id,v.id,'storefront',p_now,NULL) price ON price.outcome='found' WHERE v.store_id=d.store_id AND v.id=d.variant_ids[shown.position] AND price.price_cents=(shown.item->>'unitPriceCents')::bigint))
 AND NOT EXISTS(SELECT 1 FROM unnest(d.variant_ids) vid WHERE NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items ci JOIN saas.product_variants v ON v.store_id=ci.store_id AND v.id=ci.variant_id AND v.status='active' WHERE ci.store_id=d.store_id AND ci.cart_id=ac.source_cart_id AND ci.variant_id=vid AND(NOT v.stock_tracking OR saas.storefront_available_stock(v.store_id,v.id,p_now,NULL)>=ci.quantity))))) ,false)
 FROM saas.native_marketing_deliveries d JOIN saas.stores s ON s.id=d.store_id LEFT JOIN saas.native_marketing_settings cfg ON cfg.store_id=d.store_id LEFT JOIN saas.native_marketing_campaigns c ON c.store_id=d.store_id AND c.id=d.campaign_id LEFT JOIN saas.abandoned_carts ac ON ac.store_id=d.store_id AND ac.id=d.cart_id LEFT JOIN saas.abandoned_cart_episodes ep ON ep.store_id=d.store_id AND ep.id=d.episode_id WHERE d.id=p_id
$f$;
CREATE INDEX native_marketing_cart_candidates_idx ON saas.abandoned_carts(store_id,last_activity_at,id) WHERE status<>'archived' AND lifecycle_status IN('active','resumed','candidate') AND recovered_order_id IS NULL AND source_cart_id IS NOT NULL;
-- Opting into the one-hour reminder supplies its own bounded lifecycle evaluation.
-- Existing analytics evaluation, admin issuance and public redemption stay intact.
CREATE FUNCTION saas.native_marketing_promote_carts(p_now timestamptz,p_stores uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE candidate record;cart saas.abandoned_carts%ROWTYPE;episode saas.abandoned_cart_episodes%ROWTYPE;eid uuid;number integer;BEGIN
 FOR candidate IN SELECT ac.store_id,ac.id,ac.source_cart_id FROM saas.native_marketing_settings cfg JOIN saas.abandoned_carts ac ON ac.store_id=cfg.store_id JOIN saas.storefront_carts source ON source.store_id=ac.store_id AND source.id=ac.source_cart_id
 WHERE cfg.enabled AND cfg.cart_reminder_enabled AND(p_stores IS NULL OR ac.store_id=ANY(p_stores)) AND ac.status<>'archived' AND ac.lifecycle_status IN('active','resumed','candidate') AND ac.recovered_order_id IS NULL AND ac.last_activity_at<=p_now-interval '1 hour' AND source.status='active' AND source.expires_at>p_now
 AND saas.commercial_plan_has_capability(saas.commercial_current_plan(ac.store_id),'email_marketing') AND EXISTS(SELECT 1 FROM saas.native_marketing_audience(ac.store_id) a WHERE a.email=lower(ac.customer_email) AND a.eligible)
 AND NOT EXISTS(SELECT 1 FROM saas.storefront_checkout_start_snapshots cs WHERE cs.store_id=ac.store_id AND cs.cart_id=ac.source_cart_id AND cs.started_at>p_now-interval '1 hour')
 AND NOT EXISTS(SELECT 1 FROM saas.orders o WHERE o.store_id=ac.store_id AND lower(o.customer_email)=lower(ac.customer_email) AND o.created_at>=ac.last_activity_at AND o.payment_status='completed')
 AND EXISTS(SELECT 1 FROM saas.storefront_cart_items ci JOIN saas.products p ON p.store_id=ci.store_id AND p.id=ci.product_id AND p.status='active' JOIN saas.product_variants v ON v.store_id=ci.store_id AND v.id=ci.variant_id AND v.status='active' JOIN LATERAL saas.resolve_effective_variant_price(ci.store_id,ci.variant_id,'storefront',p_now,NULL) price ON price.outcome='found' WHERE ci.store_id=ac.store_id AND ci.cart_id=ac.source_cart_id AND(NOT v.stock_tracking OR saas.storefront_available_stock(ci.store_id,ci.variant_id,p_now,NULL)>=ci.quantity))
 ORDER BY ac.last_activity_at,ac.store_id,ac.id LIMIT 100 FOR UPDATE OF source SKIP LOCKED
 LOOP
 SELECT * INTO cart FROM saas.abandoned_carts WHERE store_id=candidate.store_id AND id=candidate.id FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR cart.status='archived' OR cart.lifecycle_status NOT IN('active','resumed','candidate') OR cart.recovered_order_id IS NOT NULL OR cart.last_activity_at>p_now-interval '1 hour' OR NOT EXISTS(SELECT 1 FROM saas.native_marketing_audience(cart.store_id) a WHERE a.email=lower(cart.customer_email) AND a.eligible) OR EXISTS(SELECT 1 FROM saas.orders o WHERE o.store_id=cart.store_id AND lower(o.customer_email)=lower(cart.customer_email) AND o.created_at>=cart.last_activity_at AND o.payment_status='completed')
 OR NOT EXISTS(SELECT 1 FROM saas.storefront_carts sc WHERE sc.store_id=cart.store_id AND sc.id=cart.source_cart_id AND sc.status='active' AND sc.expires_at>p_now) OR EXISTS(SELECT 1 FROM saas.storefront_checkout_start_snapshots cs WHERE cs.store_id=cart.store_id AND cs.cart_id=cart.source_cart_id AND cs.started_at>p_now-interval '1 hour') THEN CONTINUE;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items ci JOIN saas.products p ON p.store_id=ci.store_id AND p.id=ci.product_id AND p.status='active' JOIN saas.product_variants v ON v.store_id=ci.store_id AND v.id=ci.variant_id AND v.status='active' JOIN LATERAL saas.resolve_effective_variant_price(ci.store_id,ci.variant_id,'storefront',p_now,NULL) price ON price.outcome='found' WHERE ci.store_id=cart.store_id AND ci.cart_id=cart.source_cart_id AND(NOT v.stock_tracking OR saas.storefront_available_stock(ci.store_id,ci.variant_id,p_now,NULL)>=ci.quantity)) THEN CONTINUE;END IF;
 SELECT * INTO episode FROM saas.abandoned_cart_episodes WHERE store_id=cart.store_id AND cart_id=cart.id AND closed_at IS NULL ORDER BY episode_number DESC LIMIT 1 FOR UPDATE;
 IF episode.id IS NOT NULL AND(episode.abandoned_at IS NOT NULL OR cart.last_activity_at>episode.candidate_at) THEN
 UPDATE saas.abandoned_cart_episodes SET closed_at=p_now,updated_at=p_now WHERE store_id=cart.store_id AND id=episode.id;episode.id:=NULL;
 END IF;
 IF episode.id IS NULL THEN
 SELECT coalesce(max(episode_number),0)+1 INTO number FROM saas.abandoned_cart_episodes WHERE store_id=cart.store_id AND cart_id=cart.id;IF number>10000 THEN CONTINUE;END IF;eid:=gen_random_uuid();
 INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,currency,value_minor,first_touch,last_touch,created_at,updated_at) VALUES(eid,cart.store_id,cart.id,number,p_now,cart.currency,cart.total_cents,jsonb_strip_nulls(jsonb_build_object('source',cart.first_touch_source,'medium',cart.first_touch_medium,'campaign',cart.first_touch_campaign,'device',cart.device_group)),jsonb_strip_nulls(jsonb_build_object('source',cart.last_touch_source,'medium',cart.last_touch_medium,'campaign',cart.last_touch_campaign,'device',cart.device_group)),p_now,p_now);
 INSERT INTO saas.abandoned_cart_episode_items(store_id,episode_id,product_id,variant_id,category_id,brand_id,product_name,quantity,line_total_minor,created_at)
 SELECT item.store_id,eid,item.product_id,item.variant_id,
 (SELECT rel.category_id FROM saas.catalog_product_categories rel JOIN saas.catalog_categories cat ON cat.store_id=rel.store_id AND cat.id=rel.category_id AND cat.status='active' WHERE rel.store_id=item.store_id AND rel.product_id=item.product_id ORDER BY rel.position,cat.depth DESC,cat.id LIMIT 1),
 (SELECT rel.resource_id FROM saas.catalog_admin_resource_products rel JOIN saas.catalog_admin_resources res ON res.store_id=rel.store_id AND res.id=rel.resource_id AND res.resource_kind='brand' AND res.status='active' WHERE rel.store_id=item.store_id AND rel.product_id=item.product_id ORDER BY rel.position,res.id LIMIT 1),item.product_name,item.quantity,item.line_total_cents,p_now
 FROM saas.abandoned_cart_items item WHERE item.store_id=cart.store_id AND item.cart_id=cart.id AND item.product_id IS NOT NULL AND item.variant_id IS NOT NULL;
 ELSE eid:=episode.id;END IF;
 UPDATE saas.abandoned_cart_episodes SET abandoned_at=p_now,updated_at=p_now WHERE store_id=cart.store_id AND id=eid;
 UPDATE saas.abandoned_carts SET lifecycle_status='abandoned',status='abandoned',candidate_at=coalesce(candidate_at,p_now),abandoned_at=p_now,version=version+1,updated_at=p_now WHERE store_id=cart.store_id AND id=cart.id;
 PERFORM saas.commerce_analytics_enqueue_cart_event(cart.store_id,cart.id,eid,'cart_abandoned','cart_abandoned:'||eid::text,cart.currency,cart.total_cents,p_now);
 END LOOP;
END $f$;
CREATE FUNCTION saas.native_marketing_enqueue_carts(p_now timestamptz,p_stores uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;brand jsonb;tmpl jsonb;items jsonb;ids uuid[];vids uuid[];BEGIN
 FOR r IN SELECT ac.*,ep.id episode_id,n.reminder_number FROM saas.native_marketing_settings cfg JOIN saas.abandoned_carts ac ON ac.store_id=cfg.store_id JOIN saas.abandoned_cart_episodes ep ON ep.store_id=ac.store_id AND ep.cart_id=ac.id CROSS JOIN generate_series(1,2) n(reminder_number)
 WHERE cfg.enabled AND cfg.cart_reminder_enabled AND(n.reminder_number=1 OR cfg.second_cart_reminder_enabled) AND(p_stores IS NULL OR ac.store_id=ANY(p_stores)) AND ac.lifecycle_status='abandoned' AND ac.status<>'archived' AND ac.recovered_order_id IS NULL AND ac.customer_email IS NOT NULL AND ep.closed_at IS NULL AND ep.resumed_at IS NULL AND ep.recovered_at IS NULL AND ep.linked_order_id IS NULL AND ep.abandoned_at IS NOT NULL
 AND p_now>=greatest(ep.abandoned_at,ac.last_activity_at+CASE WHEN n.reminder_number=1 THEN interval '1 hour' ELSE interval '24 hours' END)
 AND(n.reminder_number=1 OR EXISTS(SELECT 1 FROM saas.native_marketing_deliveries first WHERE first.store_id=ac.store_id AND first.episode_id=ep.id AND first.reminder_number=1 AND first.status IN('accepted','delivered','delayed') AND first.first_attempt_at<=p_now-interval '23 hours'))
 AND saas.commercial_plan_has_capability(saas.commercial_current_plan(ac.store_id),'email_marketing') AND EXISTS(SELECT 1 FROM saas.native_marketing_audience(ac.store_id) a WHERE a.email=lower(ac.customer_email) AND a.eligible)
 AND NOT EXISTS(SELECT 1 FROM saas.native_marketing_deliveries d WHERE d.store_id=ac.store_id AND d.episode_id=ep.id AND d.reminder_number=n.reminder_number)
 ORDER BY ac.last_activity_at,ac.store_id,ac.id,n.reminder_number LIMIT 100
 LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.store:'||r.store_id::text,0));
 IF(saas.native_marketing_quota(r.store_id,p_now)->>'remaining')::integer<1 THEN CONTINUE;END IF;
 brand:=saas.native_marketing_branding(r.store_id,p_now);IF brand IS NULL THEN CONTINUE;END IF;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('productId',p.id,'productName',p.title,'url',brand->>'storeUrl'||'/products/'||p.slug,'imageUrl',media.public_url,'quantity',ci.quantity,'unitPriceCents',price.price_cents,'currency',p.currency)) ORDER BY ci.position),'[]'::jsonb),array_agg(DISTINCT p.id),array_agg(ci.variant_id ORDER BY ci.position) INTO items,ids,vids
 FROM(SELECT * FROM saas.storefront_cart_items WHERE store_id=r.store_id AND cart_id=r.source_cart_id ORDER BY position LIMIT 8) ci JOIN saas.products p ON p.store_id=ci.store_id AND p.id=ci.product_id AND p.status='active' JOIN saas.product_variants v ON v.store_id=ci.store_id AND v.id=ci.variant_id AND v.status='active' JOIN LATERAL saas.resolve_effective_variant_price(ci.store_id,ci.variant_id,'storefront',p_now,NULL) price ON price.outcome='found' LEFT JOIN LATERAL(SELECT public_url FROM saas.product_media WHERE store_id=ci.store_id AND product_id=ci.product_id AND status='active' ORDER BY sort_order,id LIMIT 1) media ON true WHERE NOT v.stock_tracking OR saas.storefront_available_stock(ci.store_id,ci.variant_id,p_now,NULL)>=ci.quantity;
 IF jsonb_array_length(items)=0 THEN CONTINUE;END IF;
 tmpl:=saas.native_marketing_template(r.store_id,'cart');
 INSERT INTO saas.native_marketing_deliveries(id,store_id,episode_id,cart_id,reminder_number,recipient,projection,product_ids,variant_ids,quota_period,status,next_attempt_at,created_at,updated_at) VALUES(gen_random_uuid(),r.store_id,r.episode_id,r.id,r.reminder_number,lower(r.customer_email),saas.native_marketing_projection(brand,tmpl,items,lower(r.customer_email),r.customer_name,true,false),ids,vids,date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC','pending',p_now,p_now,p_now) ON CONFLICT(store_id,episode_id,reminder_number) DO NOTHING;
 END LOOP;
END $f$;
CREATE FUNCTION saas.native_marketing_sender_remaining(p_now timestamptz) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH periods AS(SELECT date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day_start,date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS month_start)
 SELECT CASE WHEN b.blocked_until>p_now THEN 0 ELSE greatest(0,least(b.daily_limit-(SELECT count(*) FROM saas.native_marketing_sender_attempts a WHERE a.reserved_at>=p.day_start AND a.reserved_at<p.day_start+interval '1 day' AND(a.dispatched_at IS NOT NULL OR a.lease_expires_at>p_now)),b.monthly_limit-(SELECT count(*) FROM saas.native_marketing_sender_attempts a WHERE a.reserved_at>=p.month_start AND a.reserved_at<(date_trunc('month',p_now AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC' AND(a.dispatched_at IS NOT NULL OR a.lease_expires_at>p_now))))::integer END FROM saas.native_marketing_sender_budget b CROSS JOIN periods p WHERE b.singleton
$f$;
-- Called only after the global claim lock, store lock and valid delivery lease.
-- An unused reservation can move across a UTC boundary; a dispatched attempt stays charged.
CREATE FUNCTION saas.native_marketing_sender_lease_ready(p_id uuid,p_lease uuid,p_now timestamptz,p_dispatch boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE a saas.native_marketing_sender_attempts%ROWTYPE;d saas.native_marketing_deliveries%ROWTYPE;b saas.native_marketing_sender_budget%ROWTYPE;next_time timestamptz;BEGIN
 SELECT * INTO a FROM saas.native_marketing_sender_attempts WHERE delivery_id=p_id AND lease_id=p_lease FOR UPDATE;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO b FROM saas.native_marketing_sender_budget WHERE singleton;
 IF b.blocked_until>p_now OR(date_trunc('day',a.reserved_at AT TIME ZONE 'UTC')<>date_trunc('day',p_now AT TIME ZONE 'UTC') AND saas.native_marketing_sender_remaining(p_now)<1) THEN
 next_time:=CASE WHEN(SELECT count(*) FROM saas.native_marketing_sender_attempts x WHERE x.reserved_at>=date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND x.reserved_at<(date_trunc('month',p_now AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC' AND(x.dispatched_at IS NOT NULL OR x.lease_expires_at>p_now))>=b.monthly_limit THEN(date_trunc('month',p_now AT TIME ZONE 'UTC')+interval '1 month 1 minute') AT TIME ZONE 'UTC' WHEN b.blocked_until>p_now THEN b.blocked_until ELSE(date_trunc('day',p_now AT TIME ZONE 'UTC')+interval '1 day 1 minute') AT TIME ZONE 'UTC' END;
 SELECT * INTO d FROM saas.native_marketing_deliveries WHERE id=p_id;
 UPDATE saas.native_marketing_deliveries SET status=CASE WHEN idempotency_expires_at IS NOT NULL AND idempotency_expires_at<=next_time THEN 'failed' ELSE 'retry' END,last_error_code='sender_budget_deferred',next_attempt_at=next_time,attempt_count=greatest(0,attempt_count-CASE WHEN a.dispatched_at IS NULL THEN 1 ELSE 0 END),lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE id=p_id;
 DELETE FROM saas.native_marketing_sender_attempts WHERE delivery_id=p_id AND lease_id=p_lease AND dispatched_at IS NULL;RETURN false;
 END IF;
 IF a.dispatched_at IS NULL THEN UPDATE saas.native_marketing_sender_attempts SET reserved_at=p_now,dispatched_at=CASE WHEN p_dispatch THEN p_now END WHERE delivery_id=p_id AND lease_id=p_lease;END IF;
 RETURN true;
END $f$;
CREATE FUNCTION saas.native_marketing_work_claim(p_worker text,p_now timestamptz,p_expires timestamptz,p_limit integer,p_lease uuid,p_stores uuid[],p_test_only boolean) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE batch jsonb;capacity integer;BEGIN
 IF p_worker IS NULL OR p_worker!~'^[A-Za-z0-9._-]{1,128}$' OR p_now IS NULL OR NOT isfinite(p_now) OR p_expires IS NULL OR NOT isfinite(p_expires) OR p_expires<=p_now OR p_expires>p_now+interval '15 minutes' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_lease IS NULL OR p_test_only IS NULL OR(p_stores IS NOT NULL AND cardinality(p_stores) NOT BETWEEN 1 AND 1000) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.claim',0));
 capacity:=least(p_limit,saas.native_marketing_sender_remaining(p_now));IF capacity<1 THEN RETURN QUERY SELECT 'empty',jsonb_build_object('items','[]'::jsonb);RETURN;END IF;
 IF NOT p_test_only THEN PERFORM saas.native_marketing_promote_carts(p_now,p_stores);PERFORM saas.native_marketing_enqueue_carts(p_now,p_stores);END IF;
 UPDATE saas.native_marketing_deliveries SET status='failed',last_error_code=CASE WHEN idempotency_expires_at<=p_now THEN 'idempotency_expired' ELSE 'attempt_limit' END,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE status IN('pending','retry','uncertain','leased') AND(p_stores IS NULL OR store_id=ANY(p_stores)) AND(NOT p_test_only OR is_test) AND(attempt_count>=8 OR idempotency_expires_at<=p_now) AND(lease_expires_at IS NULL OR lease_expires_at<=p_now);
 WITH candidates AS(SELECT DISTINCT ON(d.store_id) d.id,d.store_id,d.next_attempt_at FROM saas.native_marketing_deliveries d WHERE d.status IN('pending','retry','uncertain','leased') AND d.next_attempt_at<=p_now AND(d.lease_expires_at IS NULL OR d.lease_expires_at<=p_now) AND d.attempt_count<8 AND(d.idempotency_expires_at IS NULL OR d.idempotency_expires_at>p_now) AND(p_stores IS NULL OR d.store_id=ANY(p_stores)) AND(NOT p_test_only OR d.is_test) AND NOT EXISTS(SELECT 1 FROM saas.native_marketing_deliveries active WHERE active.store_id=d.store_id AND active.status='leased' AND active.lease_expires_at>p_now) ORDER BY d.store_id,d.next_attempt_at,d.created_at,d.id),selected AS(SELECT d.id FROM saas.native_marketing_deliveries d JOIN candidates c ON c.id=d.id ORDER BY c.next_attempt_at,d.store_id,d.id LIMIT capacity FOR UPDATE OF d SKIP LOCKED),updated AS(UPDATE saas.native_marketing_deliveries d SET status='leased',attempt_count=d.attempt_count+1,lease_id=p_lease,lease_owner=p_worker,lease_expires_at=p_expires,updated_at=p_now FROM selected WHERE d.id=selected.id RETURNING d.*),reserved AS(INSERT INTO saas.native_marketing_sender_attempts(delivery_id,lease_id,reserved_at,lease_expires_at) SELECT id,p_lease,p_now,p_expires FROM updated RETURNING delivery_id)
 SELECT jsonb_agg(jsonb_build_object('deliveryId',id,'storeId',store_id,'attemptCount',attempt_count,'idempotencyKey','native-marketing/v1/'||id::text,'firstAttemptAt',CASE WHEN first_attempt_at IS NULL THEN NULL ELSE saas.catalog_admin_timestamp(first_attempt_at) END,'idempotencyExpiresAt',CASE WHEN idempotency_expires_at IS NULL THEN NULL ELSE saas.catalog_admin_timestamp(idempotency_expires_at) END,'sealKeyId',seal_key_id,'sealedRequest',CASE WHEN sealed_request IS NULL THEN NULL ELSE replace(encode(sealed_request,'base64'),E'\n','') END,'requestDigest',request_digest,'projection',CASE WHEN sealed_request IS NULL THEN projection ELSE NULL END) ORDER BY next_attempt_at,store_id,id) INTO batch FROM updated JOIN reserved ON reserved.delivery_id=updated.id;
 RETURN QUERY SELECT CASE WHEN batch IS NULL THEN 'empty' ELSE 'claimed' END,jsonb_build_object('items',coalesce(batch,'[]'::jsonb));
END $f$;
CREATE FUNCTION saas.native_marketing_work_authorize(p_id uuid,p_lease uuid,p_worker text,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.native_marketing_deliveries%ROWTYPE;sid uuid;period timestamptz;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.claim',0));
 SELECT store_id INTO sid FROM saas.native_marketing_deliveries WHERE id=p_id;
 IF sid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.store:'||sid::text,0));END IF;
 SELECT * INTO d FROM saas.native_marketing_deliveries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.status<>'leased' OR d.lease_id IS DISTINCT FROM p_lease OR d.lease_owner IS DISTINCT FROM p_worker OR d.lease_expires_at<=p_now THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb;RETURN;END IF;
 IF NOT saas.native_marketing_sender_lease_ready(p_id,p_lease,p_now,false) THEN RETURN QUERY SELECT 'deferred',NULL::jsonb;RETURN;END IF;
 period:=date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF d.sealed_request IS NULL AND d.quota_period<>period THEN
 IF(saas.native_marketing_quota(d.store_id,p_now)->>'remaining')::integer<1 THEN UPDATE saas.native_marketing_deliveries SET status='suppressed',last_error_code='quota_exceeded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE id=d.id;RETURN QUERY SELECT 'suppressed',NULL::jsonb;RETURN;END IF;
 UPDATE saas.native_marketing_deliveries SET quota_period=period WHERE id=d.id;
 END IF;
 IF(d.idempotency_expires_at IS NOT NULL AND d.idempotency_expires_at<=p_now) OR NOT saas.native_marketing_delivery_eligible(d.id,p_now) THEN UPDATE saas.native_marketing_deliveries SET status='suppressed',last_error_code='eligibility_changed',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE id=d.id;DELETE FROM saas.native_marketing_sender_attempts WHERE delivery_id=p_id AND lease_id=p_lease AND dispatched_at IS NULL;RETURN QUERY SELECT 'suppressed',NULL::jsonb;ELSE PERFORM saas.native_marketing_sender_lease_ready(p_id,p_lease,p_now,d.sealed_request IS NOT NULL);RETURN QUERY SELECT 'authorized',NULL::jsonb;END IF;
END $f$;
CREATE FUNCTION saas.native_marketing_work_seal(p_id uuid,p_lease uuid,p_worker text,p_now timestamptz,p_key text,p_bytes bytea,p_digest text,p_unsubscribe text,p_recovery text,p_first timestamptz,p_expiry timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.native_marketing_deliveries%ROWTYPE;ac saas.abandoned_carts%ROWTYPE;h text;sid uuid;period timestamptz;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.claim',0));
 SELECT store_id INTO sid FROM saas.native_marketing_deliveries WHERE id=p_id;
 IF sid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.store:'||sid::text,0));END IF;
 SELECT * INTO d FROM saas.native_marketing_deliveries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.status<>'leased' OR d.lease_id IS DISTINCT FROM p_lease OR d.lease_owner IS DISTINCT FROM p_worker OR d.lease_expires_at<=p_now THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb;RETURN;END IF;
 IF NOT saas.native_marketing_sender_lease_ready(p_id,p_lease,p_now,false) THEN RETURN QUERY SELECT 'deferred',NULL::jsonb;RETURN;END IF;
 IF d.sealed_request IS NOT NULL THEN IF(d.seal_key_id,d.sealed_request,d.request_digest,d.unsubscribe_token_digest) IS DISTINCT FROM(p_key,p_bytes,p_digest,p_unsubscribe) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'sealed',NULL::jsonb;END IF;RETURN;END IF;
 IF NOT saas.native_marketing_delivery_eligible(d.id,p_now) THEN RETURN QUERY SELECT 'eligibility_changed',NULL::jsonb;RETURN;END IF;
 period:=date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF d.quota_period<>period THEN
 IF(saas.native_marketing_quota(d.store_id,p_now)->>'remaining')::integer<1 THEN RETURN QUERY SELECT 'quota_exceeded',NULL::jsonb;RETURN;END IF;
 UPDATE saas.native_marketing_deliveries SET quota_period=period WHERE id=d.id;
 END IF;
 IF p_key IS NULL OR p_key!~'^[a-z][a-z0-9_-]{2,31}$' OR p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 29 AND 262144 OR p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$' OR p_unsubscribe IS NULL OR p_unsubscribe!~'^[a-f0-9]{64}$' OR p_first IS NULL OR NOT isfinite(p_first) OR p_first>p_now OR p_first<p_now-interval '15 minutes' OR p_expiry IS DISTINCT FROM p_first+interval '24 hours' OR(d.episode_id IS NOT NULL AND(p_recovery IS NULL OR p_recovery!~'^[a-f0-9]{64}$')) OR(d.episode_id IS NULL AND p_recovery IS NOT NULL) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF d.episode_id IS NOT NULL THEN
 SELECT * INTO ac FROM saas.abandoned_carts WHERE store_id=d.store_id AND id=d.cart_id FOR UPDATE;h:=substring(d.projection->>'storefrontOrigin' FROM 9);
 INSERT INTO saas.abandoned_cart_recovery_tokens(id,store_id,cart_id,episode_id,token_digest,key_version,hostname,expires_at,created_at,issued_by_delivery_id) VALUES(gen_random_uuid(),d.store_id,d.cart_id,d.episode_id,p_recovery,1,h,p_now+make_interval(hours=>(saas.commerce_analytics_settings_for_store(d.store_id,p_now)).recovery_link_hours),p_now,d.id);
 END IF;
 UPDATE saas.native_marketing_deliveries SET seal_key_id=p_key,sealed_request=p_bytes,request_digest=p_digest,unsubscribe_token_digest=p_unsubscribe,first_attempt_at=p_first,idempotency_expires_at=p_expiry,updated_at=p_now WHERE id=d.id;RETURN QUERY SELECT 'sealed',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.native_marketing_work_finish(p_id uuid,p_lease uuid,p_worker text,p_now timestamptz,p_kind text,p_value text,p_next timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.native_marketing_deliveries%ROWTYPE;new_status text;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.claim',0));
 SELECT * INTO d FROM saas.native_marketing_deliveries WHERE id=p_id FOR UPDATE;IF NOT FOUND OR d.status<>'leased' OR d.lease_id IS DISTINCT FROM p_lease OR d.lease_owner IS DISTINCT FROM p_worker OR d.lease_expires_at<=p_now THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb;RETURN;END IF;
 IF p_kind IS NULL OR p_kind NOT IN('accepted','retryable','permanent','uncertain') OR p_value IS NULL OR length(p_value) NOT BETWEEN 1 AND 200 OR(p_kind='accepted' AND d.sealed_request IS NULL) OR(p_kind<>'accepted' AND p_value!~'^[a-z][a-z0-9_]{0,63}$') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_kind IN('accepted','retryable','uncertain') OR p_value LIKE 'provider_%' THEN UPDATE saas.native_marketing_sender_attempts SET dispatched_at=coalesce(dispatched_at,p_now) WHERE delivery_id=p_id AND lease_id=p_lease;END IF;
 IF p_value IN('provider_daily_quota_exceeded','provider_monthly_quota_exceeded') THEN UPDATE saas.native_marketing_sender_budget SET blocked_until=greatest(coalesce(blocked_until,p_now),CASE WHEN p_value='provider_daily_quota_exceeded' THEN(date_trunc('day',p_now AT TIME ZONE 'UTC')+interval '1 day 1 minute') AT TIME ZONE 'UTC' ELSE(date_trunc('month',p_now AT TIME ZONE 'UTC')+interval '1 month 1 minute') AT TIME ZONE 'UTC' END),blocked_reason=p_value WHERE singleton;END IF;
 IF p_kind='accepted' THEN new_status:='accepted';ELSIF p_kind='permanent' OR d.attempt_count>=8 OR(d.idempotency_expires_at IS NOT NULL AND d.idempotency_expires_at<=p_now+interval '30 seconds') THEN new_status:='failed';ELSIF p_kind='uncertain' THEN new_status:='uncertain';ELSE new_status:='retry';END IF;
 IF p_next IS NOT NULL AND(NOT isfinite(p_next) OR p_next<p_now+interval '1 second' OR p_next>p_now+interval '24 hours') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 UPDATE saas.native_marketing_deliveries SET status=new_status,provider_message_id=CASE WHEN p_kind='accepted' THEN p_value ELSE provider_message_id END,last_error_code=CASE WHEN p_kind='accepted' THEN NULL ELSE p_value END,next_attempt_at=coalesce(p_next,p_now+interval '1 minute'),lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE id=d.id;RETURN QUERY SELECT 'finished',NULL::jsonb;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'provider_reference_conflict',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.native_marketing_unsubscribe(p_digest text,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.native_marketing_deliveries%ROWTYPE;BEGIN
 IF p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO d FROM saas.native_marketing_deliveries WHERE unsubscribe_token_digest=p_digest;
 IF FOUND THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.store:'||d.store_id::text,0));
 INSERT INTO saas.native_marketing_suppressions VALUES(d.store_id,d.recipient,'unsubscribe',p_now) ON CONFLICT DO NOTHING;
 PERFORM saas.email_marketing_append_event(d.store_id,d.recipient,'deny','provider','native-unsubscribe:'||d.id::text,'1',p_now,NULL,NULL);
 UPDATE saas.native_marketing_deliveries SET status='suppressed',last_error_code='unsubscribed',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE store_id=d.store_id AND recipient=d.recipient AND NOT is_test AND status IN('pending','retry','uncertain');
 END IF;
 RETURN QUERY SELECT 'unsubscribed',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.native_marketing_provider_event_record(p_event text,p_message text,p_type text,p_at timestamptz,p_received timestamptz,p_reason text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.native_marketing_deliveries%ROWTYPE;prior saas.native_marketing_provider_events%ROWTYPE;BEGIN
 IF p_event IS NULL OR length(p_event) NOT BETWEEN 1 AND 200 OR p_message IS NULL OR length(p_message) NOT BETWEEN 1 AND 200 OR p_type IS NULL OR p_type NOT IN('sent','delivered','delayed','failed','bounced','complained','suppressed') OR p_at IS NULL OR NOT isfinite(p_at) OR p_received IS NULL OR NOT isfinite(p_received) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native.marketing.event:'||p_event,0));SELECT * INTO prior FROM saas.native_marketing_provider_events WHERE event_id=p_event;IF FOUND THEN RETURN QUERY SELECT 'operation_replayed',NULL::jsonb;RETURN;END IF;
 SELECT * INTO d FROM saas.native_marketing_deliveries WHERE provider_message_id=p_message FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.native_marketing_provider_events VALUES(p_event,d.id,p_type,p_at,p_received);
 IF p_type IN('bounced','complained','suppressed') THEN
 INSERT INTO saas.native_marketing_suppressions VALUES(d.store_id,d.recipient,p_type,p_received) ON CONFLICT DO NOTHING;
 PERFORM saas.email_marketing_append_event(d.store_id,d.recipient,'deny','provider','native-event:'||p_event,'1',p_received,NULL,NULL);
 UPDATE saas.native_marketing_deliveries SET status='suppressed',last_error_code='provider_suppressed',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_received WHERE store_id=d.store_id AND recipient=d.recipient AND NOT is_test AND status IN('pending','retry','uncertain');
 END IF;
 UPDATE saas.native_marketing_deliveries SET status=CASE WHEN p_type='sent' THEN 'accepted' ELSE p_type END,provider_event_at=p_at,updated_at=greatest(updated_at,p_received) WHERE id=d.id AND(provider_event_at IS NULL OR provider_event_at<=p_at) AND(status NOT IN('bounced','complained','suppressed') OR p_type IN('bounced','complained','suppressed'));
 RETURN QUERY SELECT 'recorded',NULL::jsonb;
END $f$;

DO $security$ DECLARE t text;f record;BEGIN
 FOR t IN SELECT unnest(ARRAY['native_marketing_settings','native_marketing_store_limits','native_marketing_templates','native_marketing_campaigns','native_marketing_deliveries','native_marketing_operations','native_marketing_suppressions','native_marketing_provider_events','native_marketing_sender_budget','native_marketing_sender_attempts']) LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'native_marketing_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability',f.signature);END LOOP;
END $security$;
GRANT EXECUTE ON FUNCTION saas.native_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.native_marketing_work_claim(text,timestamptz,timestamptz,integer,uuid,uuid[],boolean),saas.native_marketing_work_authorize(uuid,uuid,text,timestamptz),saas.native_marketing_work_seal(uuid,uuid,text,timestamptz,text,bytea,text,text,text,timestamptz,timestamptz),saas.native_marketing_work_finish(uuid,uuid,text,timestamptz,text,text,timestamptz),saas.native_marketing_provider_event_record(text,text,text,timestamptz,timestamptz,text) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.native_marketing_unsubscribe(text,timestamptz) TO celebix_saas_host_resolver;
COMMIT;
