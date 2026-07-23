BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check;
ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind IN(
  'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy',
  'marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite',
  'accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request'
));

CREATE OR REPLACE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE
  WHEN p_kind IN('discount','lucky_wheel') THEN CASE WHEN p_mutation THEN 'promotions.manage' ELSE 'promotions.read' END
  WHEN p_kind IN('email_campaign','phone_campaign','whatsapp_campaign') THEN CASE WHEN p_mutation THEN 'marketing.manage' ELSE 'marketing.read' END
  WHEN p_kind IN('blog_post','page','policy') THEN CASE WHEN p_mutation THEN 'content.manage' ELSE 'content.read' END
  WHEN p_kind IN('general_setting','language_setting','payment_setting','shipping_setting','administrator_invite') THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END
  ELSE CASE WHEN p_mutation THEN 'integrations.manage' ELSE 'integrations.read' END END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
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

CREATE OR REPLACE FUNCTION saas.merchant_admin_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; BEGIN
 IF p_kind NOT IN('discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy','marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite','accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM (SELECT id,updated_at FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind=p_kind AND status<>'archived' ORDER BY updated_at DESC,id DESC LIMIT 200) r),'[]'::jsonb));
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_list_events(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; BEGIN
 IF p_kind NOT IN('discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy','marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite','accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_event_projection(p_store_id,e.id) ORDER BY e.occurred_at DESC,e.id DESC) FROM (SELECT id,occurred_at FROM saas.merchant_admin_events WHERE store_id=p_store_id AND record_kind=p_kind ORDER BY occurred_at DESC,id DESC LIMIT 200) e),'[]'::jsonb));
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text)
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

CREATE OR REPLACE FUNCTION saas.merchant_admin_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; r saas.merchant_admin_records%ROWTYPE; result jsonb; BEGIN
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 IF r.status='archived' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_admin_records SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND id=p_record_id RETURNING saas.merchant_admin_mutation_projection(id,record_kind,status,version,updated_at) INTO result;
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,p_record_id,r.record_kind,'archived',result,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'archive',p_fingerprint,result,p_now); RETURN QUERY SELECT 'archived',result;
END $f$;

REVOKE ALL ON FUNCTION saas.merchant_admin_setting_text(jsonb,integer,integer),saas.merchant_admin_setting_https_media_url(jsonb),saas.merchant_admin_setting_destination(jsonb),saas.merchant_admin_setting_email(jsonb),saas.merchant_admin_setting_timestamp_value(jsonb),saas.merchant_admin_setting_timestamp(jsonb) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
DROP FUNCTION saas.merchant_admin_setting_timestamp(jsonb);
DROP FUNCTION saas.merchant_admin_setting_timestamp_value(jsonb);
DROP FUNCTION saas.merchant_admin_setting_email(jsonb);
DROP FUNCTION saas.merchant_admin_setting_destination(jsonb);
DROP FUNCTION saas.merchant_admin_setting_https_media_url(jsonb);
DROP FUNCTION saas.merchant_admin_setting_text(jsonb,integer,integer);
REVOKE ALL ON FUNCTION saas.merchant_admin_required_action(text,boolean),saas.merchant_admin_config_valid(text,jsonb),saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.merchant_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.merchant_admin_record_event(uuid,uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.merchant_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_record_event(uuid,uuid,uuid,text,jsonb,timestamptz) TO celebix_saas_workflow;
COMMIT;
