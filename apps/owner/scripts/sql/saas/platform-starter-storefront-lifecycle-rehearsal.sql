-- Run with psql from this directory ONLY on the disposable baseline165 clone.
-- Unlike the rollback-only behavior test, this retains a synthetic QA tenant
-- to verify down preserves new designs/domains as well as preexisting rows.
DO $guard$
BEGIN
 IF pg_catalog.current_database()<>'celebix_onboarding_qa_20260927' THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_REHEARSAL_CLONE_ONLY';
 END IF;
END $guard$;
-- Rendered regprocedure text may omit the schema here; identity must use OIDs.
SET search_path=pg_catalog,saas;
CREATE TEMP TABLE starter_before_functions AS
SELECT oid,pg_catalog.pg_get_functiondef(oid) definition,proacl::text acl,proowner owner_id
FROM pg_catalog.pg_proc WHERE oid IN (
 'saas.provision_celebix_net_starter_storefront(uuid)'::regprocedure,
 'saas.provision_celebix_net_starter_storefront_trigger()'::regprocedure);
CREATE TEMP TABLE starter_before_trigger AS
SELECT oid,pg_catalog.pg_get_triggerdef(oid) definition,tgenabled FROM pg_catalog.pg_trigger
WHERE tgrelid='saas.domains'::regclass AND tgname='celebix_net_starter_storefront_created' AND NOT tgisinternal;
CREATE TEMP TABLE starter_before_designs AS SELECT store_id,pg_catalog.to_jsonb(design) original FROM saas.storefront_designs design;
CREATE TEMP TABLE starter_before_domains AS SELECT id,pg_catalog.to_jsonb(domain) original FROM saas.store_domains domain;

\ir 202609270166_platform_starter_storefront.up.sql
\ir 202609270166_platform_starter_storefront_assertions.sql
DO $unchanged$
BEGIN
 IF (SELECT pg_catalog.count(*) FROM saas.storefront_designs)<>(SELECT pg_catalog.count(*) FROM starter_before_designs)
  OR (SELECT pg_catalog.count(*) FROM saas.store_domains)<>(SELECT pg_catalog.count(*) FROM starter_before_domains)
  OR EXISTS(SELECT 1 FROM starter_before_designs original FULL JOIN saas.storefront_designs design USING(store_id)
    WHERE original.original IS DISTINCT FROM pg_catalog.to_jsonb(design))
  OR EXISTS(SELECT 1 FROM starter_before_domains original FULL JOIN saas.store_domains domain USING(id)
    WHERE original.original IS DISTINCT FROM pg_catalog.to_jsonb(domain)) THEN
  RAISE EXCEPTION 'REHEARSAL_MIGRATION_CHANGED_EXISTING_ROWS';
 END IF;
END $unchanged$;
\ir platform-starter-storefront-rehearsal.sql

BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $new_tenant$
DECLARE new_store_id uuid:=pg_catalog.gen_random_uuid(); selected_now timestamptz:=pg_catalog.clock_timestamp(); selected_slug text;
BEGIN
 selected_slug:='qa-retained-'||pg_catalog.substr(pg_catalog.replace(new_store_id::text,'-',''),1,12);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(new_store_id,'Retained QA tenant',selected_slug,'active','tr','TRY','starter',selected_now,selected_now);
 INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
 VALUES(pg_catalog.gen_random_uuid(),new_store_id,selected_slug||'.saas-staging.celebix.site','platform_subdomain','active',true,selected_now,selected_now);
 UPDATE saas.storefront_designs SET draft_config=pg_catalog.jsonb_set(draft_config,ARRAY['brand','primaryColor'],'"#112233"'::jsonb,false),
  draft_version=draft_version+1 WHERE store_id=new_store_id;
END $new_tenant$;
COMMIT;
CREATE TEMP TABLE starter_created_designs AS SELECT store_id,pg_catalog.to_jsonb(design) original FROM saas.storefront_designs design;
CREATE TEMP TABLE starter_created_domains AS SELECT id,pg_catalog.to_jsonb(domain) original FROM saas.store_domains domain;
-- Down must work even when the caller changes its schema search path after up.
SET search_path=public;
\ir 202609270166_platform_starter_storefront.down.sql
SET search_path=pg_catalog,saas;
DO $restored$
BEGIN
 IF EXISTS(SELECT 1 FROM starter_before_functions original LEFT JOIN pg_catalog.pg_proc procedure USING(oid)
  WHERE original.definition IS DISTINCT FROM pg_catalog.pg_get_functiondef(procedure.oid)
   OR original.acl IS DISTINCT FROM procedure.proacl::text OR original.owner_id IS DISTINCT FROM procedure.proowner)
  OR EXISTS(SELECT 1 FROM starter_before_trigger original LEFT JOIN pg_catalog.pg_trigger trigger USING(oid)
   WHERE original.definition IS DISTINCT FROM pg_catalog.pg_get_triggerdef(trigger.oid) OR original.tgenabled IS DISTINCT FROM trigger.tgenabled)
  OR pg_catalog.to_regprocedure('saas.provision_platform_starter_storefront(uuid)') IS NOT NULL
  OR pg_catalog.to_regclass('saas.platform_starter_storefront_backup') IS NOT NULL THEN
  RAISE EXCEPTION 'REHEARSAL_DOWN_DEFINITIONS_ACL_NOT_EXACT';
 END IF;
 IF EXISTS(SELECT 1 FROM starter_created_designs original FULL JOIN saas.storefront_designs design USING(store_id)
  WHERE original.original IS DISTINCT FROM pg_catalog.to_jsonb(design))
  OR EXISTS(SELECT 1 FROM starter_created_domains original FULL JOIN saas.store_domains domain USING(id)
  WHERE original.original IS DISTINCT FROM pg_catalog.to_jsonb(domain)) THEN
  RAISE EXCEPTION 'REHEARSAL_DOWN_DATA_NOT_EXACT';
 END IF;
 RAISE NOTICE 'PLATFORM_STARTER_UP_DOWN_EXACT_RESTORE_AND_DATA_PRESERVATION_PASS';
END $restored$;
\ir 202609270166_platform_starter_storefront.up.sql
\ir 202609270166_platform_starter_storefront_assertions.sql
DO $reapplied$
BEGIN
 IF EXISTS(SELECT 1 FROM starter_created_designs original FULL JOIN saas.storefront_designs design USING(store_id)
  WHERE original.original IS DISTINCT FROM pg_catalog.to_jsonb(design))
  OR EXISTS(SELECT 1 FROM starter_created_domains original FULL JOIN saas.store_domains domain USING(id)
  WHERE original.original IS DISTINCT FROM pg_catalog.to_jsonb(domain)) THEN
  RAISE EXCEPTION 'REHEARSAL_REAPPLY_CHANGED_DATA';
 END IF;
 RAISE NOTICE 'PLATFORM_STARTER_REAPPLY_PRESERVATION_PASS';
END $reapplied$;
