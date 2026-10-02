BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5s';

-- Only the private editor source changes. The existing workspace projection,
-- effective-price authority, output shape and function authority stay intact.
DO $materialization$
DECLARE
 target oid:=pg_catalog.to_regprocedure('saas.storefront_design_editor_payload(uuid)');
 before_function pg_catalog.pg_proc%ROWTYPE; after_function pg_catalog.pg_proc%ROWTYPE;
 definition text; next_source text;
BEGIN
 SELECT routine.* INTO before_function FROM pg_catalog.pg_proc routine WHERE routine.oid=target;
 IF NOT FOUND OR before_function.proowner IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner')
  OR before_function.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
  OR NOT before_function.prosecdef OR before_function.provolatile<>'s'
  OR before_function.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(before_function.proacl,pg_catalog.acldefault('f',before_function.proowner))) privilege
    WHERE privilege.privilege_type='EXECUTE' AND privilege.grantee<>before_function.proowner)
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_function.prosrc,'UTF8')),'hex')<>'d905945b0d590bbce5074a37c7a4cc321dfe9b91c3e6f63c19f0f7478d76917d' THEN
  RAISE EXCEPTION 'DESIGN_EDITOR_MATERIALIZATION_UP_PRECONDITION_FAILED';
 END IF;
 definition:=pg_catalog.pg_get_functiondef(target);
 next_source:=before_function.prosrc;
 next_source:=pg_catalog.replace(next_source,E'\n SELECT pg_catalog.jsonb_build_object(',E'\n WITH workspace AS MATERIALIZED (SELECT saas.storefront_design_workspace_payload(p_store_id) payload)\n SELECT pg_catalog.jsonb_build_object(');
 next_source:=pg_catalog.replace(next_source,E' CROSS JOIN LATERAL (SELECT saas.storefront_design_workspace_payload(p_store_id) payload) workspace',E' CROSS JOIN workspace');
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(next_source,'UTF8')),'hex')<>'2bd7f7318005cf46efbe2da36bf8dedada2ec7d3e95d5bf267aa3eff2e448b48'
  OR pg_catalog.strpos(definition,before_function.prosrc)=0 THEN
  RAISE EXCEPTION 'DESIGN_EDITOR_MATERIALIZATION_UP_SOURCE_INVALID';
 END IF;
 EXECUTE pg_catalog.replace(definition,before_function.prosrc,next_source);
 SELECT routine.* INTO after_function FROM pg_catalog.pg_proc routine WHERE routine.oid=target;
 IF NOT FOUND OR after_function.prosrc IS DISTINCT FROM next_source
  OR pg_catalog.to_jsonb(before_function)-'prosrc' IS DISTINCT FROM pg_catalog.to_jsonb(after_function)-'prosrc' THEN
  RAISE EXCEPTION 'DESIGN_EDITOR_MATERIALIZATION_UP_AUTHORITY_CHANGED';
 END IF;
END $materialization$;
COMMIT;
