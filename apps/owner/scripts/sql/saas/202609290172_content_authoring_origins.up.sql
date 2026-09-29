BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Product UUIDs are immutable audit references, like record_deletion_operations.resource_id.
-- A physical FK would make the established SQL144 permanent-delete dependency scan reject
-- any product with a generation/history. Preserve the records, and validate scope at insert.
ALTER TABLE saas.content_authoring_operations DROP CONSTRAINT IF EXISTS content_authoring_operations_product_id_store_id_fkey;
ALTER TABLE saas.content_authoring_origin_history DROP CONSTRAINT IF EXISTS content_authoring_origin_history_product_id_store_id_fkey;
CREATE OR REPLACE FUNCTION saas.content_authoring_product_reference_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.store_id<>OLD.store_id
  THEN RAISE EXCEPTION 'CONTENT_AUTHORING_PRODUCT_REFERENCE_IMMUTABLE' USING ERRCODE='22023'; END IF;
  -- Finalizing an in-flight request remains possible after controlled product deletion.
  RETURN NEW;
 END IF;
 IF NEW.product_id IS NOT NULL THEN
  PERFORM 1 FROM saas.products WHERE id=NEW.product_id AND store_id=NEW.store_id AND status<>'archived' FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTENT_AUTHORING_PRODUCT_REFERENCE_INVALID' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS content_authoring_product_reference ON saas.content_authoring_operations;
CREATE TRIGGER content_authoring_product_reference BEFORE INSERT OR UPDATE ON saas.content_authoring_operations
 FOR EACH ROW EXECUTE FUNCTION saas.content_authoring_product_reference_guard();
REVOKE ALL ON FUNCTION saas.content_authoring_product_reference_guard() FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

-- Both digests are computed from durable field content. Retained on rollback with history.
ALTER TABLE saas.content_authoring_origin_history ADD COLUMN IF NOT EXISTS generated_content_digest text
 CHECK(generated_content_digest IS NULL OR generated_content_digest ~ '^sha256:[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION saas.content_authoring_origin_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE generation saas.content_authoring_operations; latest saas.content_authoring_origin_history;
BEGIN
 PERFORM 1 FROM saas.products WHERE store_id=NEW.store_id AND id=NEW.product_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONTENT_AUTHORING_PRODUCT_REFERENCE_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.generation_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO generation FROM saas.content_authoring_operations WHERE id=NEW.generation_id FOR UPDATE;
 SELECT * INTO latest FROM saas.content_authoring_origin_history
 WHERE store_id=NEW.store_id AND product_id=NEW.product_id AND field=NEW.field ORDER BY product_version DESC LIMIT 1;
 IF generation.id IS NULL OR generation.store_id<>NEW.store_id OR generation.draft_id<>NEW.draft_id
  OR (generation.product_id IS NOT NULL AND generation.product_id<>NEW.product_id)
  OR generation.status<>'completed' OR generation.source_fingerprint<>NEW.source_fingerprint
  OR NOT(generation.draft ? NEW.field)
  OR (generation.principal_id<>NEW.principal_id AND (latest.generation_id IS DISTINCT FROM NEW.generation_id OR latest.draft_id IS DISTINCT FROM NEW.draft_id))
 THEN RAISE EXCEPTION 'CONTENT_AUTHORING_ORIGIN_BINDING_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM saas.content_authoring_origin_history WHERE generation_id=NEW.generation_id AND product_id<>NEW.product_id)
 THEN RAISE EXCEPTION 'CONTENT_AUTHORING_GENERATION_ALREADY_BOUND' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $f$;

CREATE FUNCTION saas.content_authoring_escape(p_text text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT replace(replace(replace(replace(replace(p_text,'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$f$;
CREATE FUNCTION saas.content_authoring_render_nodes(p_nodes jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(string_agg(saas.content_authoring_escape(CASE WHEN n->>'type'='text' THEN n->>'text' ELSE (n->>'value')||CASE WHEN coalesce(n->>'unit','')<>'' THEN ' '||(n->>'unit') ELSE '' END END),'' ORDER BY ordinal),'')
 FROM jsonb_array_elements(p_nodes) WITH ORDINALITY e(n,ordinal)
$f$;
CREATE FUNCTION saas.content_authoring_render_description(p_blocks jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE b jsonb; item jsonb; cells jsonb; c jsonb; html text:=''; tag text;
BEGIN
 FOR b IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
  IF b->>'type' IN('paragraph','heading') THEN
   tag:=CASE WHEN b->>'type'='paragraph' THEN 'p' ELSE 'h'||(b->>'level') END;
   html:=html||'<'||tag||'>'||saas.content_authoring_render_nodes(b->'children')||'</'||tag||'>';
  ELSIF b->>'type'='list' THEN
   tag:=CASE WHEN (b->>'ordered')::boolean THEN 'ol' ELSE 'ul' END; html:=html||'<'||tag||'>';
   FOR item IN SELECT value FROM jsonb_array_elements(b->'items') LOOP html:=html||'<li>'||saas.content_authoring_render_nodes(item)||'</li>'; END LOOP;
   html:=html||'</'||tag||'>';
  ELSE
   html:=html||'<table><tbody>';
   FOR cells IN SELECT value FROM jsonb_array_elements(b->'rows') LOOP
    html:=html||'<tr>';
    FOR c IN SELECT value FROM jsonb_array_elements(cells) LOOP html:=html||'<td>'||saas.content_authoring_render_nodes(c)||'</td>'; END LOOP;
    html:=html||'</tr>';
   END LOOP;
   html:=html||'</tbody></table>';
  END IF;
 END LOOP;
 RETURN html;
END $f$;
-- Canonicalize only serialization differences introduced by the editor. Text/format edits remain edits.
CREATE FUNCTION saas.content_authoring_normalize(p_field text,p_value text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE v text:=btrim(coalesce(p_value,''));
BEGIN
 IF p_field='description' THEN
  v:=replace(v,chr(160),'&nbsp;');
  v:=regexp_replace(v,'<(table|tbody|tr|td|th|li)([[:space:]][^>]*)?>','<\1>','g');
  v:=regexp_replace(v,'<(li|td|th)><p>([^<]*)</p></(li|td|th)>','<\1>\2</\3>','g');
  -- DOM serialization emits literal quotes/apostrophes in text nodes.
  v:=regexp_replace(v,'<(p|h2|h3|h4|blockquote|li)>([[:space:]]|<br[[:space:]]*/?>|&nbsp;)*</\1>','','gi');
  v:=replace(replace(v,'&quot;','"'),'&#39;','''');
  -- ProseMirror's default whitespace parser collapses ASCII HTML whitespace and
  -- trims it at block boundaries. Preserve nonbreaking spaces and escaped markup.
  v:=regexp_replace(v,E'[ \t\r\n\f]+',' ','g');
  v:=regexp_replace(v,'<(p|h2|h3|h4|li|td|th)> +','<\1>','g');
  v:=regexp_replace(v,' +</(p|h2|h3|h4|li|td|th)>','</\1>','g');
 END IF;
 RETURN v;
END $f$;

CREATE FUNCTION saas.content_authoring_append_origins(
 p_store_id uuid,p_principal_id uuid,p_product_id uuid,p_fields text[],p_origins jsonb,p_now timestamptz,p_creating boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE field_name text; ref jsonb; latest saas.content_authoring_origin_history; generation saas.content_authoring_operations;
 saved text; generated text; saved_version bigint; draft_id uuid; generated_digest text;
BEGIN
 IF NOT saas.content_authoring_object_valid(p_origins,ARRAY[]::text[],p_fields) THEN RAISE EXCEPTION 'CONTENT_ORIGINS_INVALID' USING ERRCODE='22023'; END IF;
 -- Every wrapper holds this product lock, serializing field histories and binding races.
 PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id FOR UPDATE;
 FOREACH field_name IN ARRAY p_fields LOOP
  latest:=NULL; generation:=NULL; generated:=NULL; generated_digest:=NULL;
  SELECT * INTO latest FROM saas.content_authoring_origin_history
   WHERE store_id=p_store_id AND product_id=p_product_id AND field=field_name ORDER BY product_version DESC LIMIT 1;
  IF p_origins ? field_name THEN ref:=p_origins->field_name;
  ELSIF latest.generation_id IS NOT NULL THEN ref:=jsonb_build_object('generationId',latest.generation_id,'draftId',latest.draft_id);
  ELSE ref:='null'::jsonb; END IF;
  -- Never-AI manual fields need no provenance row. Explicit manual restore of existing
  -- lineage remains durable, including subsequent manual saves.
  IF ref='null'::jsonb AND latest.id IS NULL THEN CONTINUE; END IF;
  IF field_name='description' THEN
   SELECT description,version INTO saved,saved_version FROM saas.products WHERE store_id=p_store_id AND id=p_product_id;
  ELSE
   SELECT CASE WHEN field_name='seoTitle' THEN seo_title ELSE seo_description END,version INTO saved,saved_version FROM saas.catalog_product_profiles WHERE store_id=p_store_id AND product_id=p_product_id;
  END IF;
  saved:=saas.content_authoring_normalize(field_name,saved);
  IF ref<>'null'::jsonb THEN
   IF NOT saas.content_authoring_object_valid(ref,ARRAY['generationId','draftId'],ARRAY[]::text[])
    OR jsonb_typeof(ref->'generationId')<>'string' OR jsonb_typeof(ref->'draftId')<>'string'
    OR ref->>'generationId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR ref->>'draftId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   THEN RAISE EXCEPTION 'CONTENT_ORIGINS_INVALID' USING ERRCODE='22023'; END IF;
   SELECT * INTO generation FROM saas.content_authoring_operations WHERE id=(ref->>'generationId')::uuid FOR UPDATE;
   IF generation.id IS NULL OR generation.store_id<>p_store_id OR generation.status<>'completed'
    OR generation.draft_id<>(ref->>'draftId')::uuid OR NOT(generation.draft ? field_name)
    OR (generation.product_id IS NOT NULL AND generation.product_id<>p_product_id)
    OR (generation.principal_id<>p_principal_id AND (latest.generation_id IS DISTINCT FROM generation.id OR latest.draft_id IS DISTINCT FROM generation.draft_id))
    OR (generation.product_id IS NULL AND NOT p_creating AND NOT EXISTS(SELECT 1 FROM saas.content_authoring_origin_history WHERE generation_id=generation.id AND product_id=p_product_id))
    OR EXISTS(SELECT 1 FROM saas.content_authoring_origin_history WHERE generation_id=generation.id AND product_id<>p_product_id)
   THEN RAISE EXCEPTION 'CONTENT_ORIGINS_INVALID' USING ERRCODE='22023'; END IF;
   generated:=saas.content_authoring_normalize(field_name,CASE WHEN field_name='description' THEN saas.content_authoring_render_description(generation.draft->field_name) ELSE generation.draft->>field_name END);
   generated_digest:='sha256:'||encode(sha256(convert_to(generated,'UTF8')),'hex');
   draft_id:=generation.draft_id;
  ELSE draft_id:=coalesce(latest.draft_id,p_product_id); END IF;
  INSERT INTO saas.content_authoring_origin_history(id,store_id,product_id,draft_id,field,origin,generation_id,source_fingerprint,content_digest,generated_content_digest,product_version,principal_id,created_at)
  VALUES(gen_random_uuid(),p_store_id,p_product_id,draft_id,field_name,
   CASE WHEN generation.id IS NULL THEN 'manual' WHEN saved=generated THEN 'ai' ELSE 'edited_ai' END,
   generation.id,generation.source_fingerprint,'sha256:'||encode(sha256(convert_to(saved,'UTF8')),'hex'),generated_digest,saved_version,p_principal_id,p_now);
 END LOOP;
END $f$;

CREATE FUNCTION saas.catalog_update_product_with_origins(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint,p_slug text,p_title text,p_description text,p_status text,p_currency text,p_origins jsonb) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result record; authority_error text;
BEGIN
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id FOR UPDATE;
 SELECT * INTO result FROM saas.catalog_update_product(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_expected_version,p_slug,p_title,p_description,p_status,p_currency);
 IF result.outcome='updated' THEN
  PERFORM saas.content_authoring_append_origins(p_store_id,p_principal_id,p_product_id,ARRAY['description'],p_origins,p_now,false);
 END IF;
 RETURN QUERY SELECT result.outcome,result.result_payload;
EXCEPTION WHEN SQLSTATE '22023' THEN
 -- This exception block rolls back the product/profile, associations and operation ledger together.
 RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
END $f$;

CREATE FUNCTION saas.catalog_update_merchandising_with_origins(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_profile_version bigint,p_payload jsonb,p_origins jsonb) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result record; authority_error text;
BEGIN
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id FOR UPDATE;
 SELECT * INTO result FROM saas.catalog_update_merchandising_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_expected_profile_version,p_payload);
 IF result.outcome='updated' THEN
  PERFORM saas.content_authoring_append_origins(p_store_id,p_principal_id,p_product_id,ARRAY['seoTitle','seoDescription'],p_origins,p_now,false);
 END IF;
 RETURN QUERY SELECT result.outcome,result.result_payload;
EXCEPTION WHEN SQLSTATE '22023' THEN
 -- This exception block rolls back the product/profile, associations and operation ledger together.
 RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
END $f$;

CREATE FUNCTION saas.catalog_onboard_product_with_origins(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_ids uuid[],p_intent jsonb) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result record; authority_error text;
BEGIN
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_intent ? 'contentOrigins' AND p_intent->>'kind' IS DISTINCT FROM 'advanced' THEN
  RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
 END IF;
 PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id FOR UPDATE;
 SELECT * INTO result FROM saas.catalog_onboard_product_v3(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_ids,p_intent-'contentOrigins');
 IF result.outcome='created' THEN
  PERFORM saas.content_authoring_append_origins(p_store_id,p_principal_id,p_product_id,ARRAY['description','seoTitle','seoDescription'],coalesce(p_intent->'contentOrigins','{}'::jsonb),p_now,true);
 END IF;
 RETURN QUERY SELECT result.outcome,result.result_payload;
EXCEPTION WHEN SQLSTATE '22023' THEN
 -- This exception block rolls back the product/profile, associations and operation ledger together.
 RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
END $f$;

CREATE FUNCTION saas.catalog_get_product_editor_with_origins(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result record; origins jsonb;
BEGIN
 SELECT * INTO result FROM saas.catalog_get_product_editor_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id);
 IF result.outcome='found' THEN
  SELECT coalesce(jsonb_object_agg(field,CASE WHEN generation_id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('generationId',generation_id,'draftId',draft_id) END),'{}'::jsonb) INTO origins
  FROM (SELECT DISTINCT ON(field) field,generation_id,draft_id FROM saas.content_authoring_origin_history WHERE store_id=p_store_id AND product_id=p_product_id ORDER BY field,product_version DESC) latest;
  result.result_payload:=result.result_payload||jsonb_build_object('contentOrigins',origins);
 END IF;
 RETURN QUERY SELECT result.outcome,result.result_payload;
END $f$;
REVOKE ALL ON FUNCTION saas.content_authoring_escape(text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.content_authoring_render_nodes(jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.content_authoring_render_description(jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.content_authoring_normalize(text,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.content_authoring_append_origins(uuid,uuid,uuid,text[],jsonb,timestamptz,boolean) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.catalog_update_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.catalog_update_merchandising_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.catalog_get_product_editor_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.catalog_update_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_merchandising_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_editor_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
COMMIT;
