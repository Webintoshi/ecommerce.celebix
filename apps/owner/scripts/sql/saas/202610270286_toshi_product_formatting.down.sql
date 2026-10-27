BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Revert only rendering; durable generation and origin history is retained.
DO $guard286$
DECLARE p pg_proc;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid='saas.content_authoring_render_nodes(jsonb)'::regprocedure;
 IF pg_get_userbyid(p.proowner)<>'celebix_saas_owner'
  OR p.proacl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']
  OR p.prosecdef OR p.provolatile<>'i' OR p.proisstrict
  OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='sql')
 THEN RAISE EXCEPTION 'TOSHI_FORMAT286_METADATA_INVALID'; END IF;
 IF md5(pg_get_functiondef(p.oid))<>'d0f30656e78d64c52cd8f6b4c6d5ff6f'
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>'bdd08a99b473c138ad59250871d4f224eaf0c301defa3fe9b1e1c07dfa5bc189'
 THEN RAISE EXCEPTION 'TOSHI_FORMAT286_PREDECESSOR_INVALID'; END IF;
END $guard286$;
CREATE OR REPLACE FUNCTION saas.content_authoring_render_nodes(p_nodes jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(string_agg(saas.content_authoring_escape(CASE WHEN n->>'type'='text' THEN n->>'text' ELSE (n->>'value')||CASE WHEN coalesce(n->>'unit','')<>'' THEN ' '||(n->>'unit') ELSE '' END END),'' ORDER BY ordinal),'')
 FROM jsonb_array_elements(p_nodes) WITH ORDINALITY e(n,ordinal)
$f$;
COMMIT;
