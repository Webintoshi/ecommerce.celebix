BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
 IF pg_catalog.to_regprocedure('saas.storefront_design_normalize_v5(jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('saas.storefront_design_v5_publishable(uuid,jsonb,jsonb)') IS NULL
 OR pg_catalog.to_regclass('saas.storefront_design_operations') IS NULL THEN
  RAISE EXCEPTION 'DESIGN_DIRECT_APPLY_PRECONDITION_FAILED';
 END IF;
END $precondition$;

-- Large compositions retain the complete immutable retry response. This is a
-- byte bound, not an artificial number-of-sections limit.
ALTER TABLE saas.storefront_design_operations DROP CONSTRAINT storefront_design_operations_result_payload_check;
ALTER TABLE saas.storefront_design_operations ADD CONSTRAINT storefront_design_operations_result_payload_check
 CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=2097152);

CREATE FUNCTION saas.storefront_design_editor_payload(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
  'schemaVersion',1,'publishedVersion',design.published_version,
  'publishedAt',saas.storefront_design_timestamp(design.published_at),
  'design',saas.storefront_design_normalize_v5(design.published_config),
  'store',workspace.payload->'store','destinations',workspace.payload->'destinations',
  'media',COALESCE((SELECT pg_catalog.jsonb_agg(selected.payload ORDER BY selected.updated_at DESC,selected.id) FROM (
   SELECT media.id,media.updated_at,pg_catalog.jsonb_build_object('id',media.id,'url',media.public_url,'altText',media.alt_text,'mediaType',media.media_type,'width',media.width,'height',media.height,'reference',pg_catalog.jsonb_build_object('kind','media','mediaId',media.id)) payload
   FROM saas.storefront_design_media media WHERE media.store_id=p_store_id AND media.status='active'
   UNION ALL
   SELECT asset.id,asset.updated_at,pg_catalog.jsonb_build_object('id',asset.id,'assetKind',asset.asset_kind,'url',asset.public_url,'altText',asset.alt_text,'mediaType',asset.media_type,'width',asset.width,'height',asset.height,'reference',pg_catalog.jsonb_build_object('kind','asset','assetId',asset.id))
   FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.status='active'
  ) selected),'[]'::jsonb)
 ) FROM saas.storefront_designs design
 CROSS JOIN LATERAL (SELECT saas.storefront_design_workspace_payload(p_store_id) payload) workspace
 WHERE design.store_id=p_store_id
$f$;

CREATE FUNCTION saas.storefront_design_editor_get(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; result jsonb;
BEGIN
 authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 result:=saas.storefront_design_editor_payload(p_store_id);
 IF result IS NULL THEN RETURN QUERY SELECT 'design_not_found',NULL::jsonb;
 ELSE RETURN QUERY SELECT 'found',result; END IF;
END $f$;

CREATE FUNCTION saas.storefront_design_apply_operation_get(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_payload_fingerprint text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing saas.storefront_design_operations%ROWTYPE;
BEGIN
 authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_design_operations operation WHERE operation.operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'design_not_found',NULL::jsonb;
 ELSIF existing.store_id=p_store_id AND existing.operation_kind='publish' AND existing.payload_fingerprint=p_payload_fingerprint AND existing.result_payload?'design' THEN RETURN QUERY SELECT 'found',existing.result_payload;
 ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
END $f$;

CREATE FUNCTION saas.storefront_design_apply(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_payload_fingerprint text,p_expected_published_version bigint,p_config jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing saas.storefront_design_operations%ROWTYPE; current_design saas.storefront_designs%ROWTYPE; result jsonb;
BEGIN
 authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_payload_fingerprint IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_published_version IS NULL OR p_expected_published_version<1 OR p_config IS NULL OR p_config->>'schemaVersion' IS DISTINCT FROM '5' OR pg_catalog.octet_length(p_config::text)>524288 THEN
  RETURN QUERY SELECT 'design_input_invalid',NULL::jsonb; RETURN;
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
 SELECT * INTO current_design FROM saas.storefront_designs design WHERE design.store_id=p_store_id FOR UPDATE;
 authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF current_design.store_id IS NULL THEN RETURN QUERY SELECT 'design_not_found',NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_design_operations operation WHERE operation.operation_id=p_operation_id;
 IF FOUND THEN
  IF existing.store_id=p_store_id AND existing.operation_kind='publish' AND existing.payload_fingerprint=p_payload_fingerprint AND existing.result_payload?'design' THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload;
  ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
  RETURN;
 END IF;
 IF current_design.published_version<>p_expected_published_version THEN RETURN QUERY SELECT 'published_version_conflict',NULL::jsonb; RETURN; END IF;
 IF NOT saas.storefront_design_v5_publishable(p_store_id,p_config,current_design.published_config) THEN RETURN QUERY SELECT 'design_publish_invalid',NULL::jsonb; RETURN; END IF;
 UPDATE saas.storefront_designs SET schema_version=5,published_config=p_config,published_version=published_version+1,published_at=p_now,published_by=p_principal_id WHERE store_id=p_store_id RETURNING * INTO current_design;
 result:=pg_catalog.jsonb_build_object('publishedVersion',current_design.published_version,'publishedAt',saas.storefront_design_timestamp(current_design.published_at),'design',current_design.published_config,'published',saas.storefront_design_public_payload(p_store_id,current_design.published_config,current_design.published_version,current_design.published_at));
 INSERT INTO saas.storefront_design_operations VALUES(p_operation_id,p_store_id,'publish',p_payload_fingerprint,result,p_now);
 INSERT INTO saas.storefront_design_events VALUES(p_operation_id,p_store_id,p_principal_id,'published',current_design.draft_version,current_design.published_version,pg_catalog.jsonb_build_object('operationId',p_operation_id,'method','apply'),p_now);
 RETURN QUERY SELECT 'applied',result;
END $f$;

-- Older open admin tabs may retain the obsolete two-step API. Lock the same
-- design row and reject their writes once its live publication uses V5.
DO $legacy_guard$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb)'::regprocedure) INTO definition;
 EXECUTE pg_catalog.replace(definition,'saas.storefront_design_save_draft(', 'saas.storefront_design_save_draft_pre_direct_apply(');
 SELECT pg_catalog.pg_get_functiondef('saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint)'::regprocedure) INTO definition;
 EXECUTE pg_catalog.replace(definition,'saas.storefront_design_publish(', 'saas.storefront_design_publish_pre_direct_apply(');
END $legacy_guard$;

CREATE OR REPLACE FUNCTION saas.storefront_design_save_draft(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_payload_fingerprint text,p_expected_draft_version bigint,p_config jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; live_version integer;
BEGIN
 authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT (published_config->>'schemaVersion')::integer INTO live_version FROM saas.storefront_designs WHERE store_id=p_store_id FOR UPDATE;
 IF live_version>=5 OR p_config->>'schemaVersion'='5' THEN RETURN QUERY SELECT 'published_version_conflict',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT * FROM saas.storefront_design_save_draft_pre_direct_apply(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_payload_fingerprint,p_expected_draft_version,p_config);
END $f$;

CREATE OR REPLACE FUNCTION saas.storefront_design_publish(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_payload_fingerprint text,p_expected_draft_version bigint,p_expected_published_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; live_version integer;
BEGIN
 authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT (published_config->>'schemaVersion')::integer INTO live_version FROM saas.storefront_designs WHERE store_id=p_store_id FOR UPDATE;
 IF live_version>=5 THEN RETURN QUERY SELECT 'published_version_conflict',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT * FROM saas.storefront_design_publish_pre_direct_apply(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_payload_fingerprint,p_expected_draft_version,p_expected_published_version);
END $f$;

REVOKE ALL ON FUNCTION saas.storefront_design_editor_payload(uuid),saas.storefront_design_editor_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.storefront_design_apply_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.storefront_design_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb),saas.storefront_design_save_draft_pre_direct_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb),saas.storefront_design_publish_pre_direct_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint)
 FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.storefront_design_editor_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.storefront_design_apply_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.storefront_design_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb) TO celebix_saas_app;
COMMIT;
