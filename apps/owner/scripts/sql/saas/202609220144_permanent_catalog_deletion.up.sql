BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

CREATE TABLE saas.product_deletion_preparations(
  store_id uuid NOT NULL,
  operation_id uuid PRIMARY KEY,
  product_id uuid NOT NULL,
  expected_version bigint NOT NULL CHECK(expected_version BETWEEN 1 AND 9007199254740991),
  prepared_version bigint NOT NULL CHECK(prepared_version BETWEEN 1 AND 9007199254740991),
  request_fingerprint character(64) NOT NULL CHECK(request_fingerprint~'^[a-f0-9]{64}$'),
  prepared_at timestamptz NOT NULL CHECK(pg_catalog.isfinite(prepared_at)),
  UNIQUE(store_id,operation_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT
);
ALTER TABLE saas.product_deletion_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.product_deletion_preparations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.product_deletion_preparations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;

CREATE FUNCTION saas.guard_product_deletion_preparation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  RAISE EXCEPTION 'PRODUCT_DELETION_PREPARATION_IMMUTABLE';
END
$function$;
CREATE TRIGGER product_deletion_preparations_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON saas.product_deletion_preparations
FOR EACH STATEMENT EXECUTE FUNCTION saas.guard_product_deletion_preparation();

CREATE OR REPLACE FUNCTION saas.guard_product_media_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.product_id<>OLD.product_id
    OR NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.object_key<>OLD.object_key
    OR NEW.public_url<>OLD.public_url OR NEW.media_type<>OLD.media_type
    OR NEW.width IS DISTINCT FROM OLD.width OR NEW.height IS DISTINCT FROM OLD.height
    OR NEW.byte_size<>OLD.byte_size OR NEW.created_at<>OLD.created_at
    OR NEW.version<>OLD.version+1
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_AUTHORITY_IMMUTABLE'; END IF;
  IF TG_OP='UPDATE' AND NOT(
    (OLD.status='active' AND NEW.status IN('active','pending') AND NEW.cleanup_state='active' AND NEW.retention_expires_at IS NULL)
    OR (OLD.status='pending' AND NEW.status='active' AND NEW.cleanup_state='active' AND NEW.archived_at IS NULL AND NEW.retention_expires_at IS NULL AND NEW.object_deleted_at IS NULL)
    OR (OLD.status='pending' AND NEW.status='archived' AND NEW.cleanup_state='retained' AND NEW.retention_expires_at=NEW.archived_at+INTERVAL '30 days')
    OR (OLD.status='archived' AND OLD.cleanup_state='retained' AND NEW.status='active' AND NEW.archived_at IS NULL AND NEW.retention_expires_at IS NULL AND NEW.cleanup_state='active')
    OR (OLD.status='archived' AND OLD.cleanup_state='retained' AND NEW.status='archived' AND NEW.cleanup_state='cleanup_pending' AND NEW.retention_expires_at=OLD.retention_expires_at)
    OR (OLD.status='archived' AND OLD.cleanup_state='cleanup_pending' AND NEW.status='archived' AND NEW.cleanup_state='object_deleted' AND NEW.object_deleted_at=NEW.updated_at AND NEW.retention_expires_at=OLD.retention_expires_at)
    OR (OLD.status='archived' AND OLD.cleanup_state='retained' AND NEW.status='archived' AND NEW.cleanup_state='object_deleted' AND NEW.object_deleted_at=NEW.updated_at AND NEW.retention_expires_at=OLD.retention_expires_at AND pg_catalog.current_setting('celebix.media_rollback_cleanup',true)=OLD.id::text)
    OR (OLD.object_deleted_at IS NULL AND OLD.cleanup_state IN('active','retained')
      AND NEW.status='archived' AND NEW.cleanup_state='retained' AND NEW.object_deleted_at IS NULL
      AND NEW.archived_at IS NOT NULL AND NEW.retention_expires_at=NEW.updated_at
      AND pg_catalog.current_setting('celebix.catalog_delete_media',true)=OLD.store_id::text||':'||OLD.product_id::text)
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_LIFECYCLE_INVALID'; END IF;
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.id=NEW.variant_id AND variant.product_id=NEW.product_id AND variant.store_id=NEW.store_id
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_VARIANT_SCOPE_INVALID'; END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION saas.pricing_reference_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE' AND TG_TABLE_NAME='pricing_variant_policy_versions'
    AND pg_catalog.current_setting('celebix.catalog_delete_pricing',true)=OLD.store_id::text||':'||OLD.variant_id::text
  THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'PRICING_REFERENCE_IMMUTABLE';
END
$function$;

CREATE OR REPLACE FUNCTION saas.guard_catalog_onboarding_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE' AND (
    pg_catalog.current_setting('celebix.catalog_safe_remove',true)=OLD.store_id::text||':'||COALESCE(OLD.result_product_id::text,'')
    OR pg_catalog.current_setting('celebix.category_safe_remove',true)=OLD.store_id::text||':'||COALESCE(OLD.result_category_id::text,'')
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'CATALOG_ONBOARDING_OPERATION_IMMUTABLE';
END
$function$;

CREATE FUNCTION saas.catalog_detach_category_reference(p_document jsonb,p_category_id text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $function$
DECLARE kind text; selected_key text; selected_value jsonb; detached jsonb; result jsonb;
BEGIN
  kind:=pg_catalog.jsonb_typeof(p_document);
  IF kind='array' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(item.detached ORDER BY item.ordinality),'[]'::jsonb) INTO result
    FROM (
      SELECT saas.catalog_detach_category_reference(value,p_category_id) detached,ordinality
      FROM pg_catalog.jsonb_array_elements(p_document) WITH ORDINALITY
    ) item WHERE item.detached IS NOT NULL;
    RETURN result;
  END IF;
  IF kind<>'object' THEN RETURN p_document; END IF;
  IF p_document->>'categoryId'=p_category_id THEN RETURN NULL; END IF;
  result:='{}'::jsonb;
  FOR selected_key,selected_value IN SELECT key,value FROM pg_catalog.jsonb_each(p_document) LOOP
    IF selected_key='categoryIds' AND pg_catalog.jsonb_typeof(selected_value)='array' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value) ORDER BY ordinality),'[]'::jsonb) INTO detached
      FROM pg_catalog.jsonb_array_elements_text(selected_value) WITH ORDINALITY
      WHERE value<>p_category_id;
      IF pg_catalog.jsonb_array_length(detached)=0 THEN RETURN NULL; END IF;
    ELSE
      detached:=saas.catalog_detach_category_reference(selected_value,p_category_id);
    END IF;
    IF detached IS NOT NULL THEN result:=result||pg_catalog.jsonb_build_object(selected_key,detached); END IF;
  END LOOP;
  RETURN result;
END
$function$;

CREATE FUNCTION saas.catalog_product_deletion_impact(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected saas.products%ROWTYPE;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.delete'
  ); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_product_id IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected FROM saas.products WHERE store_id=p_store_id AND id=p_product_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object(
    'resourceKind','product','resourceId',selected.id,'expectedVersion',selected.version,
    'confirmationLabel',selected.title,'effects',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('kind','variants','count',(SELECT pg_catalog.count(*) FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','media','count',(SELECT pg_catalog.count(*) FROM saas.product_media WHERE store_id=p_store_id AND product_id=p_product_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','catalog_relations','count',
        (SELECT pg_catalog.count(*) FROM saas.catalog_product_categories WHERE store_id=p_store_id AND product_id=p_product_id)
        +(SELECT pg_catalog.count(*) FROM saas.catalog_product_channels WHERE store_id=p_store_id AND product_id=p_product_id)
        +(SELECT pg_catalog.count(*) FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND product_id=p_product_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','pricing_records','count',
        (SELECT pg_catalog.count(*) FROM saas.pricing_variant_policy_state state JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id WHERE state.store_id=p_store_id AND variant.product_id=p_product_id)
        +(SELECT pg_catalog.count(*) FROM saas.pricing_variant_policy_versions policy JOIN saas.product_variants variant ON variant.store_id=policy.store_id AND variant.id=policy.variant_id WHERE policy.store_id=p_store_id AND variant.product_id=p_product_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','barcode_records','count',(SELECT pg_catalog.count(*) FROM saas.barcode_print_job_items item JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id WHERE item.store_id=p_store_id AND variant.product_id=p_product_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','order_line_snapshots','count',(SELECT pg_catalog.count(*) FROM saas.order_items WHERE store_id=p_store_id AND product_id=p_product_id),'disposition','retain_snapshot')
    )
  );
END
$function$;

CREATE FUNCTION saas.delete_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint,p_confirmation text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected saas.products%ROWTYPE; existing saas.record_deletion_operations%ROWTYPE; preparation saas.product_deletion_preparations%ROWTYPE; eligibility record; removed record; result jsonb; selected_variant uuid; dependency regclass; dependency_found boolean;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.delete'
  ); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_confirmation IS NULL OR p_confirmation<>pg_catalog.btrim(p_confirmation)
     OR pg_catalog.char_length(p_confirmation) NOT BETWEEN 1 AND 200 OR p_confirmation~'[[:cntrl:]]'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM saas.record_deletion_operation_lock(p_store_id,p_operation_id);
  SELECT * INTO existing FROM saas.record_deletion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.resource_kind<>'product' OR existing.resource_id<>p_product_id OR existing.request_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object(
      'resourceKind','product','resourceId',existing.resource_id,'deleted',true,'auditId',existing.operation_id,'replayed',true
    ); END IF;
    RETURN;
  END IF;
  SELECT * INTO selected FROM saas.products WHERE store_id=p_store_id AND id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.title<>p_confirmation THEN RETURN QUERY SELECT 'invalid_confirmation'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO preparation FROM saas.product_deletion_preparations
  WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF preparation.product_id<>p_product_id OR preparation.expected_version<>p_expected_version
      OR preparation.request_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
    IF selected.version<>preparation.prepared_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  ELSE
    IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
    IF selected.status<>'archived' THEN
      UPDATE saas.product_variants SET status='archived',archived_at=p_now,archived_by_product=true,version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND product_id=p_product_id AND status='active';
      UPDATE saas.products SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=p_product_id;
    END IF;
    PERFORM pg_catalog.set_config('celebix.catalog_delete_media',p_store_id::text||':'||p_product_id::text,true);
    UPDATE saas.product_media SET status='archived',archived_at=COALESCE(archived_at,p_now),
      retention_expires_at=p_now,cleanup_state='retained',updated_at=p_now,version=version+1
    WHERE store_id=p_store_id AND product_id=p_product_id AND object_deleted_at IS NULL
      AND cleanup_state IN('active','retained');
    SELECT * INTO selected FROM saas.products WHERE store_id=p_store_id AND id=p_product_id;
    INSERT INTO saas.product_deletion_preparations(
      store_id,operation_id,product_id,expected_version,prepared_version,request_fingerprint,prepared_at
    ) VALUES(p_store_id,p_operation_id,p_product_id,p_expected_version,selected.version,p_fingerprint,p_now);
  END IF;
  IF EXISTS(SELECT 1 FROM saas.product_media WHERE store_id=p_store_id AND product_id=p_product_id AND object_deleted_at IS NULL)
  THEN RETURN QUERY SELECT 'cleanup_pending'::text,NULL::jsonb; RETURN; END IF;

  FOR dependency IN
    SELECT DISTINCT constraint_row.conrelid::regclass
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS dependent_class ON dependent_class.oid=constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS dependent_namespace ON dependent_namespace.oid=dependent_class.relnamespace AND dependent_namespace.nspname='saas'
    WHERE constraint_row.contype='f' AND constraint_row.confrelid IN('saas.products'::regclass,'saas.product_variants'::regclass)
      AND dependent_class.relname NOT IN(
        'product_variants','catalog_operations','catalog_product_profiles','catalog_product_categories',
        'catalog_variant_commerce_profiles','catalog_product_channels','catalog_onboarding_operations',
        'catalog_admin_resource_products','product_media','store_media_operations','product_media_archive_operations',
        'product_media_cleanup_operations','order_items','pricing_variant_policy_state',
        'pricing_variant_policy_versions','barcode_print_job_items'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'SELECT EXISTS(SELECT 1 FROM %s AS dependent WHERE to_jsonb(dependent)->>''store_id''=$1::text AND ((to_jsonb(dependent)->>''product_id''=$2::text) OR (to_jsonb(dependent)->>''variant_id'' IN(SELECT variant.id::text FROM saas.product_variants AS variant WHERE variant.store_id=$1 AND variant.product_id=$2))))',
      dependency
    ) INTO dependency_found USING p_store_id,p_product_id;
    IF dependency_found THEN RETURN QUERY SELECT 'cleanup_failed'::text,NULL::jsonb; RETURN; END IF;
  END LOOP;

  UPDATE saas.order_items SET product_id=NULL,variant_id=NULL
  WHERE store_id=p_store_id AND product_id=p_product_id;
  FOR selected_variant IN SELECT id FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id ORDER BY id LOOP
    DELETE FROM saas.pricing_variant_policy_state WHERE store_id=p_store_id AND variant_id=selected_variant;
    PERFORM pg_catalog.set_config('celebix.catalog_delete_pricing',p_store_id::text||':'||selected_variant::text,true);
    DELETE FROM saas.pricing_variant_policy_versions WHERE store_id=p_store_id AND variant_id=selected_variant;
    DELETE FROM saas.barcode_print_job_items WHERE store_id=p_store_id AND variant_id=selected_variant;
  END LOOP;
  IF selected.status<>'archived' THEN
    UPDATE saas.product_variants SET status='archived',archived_at=p_now,archived_by_product=true,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND product_id=p_product_id AND status='active';
    UPDATE saas.products SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_product_id;
  END IF;
  SELECT check_result.outcome,check_result.result_payload INTO eligibility
  FROM saas.catalog_product_removal_eligibility(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id
  ) AS check_result;
  IF eligibility.outcome<>'found' THEN RETURN QUERY SELECT eligibility.outcome,NULL::jsonb; RETURN; END IF;
  IF NOT (eligibility.result_payload->>'eligible')::boolean THEN
    RETURN QUERY SELECT 'cleanup_failed'::text,eligibility.result_payload; RETURN;
  END IF;
  SELECT remove_result.outcome,remove_result.result_payload INTO removed
  FROM saas.catalog_remove_product(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,
    p_operation_id,p_fingerprint,p_product_id,
    (SELECT version FROM saas.products WHERE store_id=p_store_id AND id=p_product_id)
  ) AS remove_result;
  IF removed.outcome NOT IN('removed','operation_replayed') THEN RETURN QUERY SELECT removed.outcome,removed.result_payload; RETURN; END IF;
  INSERT INTO saas.record_deletion_operations(
    store_id,operation_id,resource_kind,resource_id,principal_id,membership_id,committed_at,request_fingerprint,outcome,replay_count
  ) VALUES(p_store_id,p_operation_id,'product',p_product_id,p_principal_id,p_membership_id,p_now,p_fingerprint,'deleted',0);
  result:=pg_catalog.jsonb_build_object('resourceKind','product','resourceId',p_product_id,'deleted',true,'auditId',p_operation_id,'replayed',false);
  RETURN QUERY SELECT 'deleted'::text,result;
END
$function$;

CREATE FUNCTION saas.delete_product_recover(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.record_deletion_operations%ROWTYPE;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.delete'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.record_deletion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing.resource_kind<>'product' OR existing.request_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object('resourceKind','product','resourceId',existing.resource_id,'deleted',true,'auditId',existing.operation_id,'replayed',true);
END
$function$;

CREATE FUNCTION saas.catalog_category_deletion_impact(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_category_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected saas.catalog_categories%ROWTYPE; design_count bigint;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.delete'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected FROM saas.catalog_categories WHERE store_id=p_store_id AND id=p_category_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'category_not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT
    (SELECT pg_catalog.count(*) FROM saas.merchant_admin_records WHERE store_id=p_store_id AND config::text LIKE '%'||p_category_id::text||'%')
    +(SELECT pg_catalog.count(*) FROM saas.storefront_designs WHERE store_id=p_store_id AND (draft_config::text LIKE '%'||p_category_id::text||'%' OR published_config::text LIKE '%'||p_category_id::text||'%'))
    +(SELECT pg_catalog.count(*) FROM saas.campaign_starter_publications WHERE store_id=p_store_id AND config::text LIKE '%'||p_category_id::text||'%')
  INTO design_count;
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object(
    'resourceKind','category','resourceId',selected.id,'expectedVersion',selected.version,'confirmationLabel',selected.name,
    'effects',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('kind','product_links','count',(SELECT pg_catalog.count(*) FROM saas.catalog_product_categories WHERE store_id=p_store_id AND category_id=p_category_id),'disposition','detach'),
      pg_catalog.jsonb_build_object('kind','child_categories','count',(SELECT pg_catalog.count(*) FROM saas.catalog_categories WHERE store_id=p_store_id AND parent_id=p_category_id),'disposition','detach'),
      pg_catalog.jsonb_build_object('kind','design_references','count',design_count,'disposition','detach')
    )
  );
END
$function$;

CREATE FUNCTION saas.delete_category(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_category_id uuid,p_expected_version bigint,p_confirmation text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected saas.catalog_categories%ROWTYPE; existing saas.record_deletion_operations%ROWTYPE; result jsonb; descendant_id uuid;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.delete'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_category_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_confirmation IS NULL
     OR p_confirmation<>pg_catalog.btrim(p_confirmation) OR pg_catalog.char_length(p_confirmation) NOT BETWEEN 1 AND 200 OR p_confirmation~'[[:cntrl:]]'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM saas.record_deletion_operation_lock(p_store_id,p_operation_id);
  SELECT * INTO existing FROM saas.record_deletion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.resource_kind<>'category' OR existing.resource_id<>p_category_id OR existing.request_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object('resourceKind','category','resourceId',existing.resource_id,'deleted',true,'auditId',existing.operation_id,'replayed',true); END IF;
    RETURN;
  END IF;
  SELECT * INTO selected FROM saas.catalog_categories WHERE store_id=p_store_id AND id=p_category_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'category_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF selected.name<>p_confirmation THEN RETURN QUERY SELECT 'invalid_confirmation'::text,NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.merchant_admin_records record
    CROSS JOIN LATERAL (SELECT saas.catalog_detach_category_reference(record.config,p_category_id::text) config) candidate
    WHERE record.store_id=p_store_id AND record.config::text LIKE '%'||p_category_id::text||'%'
      AND (candidate.config IS NULL OR NOT saas.merchant_admin_config_valid(record.record_kind,candidate.config))
  ) OR EXISTS(
    SELECT 1 FROM saas.storefront_designs design
    CROSS JOIN LATERAL (SELECT
      saas.catalog_detach_category_reference(design.draft_config,p_category_id::text) draft_config,
      saas.catalog_detach_category_reference(design.published_config,p_category_id::text) published_config
    ) candidate WHERE design.store_id=p_store_id
      AND (design.draft_config::text LIKE '%'||p_category_id::text||'%' OR design.published_config::text LIKE '%'||p_category_id::text||'%')
      AND (candidate.draft_config IS NULL OR candidate.published_config IS NULL
        OR NOT saas.storefront_design_document_valid(p_store_id,candidate.draft_config,true)
        OR NOT saas.storefront_design_document_valid(p_store_id,candidate.published_config,true))
  ) OR EXISTS(
    SELECT 1 FROM saas.campaign_starter_publications publication
    CROSS JOIN LATERAL (SELECT saas.catalog_detach_category_reference(publication.config,p_category_id::text) config) candidate
    WHERE publication.store_id=p_store_id AND publication.config::text LIKE '%'||p_category_id::text||'%'
      AND (candidate.config IS NULL OR NOT saas.campaign_starter_composition_valid(candidate.config))
  ) THEN RETURN QUERY SELECT 'cleanup_failed'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.catalog_categories WHERE store_id=p_store_id AND id IN (
    WITH RECURSIVE subtree AS (
      SELECT id FROM saas.catalog_categories WHERE store_id=p_store_id AND parent_id=p_category_id
      UNION ALL
      SELECT child.id FROM saas.catalog_categories child JOIN subtree parent ON child.parent_id=parent.id
      WHERE child.store_id=p_store_id
    ) SELECT id FROM subtree
  ) ORDER BY depth,position,id FOR UPDATE;
  PERFORM 1 FROM saas.catalog_product_categories WHERE store_id=p_store_id AND category_id=p_category_id ORDER BY product_id FOR UPDATE;
  DELETE FROM saas.catalog_product_categories WHERE store_id=p_store_id AND category_id=p_category_id;
  UPDATE saas.merchant_admin_records record SET
    config=saas.catalog_detach_category_reference(record.config,p_category_id::text),
    version=record.version+1,updated_at=p_now
  WHERE record.store_id=p_store_id AND record.config::text LIKE '%'||p_category_id::text||'%';
  UPDATE saas.storefront_designs design SET
    draft_config=saas.catalog_detach_category_reference(design.draft_config,p_category_id::text),
    published_config=saas.catalog_detach_category_reference(design.published_config,p_category_id::text),
    draft_version=design.draft_version+1,published_version=design.published_version+1,
    draft_updated_at=p_now,published_at=p_now,draft_updated_by=p_principal_id,published_by=p_principal_id
  WHERE design.store_id=p_store_id
    AND (design.draft_config::text LIKE '%'||p_category_id::text||'%' OR design.published_config::text LIKE '%'||p_category_id::text||'%');
  UPDATE saas.campaign_starter_publications publication SET
    config=saas.catalog_detach_category_reference(publication.config,p_category_id::text),
    record_version=publication.record_version+1,published_at=p_now
  WHERE publication.store_id=p_store_id AND publication.config::text LIKE '%'||p_category_id::text||'%';
  FOR descendant_id IN
    WITH RECURSIVE subtree AS (
      SELECT id FROM saas.catalog_categories WHERE store_id=p_store_id AND parent_id=p_category_id
      UNION ALL
      SELECT child.id FROM saas.catalog_categories child JOIN subtree parent ON child.parent_id=parent.id
      WHERE child.store_id=p_store_id
    )
    SELECT category.id FROM saas.catalog_categories AS category
    WHERE category.store_id=p_store_id AND category.id IN(SELECT id FROM subtree)
    ORDER BY category.depth,category.position,category.id
  LOOP
    UPDATE saas.catalog_categories AS category SET
      parent_id=CASE WHEN category.parent_id=p_category_id THEN selected.parent_id ELSE category.parent_id END,
      depth=category.depth-1,version=category.version+1,updated_at=p_now
    WHERE category.store_id=p_store_id AND category.id=descendant_id;
  END LOOP;
  PERFORM pg_catalog.set_config('celebix.category_safe_remove',p_store_id::text||':'||p_category_id::text,true);
  DELETE FROM saas.catalog_onboarding_operations WHERE store_id=p_store_id AND result_category_id=p_category_id;
  DELETE FROM saas.catalog_categories WHERE store_id=p_store_id AND id=p_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATEGORY_DELETION_TARGET_DISAPPEARED'; END IF;
  INSERT INTO saas.record_deletion_operations(store_id,operation_id,resource_kind,resource_id,principal_id,membership_id,committed_at,request_fingerprint,outcome,replay_count)
  VALUES(p_store_id,p_operation_id,'category',p_category_id,p_principal_id,p_membership_id,p_now,p_fingerprint,'deleted',0);
  result:=pg_catalog.jsonb_build_object('resourceKind','category','resourceId',p_category_id,'deleted',true,'auditId',p_operation_id,'replayed',false);
  RETURN QUERY SELECT 'deleted'::text,result;
END
$function$;

CREATE FUNCTION saas.delete_category_recover(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.record_deletion_operations%ROWTYPE;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.delete'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.record_deletion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing.resource_kind<>'category' OR existing.request_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object('resourceKind','category','resourceId',existing.resource_id,'deleted',true,'auditId',existing.operation_id,'replayed',true);
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_product_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.delete_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.delete_product_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.catalog_category_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.delete_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.delete_category_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.catalog_product_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.delete_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.delete_product_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_category_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.delete_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.delete_category_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
