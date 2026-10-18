-- Deliberate operator rollback only. Restores the exact native252 definition;
-- existing campaign/delivery snapshots and merchant data remain unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $patch$
DECLARE before pg_proc%ROWTYPE;after pg_proc%ROWTYPE;definition text;needle text;replacement text;
BEGIN
 IF current_setting('celebix.allow_native253_down',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'NATIVE253_DOWN_REQUIRES_EXPLICIT_OPERATOR';END IF;
 SELECT * INTO before FROM pg_proc WHERE oid=to_regprocedure('saas.native_marketing_branding(uuid,timestamptz)');
 IF NOT FOUND OR encode(sha256(convert_to(pg_get_functiondef(before.oid),'UTF8')),'hex')<>'686c8b97440f8272daa8e0336571bf8f9cc2a5ac2bea026c51b98c73735c6803'
 OR before.proowner<>'celebix_saas_owner'::regrole OR before.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[]
 OR before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR NOT before.prosecdef OR before.provolatile<>'s' OR before.proisstrict OR before.proparallel<>'u'
 THEN RAISE EXCEPTION 'NATIVE253_SOURCE_DRIFT';END IF;
 definition:=pg_get_functiondef(before.oid);
 needle:=$new$'supportUrl','https://'||domain.hostname||coalesce(contact.path,'')$new$;
 replacement:=$old$'supportUrl','https://'||domain.hostname||'/contact'$old$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'NATIVE253_SUPPORT_SOURCE_COUNT';END IF;
 definition:=replace(definition,needle,replacement);
 needle:=$new$ LEFT JOIN LATERAL(
  SELECT saas.required_page_content_path(s.id,q.record_id,saas.public_content_locale_config(s.id)->>'defaultLocale') path
  FROM saas.store_required_pages q
  CROSS JOIN LATERAL saas.public_required_page_get(domain.hostname,p_now,'contact',q.locale) page
  WHERE q.store_id=s.id AND q.page_key='contact' AND page.outcome='found' AND page.result_payload->>'id'=q.record_id::text
 ) contact ON true
 LEFT JOIN saas.storefront_designs d ON d.store_id=s.id$new$;
 replacement:=$old$ LEFT JOIN saas.storefront_designs d ON d.store_id=s.id$old$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'NATIVE253_JOIN_SOURCE_COUNT';END IF;
 EXECUTE replace(definition,needle,replacement);
 SELECT * INTO STRICT after FROM pg_proc WHERE oid=before.oid;
 IF(to_jsonb(before)-'prosrc') IS DISTINCT FROM(to_jsonb(after)-'prosrc') THEN RAISE EXCEPTION 'NATIVE253_FUNCTION_AUTHORITY_CHANGED';END IF;
 IF encode(sha256(convert_to(pg_get_functiondef(after.oid),'UTF8')),'hex')<>'896b99da7714273aed3298cfc043d2af8f9a19ef47bd9168de1955c702b30f37' THEN RAISE EXCEPTION 'NATIVE253_RESULT_DRIFT';END IF;
END $patch$;
COMMIT;
