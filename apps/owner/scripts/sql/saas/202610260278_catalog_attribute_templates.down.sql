-- Remove only unchanged generated rows. Merchant-configured templates require explicit recovery review.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.catalog-attribute-templates.release278',0));
LOCK TABLE saas.stores IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE saas.catalog_admin_resources IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE saas.catalog_attribute_templates278_seeded IN ACCESS EXCLUSIVE MODE;
DO $down$DECLARE seeded record;signature text;expected_sha text;BEGIN
 IF current_setting('celebix.allow_native278_down',true)IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_DOWN_OPT_IN_REQUIRED';END IF;
 FOR signature,expected_sha IN VALUES
  ('saas.create_store_catalog_attribute_templates()','d31661f12db567b8010ae3c4138b719165b14be0354d692b2c7d56a39cf03da6'),
  ('saas.seed_store_catalog_attribute_templates(uuid,timestamp with time zone)','ef4c2c8ce1eb372f9a0aa825e85afd8f11b1c0f5d38bab6c43790b774a05ec45')LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(signature)
   AND encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')=expected_sha
   AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='v'AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee<>p.proowner))
  THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_DOWN_ROUTINE_DRIFT:%',signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM saas.catalog_attribute_templates278_seeded s LEFT JOIN saas.catalog_admin_resources r
  ON r.store_id=s.store_id AND r.id=s.resource_id WHERE to_jsonb(r)IS DISTINCT FROM s.seeded_record)
  OR EXISTS(SELECT 1 FROM saas.catalog_attribute_templates278_seeded s JOIN saas.catalog_admin_resource_products p
   ON p.store_id=s.store_id AND p.resource_id=s.resource_id WHERE s.original_record IS NULL)
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_SEEDED_RESOURCE_CHANGED';END IF;
 FOR seeded IN SELECT store_id,resource_id,original_record FROM saas.catalog_attribute_templates278_seeded ORDER BY store_id,resource_id LOOP
  DELETE FROM saas.catalog_attribute_templates278_seeded WHERE store_id=seeded.store_id AND resource_id=seeded.resource_id;
  IF seeded.original_record IS NULL THEN
   DELETE FROM saas.catalog_admin_resources WHERE store_id=seeded.store_id AND id=seeded.resource_id;
  ELSE
   UPDATE saas.catalog_admin_resources SET config=seeded.original_record->'config',version=(seeded.original_record->>'version')::bigint,
    updated_at=(seeded.original_record->>'updated_at')::timestamptz WHERE store_id=seeded.store_id AND id=seeded.resource_id;
  END IF;
 END LOOP;
END $down$;
DROP TRIGGER stores_catalog_attribute_templates278 ON saas.stores;
DROP FUNCTION saas.create_store_catalog_attribute_templates();
DROP FUNCTION saas.seed_store_catalog_attribute_templates(uuid,timestamptz);
DROP TABLE saas.catalog_attribute_templates278_seeded;
COMMIT;
