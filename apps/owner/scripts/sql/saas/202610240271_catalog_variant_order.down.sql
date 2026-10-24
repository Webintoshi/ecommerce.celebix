BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.catalog-variant-order.release271',0));
DO $restore$ DECLARE r record;p record;BEGIN
 IF current_setting('celebix.allow_native271_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'VARIANT_ORDER271_ROLLBACK_CONFIRMATION_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.catalog_variant_order_state)OR EXISTS(SELECT 1 FROM saas.catalog_variant_order_operations)THEN RAISE EXCEPTION 'VARIANT_ORDER271_ROLLBACK_IN_USE';END IF;
 FOR r IN SELECT * FROM saas.catalog_variant_order271_backup LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=r.signature::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR p.proowner<>r.owner_oid OR p.proacl IS DISTINCT FROM r.acl OR p.proconfig IS DISTINCT FROM r.config THEN RAISE EXCEPTION 'VARIANT_ORDER271_PUBLISHED_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.catalog_variant_order271_backup LOOP EXECUTE r.definition;END LOOP;
 FOR r IN SELECT * FROM saas.catalog_variant_order271_backup LOOP EXECUTE 'DROP FUNCTION '||r.clone_signature;END LOOP;
END $restore$;
DROP FUNCTION saas.catalog_get_variant_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_reorder_variants(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,uuid[]);
DROP FUNCTION saas.catalog_recover_variant_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.catalog_variant_order_sort_payload(uuid,uuid,jsonb,boolean);
DROP FUNCTION saas.catalog_variant_order_rank(uuid,uuid,uuid);
DROP FUNCTION saas.catalog_variant_order_projection(uuid,uuid);
DROP TABLE saas.catalog_variant_order271_functions,saas.catalog_variant_order_operations,saas.catalog_variant_order_state,saas.catalog_variant_order271_backup;
COMMIT;
