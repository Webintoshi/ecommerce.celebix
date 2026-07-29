-- Phase 3D-G durable merchant modules and audit authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL OR p_required_action IS NULL OR p_required_action NOT IN ('orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage','customers.read','customers.manage','customers.archive','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.import','catalog_admin.moderate','promotions.read','promotions.manage','promotions.archive','content.read','content.manage','content.archive','marketing.read','marketing.manage','configuration.read','configuration.manage','configuration.archive','integrations.read','integrations.manage') THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND s.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT m.role INTO membership_role FROM saas.memberships m WHERE m.id=p_membership_id AND m.store_id=p_store_id AND m.principal_id=p_principal_id AND m.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store_id AND s.plan_id=p_plan_id AND s.plan_code=p_plan_code AND s.plan_version=p_plan_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=p_plan_id AND f.enabled AND f.feature_key=p_required_feature) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (membership_role IN ('store_owner','admin') OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note','carts.read','customers.read','customers.manage','catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage','marketing.read','configuration.read','integrations.read')) OR (membership_role='analyst' AND p_required_action IN ('orders.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read','marketing.read','configuration.read','integrations.read'))) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END $f$;

CREATE TABLE saas.merchant_admin_records(
  id uuid NOT NULL, store_id uuid NOT NULL, record_kind text NOT NULL, name text NOT NULL, config jsonb NOT NULL,
  status text NOT NULL, version bigint NOT NULL DEFAULT 1, archived_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(id), UNIQUE(store_id,id), FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(record_kind IN('discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy','marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite','accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request')),
  CHECK(name=pg_catalog.btrim(name) AND pg_catalog.char_length(name) BETWEEN 1 AND 160 AND name!~'[[:cntrl:]]'),
  CHECK(pg_catalog.jsonb_typeof(config)='object' AND pg_catalog.pg_column_size(config)<=16384),
  CHECK(status IN('draft','active','archived')), CHECK(version>0), CHECK(updated_at>=created_at),
  CHECK((status='archived')=(archived_at IS NOT NULL))
);

CREATE TABLE saas.merchant_admin_events(
  id uuid NOT NULL, store_id uuid NOT NULL, record_id uuid NOT NULL, record_kind text NOT NULL, event_kind text NOT NULL,
  summary jsonb NOT NULL, occurred_at timestamptz NOT NULL,
  PRIMARY KEY(id), UNIQUE(store_id,id),
  FOREIGN KEY(store_id,record_id) REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT,
  CHECK(event_kind IN('saved','archived','coupon_used','wheel_spin','delivery_attempt','sync_job','invoice_reconciled','indexing_job')),
  CHECK(pg_catalog.jsonb_typeof(summary)='object' AND pg_catalog.pg_column_size(summary)<=16384)
);

CREATE TABLE saas.merchant_admin_operations(
  operation_id uuid NOT NULL, store_id uuid NOT NULL, operation_kind text NOT NULL, payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL, committed_at timestamptz NOT NULL, PRIMARY KEY(operation_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('save','archive')), CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768)
);

CREATE INDEX merchant_admin_records_list_idx ON saas.merchant_admin_records(store_id,record_kind,status,updated_at DESC,id DESC);
CREATE INDEX merchant_admin_events_list_idx ON saas.merchant_admin_events(store_id,record_kind,occurred_at DESC,id DESC);
CREATE FUNCTION saas.guard_merchant_admin_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'MERCHANT_ADMIN_IMMUTABLE'; END $f$;
CREATE TRIGGER merchant_admin_events_immutable BEFORE UPDATE OR DELETE ON saas.merchant_admin_events FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
CREATE TRIGGER merchant_admin_operations_immutable BEFORE UPDATE OR DELETE ON saas.merchant_admin_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
DO $f$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['merchant_admin_records','merchant_admin_events','merchant_admin_operations'] LOOP EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name); EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name); EXECUTE pg_catalog.format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver',table_name); END LOOP; END $f$;

CREATE FUNCTION saas.merchant_admin_timestamp(p_value timestamptz) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$ SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $f$;
CREATE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE
  WHEN p_kind IN('discount','lucky_wheel') THEN CASE WHEN p_mutation THEN 'promotions.manage' ELSE 'promotions.read' END
  WHEN p_kind IN('email_campaign','phone_campaign','whatsapp_campaign') THEN CASE WHEN p_mutation THEN 'marketing.manage' ELSE 'marketing.read' END
  WHEN p_kind IN('blog_post','page','policy') THEN CASE WHEN p_mutation THEN 'content.manage' ELSE 'content.read' END
  WHEN p_kind IN('general_setting','language_setting','payment_setting','shipping_setting','administrator_invite') THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END
  ELSE CASE WHEN p_mutation THEN 'integrations.manage' ELSE 'integrations.read' END END $f$;
CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_typeof(p_config)='object' AND pg_catalog.pg_column_size(p_config)<=16384 AND NOT EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS field(key) WHERE CASE p_kind
   WHEN 'discount' THEN key NOT IN('code','discountType','value','minimumOrderCents','usageLimit')
   WHEN 'lucky_wheel' THEN key NOT IN('campaignMessage','terms','dailySpinLimit','prizeLabels')
   WHEN 'email_campaign' THEN key NOT IN('subject','audience','content','scheduledAt')
   WHEN 'phone_campaign' THEN key NOT IN('audience','script','scheduledAt')
   WHEN 'whatsapp_campaign' THEN key NOT IN('audience','message','scheduledAt')
   WHEN 'blog_post' THEN key NOT IN('slug','locale','excerpt','body','published')
   WHEN 'page' THEN key NOT IN('slug','locale','body','published')
   WHEN 'policy' THEN key NOT IN('policyType','locale','body','effectiveAt')
   WHEN 'marketplace_connection' THEN key NOT IN('provider','merchantReference','syncEnabled')
   WHEN 'general_setting' THEN key NOT IN('storeDisplayName','supportEmail','timezone')
   WHEN 'language_setting' THEN key NOT IN('defaultLocale','enabledLocales')
   WHEN 'payment_setting' THEN key NOT IN('enabledMethods','cashOnDelivery')
   WHEN 'shipping_setting' THEN key NOT IN('regions','freeShippingThresholdCents','estimatedDays')
   WHEN 'administrator_invite' THEN key NOT IN('email','role','expiresAt')
   WHEN 'accounting_profile' THEN key NOT IN('legalName','taxOffice','taxNumber','invoiceEmail')
   WHEN 'invoice_integration' THEN key NOT IN('provider','accountReference','enabled')
   WHEN 'seo_control' THEN key NOT IN('metaTitle','metaDescription','allowIndex')
   WHEN 'sitemap' THEN key NOT IN('includeProducts','includeContent','changeFrequency')
   WHEN 'social_preview' THEN key NOT IN('title','description','imageUrl')
   WHEN 'code_integration' THEN key NOT IN('provider','publicIdentifier','enabled')
   WHEN 'indexing_request' THEN key NOT IN('urls','reason')
   ELSE true END
 )
$f$;
CREATE FUNCTION saas.merchant_admin_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',saas.merchant_admin_required_action(p_kind,p_mutation)) $f$;
CREATE FUNCTION saas.merchant_admin_projection(p_store_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object('id',r.id,'kind',r.record_kind,'name',r.name,'config',r.config,'status',r.status,'version',r.version,'createdAt',saas.merchant_admin_timestamp(r.created_at),'updatedAt',saas.merchant_admin_timestamp(r.updated_at)) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_id $f$;
CREATE FUNCTION saas.merchant_admin_mutation_projection(p_id uuid,p_kind text,p_status text,p_version bigint,p_updated_at timestamptz) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$ SELECT pg_catalog.jsonb_build_object('id',p_id,'kind',p_kind,'status',p_status,'version',p_version,'updatedAt',saas.merchant_admin_timestamp(p_updated_at)) $f$;
CREATE FUNCTION saas.merchant_admin_event_projection(p_store_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$ SELECT pg_catalog.jsonb_build_object('id',e.id,'recordId',e.record_id,'recordKind',e.record_kind,'eventKind',e.event_kind,'summary',e.summary,'occurredAt',saas.merchant_admin_timestamp(e.occurred_at)) FROM saas.merchant_admin_events e WHERE e.store_id=p_store_id AND e.id=p_id $f$;

CREATE FUNCTION saas.merchant_admin_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; BEGIN
 IF p_kind NOT IN('discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy','marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite','accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM (SELECT id,updated_at FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind=p_kind AND status<>'archived' ORDER BY updated_at DESC,id DESC LIMIT 200) r),'[]'::jsonb));
END $f$;

CREATE FUNCTION saas.merchant_admin_list_events(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; BEGIN
 IF p_kind NOT IN('discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy','marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite','accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_event_projection(p_store_id,e.id) ORDER BY e.occurred_at DESC,e.id DESC) FROM (SELECT id,occurred_at FROM saas.merchant_admin_events WHERE store_id=p_store_id AND record_kind=p_kind ORDER BY occurred_at DESC,id DESC LIMIT 200) e),'[]'::jsonb));
END $f$;

CREATE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; current_record saas.merchant_admin_records%ROWTYPE; result jsonb; projection jsonb;
BEGIN
 IF p_fingerprint!~'^[a-f0-9]{64}$' OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.char_length(p_name) NOT BETWEEN 1 AND 160 OR p_name~'[[:cntrl:]]' OR NOT saas.merchant_admin_config_valid(p_kind,p_config) OR p_status NOT IN('draft','active') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 SELECT * INTO current_record FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE;
 IF FOUND THEN IF current_record.record_kind<>p_kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF; IF p_expected_version IS NULL OR current_record.version<>p_expected_version OR current_record.status='archived' THEN RETURN QUERY SELECT CASE WHEN current_record.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF; UPDATE saas.merchant_admin_records SET name=p_name,config=p_config,status=p_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_record_id;
 ELSE IF p_expected_version IS NOT NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF; INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES(p_record_id,p_store_id,p_kind,p_name,p_config,p_status,p_now,p_now); END IF;
 SELECT saas.merchant_admin_mutation_projection(r.id,r.record_kind,r.status,r.version,r.updated_at),saas.merchant_admin_projection(p_store_id,r.id) INTO result,projection FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id;
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,p_record_id,p_kind,'saved',projection,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'save',p_fingerprint,result,p_now); RETURN QUERY SELECT 'saved',result;
END $f$;

CREATE FUNCTION saas.merchant_admin_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; r saas.merchant_admin_records%ROWTYPE; result jsonb; BEGIN
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 IF r.status='archived' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_admin_records SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND id=p_record_id RETURNING saas.merchant_admin_mutation_projection(id,record_kind,status,version,updated_at) INTO result;
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,p_record_id,r.record_kind,'archived',result,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'archive',p_fingerprint,result,p_now); RETURN QUERY SELECT 'archived',result;
END $f$;

CREATE FUNCTION saas.merchant_admin_recover_operation(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE op saas.merchant_admin_operations%ROWTYPE; r saas.merchant_admin_records%ROWTYPE; e text; BEGIN SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF; SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(op.result_payload->>'id')::uuid; e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,false); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'operation_replayed',op.result_payload; END $f$;

CREATE FUNCTION saas.merchant_admin_record_event(p_store_id uuid,p_record_id uuid,p_event_id uuid,p_event_kind text,p_summary jsonb,p_occurred_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE r saas.merchant_admin_records%ROWTYPE; BEGIN
 IF p_event_kind NOT IN('coupon_used','wheel_spin','delivery_attempt','sync_job','invoice_reconciled','indexing_job') OR pg_catalog.jsonb_typeof(p_summary)<>'object' OR pg_catalog.pg_column_size(p_summary)>16384 THEN RETURN 'invalid_input'; END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id AND status='active'; IF NOT FOUND THEN RETURN 'record_not_found'; END IF;
 IF (p_event_kind='coupon_used' AND r.record_kind<>'discount') OR (p_event_kind='wheel_spin' AND r.record_kind<>'lucky_wheel') OR (p_event_kind='delivery_attempt' AND r.record_kind NOT IN('email_campaign','phone_campaign','whatsapp_campaign')) OR (p_event_kind='sync_job' AND r.record_kind<>'marketplace_connection') OR (p_event_kind='invoice_reconciled' AND r.record_kind NOT IN('accounting_profile','invoice_integration')) OR (p_event_kind='indexing_job' AND r.record_kind<>'indexing_request') THEN RETURN 'invalid_input'; END IF;
 BEGIN INSERT INTO saas.merchant_admin_events VALUES(p_event_id,p_store_id,p_record_id,r.record_kind,p_event_kind,p_summary,p_occurred_at); EXCEPTION WHEN unique_violation THEN RETURN 'event_replayed'; END; RETURN 'recorded';
END $f$;

REVOKE ALL ON FUNCTION saas.guard_merchant_admin_immutable(),saas.merchant_admin_timestamp(timestamptz),saas.merchant_admin_required_action(text,boolean),saas.merchant_admin_config_valid(text,jsonb),saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,boolean),saas.merchant_admin_projection(uuid,uuid),saas.merchant_admin_mutation_projection(uuid,text,text,bigint,timestamptz),saas.merchant_admin_event_projection(uuid,uuid),saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.merchant_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.merchant_admin_record_event(uuid,uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.merchant_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_record_event(uuid,uuid,uuid,text,jsonb,timestamptz) TO celebix_saas_workflow;
COMMIT;
