-- Explicit rollback only before any V2 document has been persisted.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF current_setting('celebix.allow_native254_down',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'NATIVE254_DOWN_REQUIRES_EXPLICIT_OPERATOR';END IF;
 IF EXISTS(SELECT 1 FROM saas.native_marketing_templates WHERE content?'schemaVersion') OR EXISTS(SELECT 1 FROM saas.native_marketing_campaigns WHERE template_snapshot?'schemaVersion') OR EXISTS(SELECT 1 FROM saas.native_marketing_deliveries WHERE projection->'template'?'schemaVersion') THEN RAISE EXCEPTION 'NATIVE254_DOWN_V2_DATA_PRESENT';END IF;
END $guard$;
DO $sources$ DECLARE p pg_proc%ROWTYPE;BEGIN
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_builder_block_images(uuid,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'b1bf273d2cbe12cd2b05f2658a0b00ef3c54e9e323c52403c521c46f31e80bef' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_builder_block_valid(jsonb)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'2aa7f897e82e737ba25238df992f1a598f8e94a84eba451971d09c3b75eb83e8' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_builder_json_bytes(jsonb)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'0abfeafd3b4a213409cf8097a9c2f0cc65be370bab36179e9e8d673a24b153f2' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_builder_path_valid(jsonb,boolean)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'192d150f3e78e02ac0b86068c190f3cd219fbab6b8c1eda73dc9c5ff7c5a6ff0' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_builder_product_ids(jsonb)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'949c691dd45a78b956348140e53f540db38aadab2b69ea7297076269c685cd65' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_builder_text_valid(jsonb,integer,boolean)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'528d7a655833d9370dad210d04a42661dcb72fa50a4fd76a86f4474e88ab7615' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'9d50b4c6049ce203e18c74cbe042cd04b8e15475f2ab4b8ab5b07b22d8ab0100' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_content_valid(jsonb)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'9b70374ffe947f8be06052f1f39244d3965ee78974f6e73af98e06daa01b058e' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_projection(jsonb,jsonb,jsonb,text,text,boolean,boolean)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'66fa582ca729aa8e0a1d1474b41b4793e521ea6ad69f387f53e284a28226f5b0' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='saas.native_marketing_work_authorize(uuid,uuid,text,timestamp with time zone)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'209114874ae9d3bb5c6af4f9b3ece72d1d023934250fcb6ed3ac61f2ae373474' OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'::aclitem[] OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_DOWN_SOURCE_DRIFT';END IF;
END $sources$;
CREATE OR REPLACE FUNCTION saas.native_marketing_content_valid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_typeof(p)='object' AND saas.campaign_starter_exact_keys(p,ARRAY['subject','heading','body','buttonLabel','buttonPath'])
 AND jsonb_typeof(p->'subject')='string' AND length(p->>'subject') BETWEEN 1 AND 200 AND p->>'subject'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'heading')='string' AND length(p->>'heading') BETWEEN 1 AND 160 AND p->>'heading'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'body')='string' AND length(p->>'body') BETWEEN 1 AND 4000 AND p->>'body'!~'[\x00-\x09\x0b-\x1f\x7f]'
 AND jsonb_typeof(p->'buttonLabel')='string' AND length(p->>'buttonLabel') BETWEEN 1 AND 80 AND p->>'buttonLabel'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'buttonPath')='string' AND length(p->>'buttonPath') BETWEEN 1 AND 500 AND p->>'buttonPath'~'^/($|[^/])' AND p->>'buttonPath'!~'[[:space:][:cntrl:]\\]',false)
$f$;
CREATE OR REPLACE FUNCTION saas.native_marketing_projection(p_brand jsonb,p_template jsonb,p_items jsonb,p_email text,p_name text,p_cart boolean,p_test boolean) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('recipient',p_email,'recipientName',nullif(btrim(p_name),''),'senderLabel',p_brand->>'storeName','storeName',p_brand->>'storeName','primaryColor',p_brand->>'accentColor','logoUrl',p_brand->'logoUrl','storefrontOrigin',p_brand->>'storeUrl','supportUrl',p_brand->>'supportUrl','postalAddress',p_brand->'postalAddress','template',p_template,'items',p_items,'recoveryNeeded',p_cart,'isTest',p_test))
$f$;
CREATE OR REPLACE FUNCTION saas.native_marketing_command(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_action text,p_input jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
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
CREATE OR REPLACE FUNCTION saas.native_marketing_work_authorize(p_id uuid,p_lease uuid,p_worker text,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
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
DROP FUNCTION saas.native_marketing_builder_text_valid(jsonb,integer,boolean);
DROP FUNCTION saas.native_marketing_builder_product_ids(jsonb);
DROP FUNCTION saas.native_marketing_builder_path_valid(jsonb,boolean);
DROP FUNCTION saas.native_marketing_builder_json_bytes(jsonb);
DROP FUNCTION saas.native_marketing_builder_block_valid(jsonb);
DROP FUNCTION saas.native_marketing_builder_block_images(uuid,jsonb);
COMMIT;
