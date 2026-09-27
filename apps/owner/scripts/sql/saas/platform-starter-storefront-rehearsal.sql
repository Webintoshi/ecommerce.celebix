-- Disposable PostgreSQL16 clone only. This file deliberately changes no persistent data.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF pg_catalog.current_database()<>'celebix_onboarding_qa_20260927' THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_REHEARSAL_CLONE_ONLY';
 END IF;
END $guard$;
CREATE TEMP TABLE starter_existing_designs AS SELECT store_id,pg_catalog.to_jsonb(design) original FROM saas.storefront_designs design;
CREATE TEMP TABLE starter_existing_domains AS SELECT id,pg_catalog.to_jsonb(domain) original FROM saas.store_domains domain;
DO $rehearsal$
#variable_conflict use_variable
DECLARE
 suffix text; store_id uuid; domain_id uuid; selected_slug text; seeded saas.storefront_designs%ROWTYPE;
 first_design jsonb; first_domain jsonb; preserved_store uuid; other_store uuid; collision integer;
 selected_now timestamptz:=pg_catalog.clock_timestamp(); bad_case integer; host text; domain_type text; status text; canonical boolean;
BEGIN
 -- SITE first: this fails on migration148 because the insert creates no authority.
 FOREACH suffix IN ARRAY ARRAY['.saas-staging.celebix.site','.saas-staging.celebix.net','.celebix.site'] LOOP
  store_id:=pg_catalog.gen_random_uuid(); domain_id:=pg_catalog.gen_random_uuid();
  selected_slug:='qa-starter-'||pg_catalog.substr(pg_catalog.replace(store_id::text,'-',''),1,12);
  INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
  VALUES(store_id,'İzole başlangıç',selected_slug,'active','tr','TRY','starter',selected_now,selected_now);
  INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
  VALUES(domain_id,store_id,selected_slug||suffix,'platform_subdomain','active',true,selected_now,selected_now);
  IF NOT EXISTS(SELECT 1 FROM saas.store_domains domain WHERE domain.id=domain_id AND domain.store_id=store_id
    AND hostname=selected_slug||suffix AND hostname_type='platform_subdomain' AND domain.status='active'
    AND is_primary AND verified_at IS NOT NULL AND version=1) THEN
   RAISE EXCEPTION 'REHEARSAL_SUPPORTED_HOST_AUTHORITY_MISSING_%',suffix;
  END IF;
  SELECT * INTO STRICT seeded FROM saas.storefront_designs design WHERE design.store_id=store_id;
  IF seeded.schema_version<>4 OR seeded.draft_version<>1 OR seeded.published_version<>1
    OR seeded.draft_config<>seeded.published_config
    OR NOT saas.storefront_design_document_valid(store_id,seeded.draft_config,false)
    OR NOT saas.storefront_design_publishable(store_id,seeded.draft_config)
    OR NOT saas.storefront_design_publishable(store_id,seeded.published_config)
    OR seeded.draft_config#>>'{hero,enabled}'<>'false'
    OR seeded.draft_config#>>'{announcement,enabled}'<>'false'
    OR seeded.draft_config#>>'{composition,announcement,enabled}'<>'false'
    OR seeded.draft_config#>'{announcement,items}'<>seeded.draft_config#>'{composition,announcement,items}' THEN
   RAISE EXCEPTION 'REHEARSAL_STARTER_NOT_VALID_AND_PUBLISHABLE_%',suffix;
  END IF;
  IF (SELECT outcome FROM saas.resolve_public_storefront(selected_slug||suffix,pg_catalog.clock_timestamp()))<>'found'
    OR (SELECT outcome FROM saas.storefront_design_get_public(store_id,selected_slug||suffix,pg_catalog.clock_timestamp()))<>'found' THEN
   RAISE EXCEPTION 'REHEARSAL_PUBLIC_HOST_NOT_FOUND_%',suffix;
  END IF;
  SELECT pg_catalog.to_jsonb(design) INTO first_design FROM saas.storefront_designs design WHERE design.store_id=store_id;
  SELECT pg_catalog.to_jsonb(domain) INTO first_domain FROM saas.store_domains domain WHERE domain.id=domain_id;
  PERFORM saas.provision_celebix_net_starter_storefront(domain_id);
  IF first_design<>(SELECT pg_catalog.to_jsonb(design) FROM saas.storefront_designs design WHERE design.store_id=store_id)
    OR first_domain<>(SELECT pg_catalog.to_jsonb(domain) FROM saas.store_domains domain WHERE domain.id=domain_id) THEN
   RAISE EXCEPTION 'REHEARSAL_REPLAY_CHANGED_ROWS';
  END IF;
  BEGIN
   INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
   VALUES(pg_catalog.gen_random_uuid(),store_id,selected_slug||suffix,'platform_subdomain','active',true,selected_now,selected_now);
   RAISE EXCEPTION 'REHEARSAL_DUPLICATE_HOST_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  preserved_store:=store_id;
 END LOOP;
 -- Existing merchant design remains exact, even while a missing host is added.
 store_id:=pg_catalog.gen_random_uuid(); domain_id:=pg_catalog.gen_random_uuid();
 selected_slug:='qa-existing-'||pg_catalog.substr(pg_catalog.replace(store_id::text,'-',''),1,12);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(store_id,'Existing merchant',selected_slug,'active','tr','TRY','starter',selected_now,selected_now);
 INSERT INTO saas.storefront_designs SELECT store_id,schema_version,draft_config,published_config,7,9,
  draft_updated_at,published_at,draft_updated_by,published_by FROM saas.storefront_designs design WHERE design.store_id=preserved_store;
 SELECT pg_catalog.to_jsonb(design) INTO first_design FROM saas.storefront_designs design WHERE design.store_id=store_id;
 INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
 VALUES(domain_id,store_id,selected_slug||'.saas-staging.celebix.site','platform_subdomain','active',true,selected_now,selected_now);
 IF first_design<>(SELECT pg_catalog.to_jsonb(design) FROM saas.storefront_designs design WHERE design.store_id=store_id) THEN
  RAISE EXCEPTION 'REHEARSAL_MERCHANT_DESIGN_OVERWRITTEN';
 END IF;
 -- Unsupported, wrong-slug, custom, pending, noncanonical and suspended domains never gain authority.
 FOR bad_case IN 1..7 LOOP
  store_id:=pg_catalog.gen_random_uuid(); domain_id:=pg_catalog.gen_random_uuid();
  selected_slug:='qa-untrusted-'||pg_catalog.substr(pg_catalog.replace(store_id::text,'-',''),1,12);
  host:=selected_slug||'.saas-staging.celebix.site'; domain_type:='platform_subdomain'; status:='active'; canonical:=true;
  IF bad_case=1 THEN host:=selected_slug||'.example.invalid'; END IF;
  IF bad_case=2 THEN host:='wrong-'||selected_slug||'.saas-staging.celebix.site'; END IF;
  IF bad_case=3 THEN domain_type:='custom'; END IF;
  IF bad_case=4 THEN status:='pending_verification'; END IF;
  IF bad_case=5 THEN canonical:=false; END IF;
  IF bad_case=7 THEN host:=selected_slug||'.saas-staging.celebix.site.example.invalid'; END IF;
  INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
  VALUES(store_id,'Untrusted host',selected_slug,CASE WHEN bad_case=6 THEN 'suspended' ELSE 'active' END,'tr','TRY','starter',selected_now,selected_now);
  INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
  VALUES(domain_id,store_id,host,domain_type,status,canonical,selected_now,selected_now);
  IF EXISTS(SELECT 1 FROM saas.store_domains domain WHERE domain.store_id=store_id)
    OR EXISTS(SELECT 1 FROM saas.storefront_designs design WHERE design.store_id=store_id) THEN
   RAISE EXCEPTION 'REHEARSAL_UNTRUSTED_HOST_PROVISIONED_%',bad_case;
  END IF;
 END LOOP;
 -- A conflicting primary aborts the original domain insert and leaves no seed.
 store_id:=pg_catalog.gen_random_uuid(); domain_id:=pg_catalog.gen_random_uuid();
 selected_slug:='qa-conflict-'||pg_catalog.substr(pg_catalog.replace(store_id::text,'-',''),1,12);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(store_id,'Conflict host',selected_slug,'active','tr','TRY','starter',selected_now,selected_now);
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at)
 VALUES(pg_catalog.gen_random_uuid(),store_id,selected_slug||'.example.invalid','custom_domain','active',true,selected_now,selected_now,selected_now);
 BEGIN
  INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
  VALUES(domain_id,store_id,selected_slug||'.celebix.site','platform_subdomain','active',true,selected_now,selected_now);
  RAISE EXCEPTION 'REHEARSAL_CONFLICT_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'PLATFORM_STARTER_STOREFRONT_CONFLICT' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM saas.domains domain WHERE domain.id=domain_id)
  OR EXISTS(SELECT 1 FROM saas.storefront_designs design WHERE design.store_id=store_id) THEN
  RAISE EXCEPTION 'REHEARSAL_CONFLICT_NOT_ATOMIC';
 END IF;
 -- Wrong-tenant hostname, UUID reuse and an unverified same-tenant authority
 -- must each fail the original insert rather than repair or claim that row.
 FOR collision IN 1..3 LOOP
  store_id:=pg_catalog.gen_random_uuid(); domain_id:=pg_catalog.gen_random_uuid();
  selected_slug:='qa-collision-'||pg_catalog.substr(pg_catalog.replace(store_id::text,'-',''),1,12);
  INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
  VALUES(store_id,'Collision host',selected_slug,'active','tr','TRY','starter',selected_now,selected_now);
  INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at)
  VALUES(CASE WHEN collision=2 THEN domain_id ELSE pg_catalog.gen_random_uuid() END,
   CASE WHEN collision=3 THEN store_id ELSE preserved_store END,
   CASE WHEN collision=2 THEN selected_slug||'.example.invalid' ELSE selected_slug||'.saas-staging.celebix.site' END,
   CASE WHEN collision=3 THEN 'platform_subdomain' ELSE 'custom_domain' END,'pending',false,NULL,selected_now,selected_now);
  BEGIN
   INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
   VALUES(domain_id,store_id,selected_slug||'.saas-staging.celebix.site','platform_subdomain','active',true,selected_now,selected_now);
   RAISE EXCEPTION 'REHEARSAL_COLLISION_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'PLATFORM_STARTER_STOREFRONT_CONFLICT' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM saas.domains domain WHERE domain.id=domain_id)
   OR EXISTS(SELECT 1 FROM saas.storefront_designs design WHERE design.store_id=store_id) THEN
   RAISE EXCEPTION 'REHEARSAL_COLLISION_NOT_ATOMIC_%',collision;
  END IF;
 END LOOP;
 -- Valid business names can exceed the design's stricter byte limit.
 store_id:=pg_catalog.gen_random_uuid(); domain_id:=pg_catalog.gen_random_uuid();
 selected_slug:='qa-longname-'||pg_catalog.substr(pg_catalog.replace(store_id::text,'-',''),1,12);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(store_id,pg_catalog.repeat('İ',160),selected_slug,'active','tr','TRY','starter',selected_now,selected_now);
 INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,created_at,updated_at)
 VALUES(domain_id,store_id,selected_slug||'.celebix.site','platform_subdomain','active',true,selected_now,selected_now);
 IF NOT (SELECT saas.storefront_design_publishable(store_id,draft_config) FROM saas.storefront_designs design WHERE design.store_id=store_id) THEN
  RAISE EXCEPTION 'REHEARSAL_LONG_BUSINESS_NAME_FAILED';
 END IF;
 IF EXISTS(SELECT 1 FROM starter_existing_designs original FULL JOIN saas.storefront_designs design USING(store_id)
  WHERE original.original IS NOT NULL AND original.original IS DISTINCT FROM pg_catalog.to_jsonb(design))
  OR EXISTS(SELECT 1 FROM starter_existing_domains original FULL JOIN saas.store_domains domain USING(id)
  WHERE original.original IS NOT NULL AND original.original IS DISTINCT FROM pg_catalog.to_jsonb(domain)) THEN
  RAISE EXCEPTION 'REHEARSAL_EXISTING_DATA_CHANGED';
 END IF;
 RAISE NOTICE 'PLATFORM_STARTER_REHEARSAL_PASS';
END $rehearsal$;
ROLLBACK;
