BEGIN READ ONLY;
DO $assertions$DECLARE signature text;expected_sha text;BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.stores'::regclass AND tgname='stores_catalog_attribute_templates278'
  AND tgfoid=to_regprocedure('saas.create_store_catalog_attribute_templates()')AND tgtype=5 AND tgenabled='O'AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_TRIGGER_INVALID';END IF;
 FOR signature,expected_sha IN VALUES
  ('saas.create_store_catalog_attribute_templates()','d31661f12db567b8010ae3c4138b719165b14be0354d692b2c7d56a39cf03da6'),
  ('saas.seed_store_catalog_attribute_templates(uuid,timestamp with time zone)','ef4c2c8ce1eb372f9a0aa825e85afd8f11b1c0f5d38bab6c43790b774a05ec45')LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(signature)AND p.proowner='celebix_saas_owner'::regrole
   AND encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')=expected_sha
   AND p.prosecdef AND p.provolatile='v'AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee<>p.proowner))
  THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_ROUTINE_AUTHORITY_INVALID:%',signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('saas.catalog_attribute_templates278_seeded')AND c.relowner='celebix_saas_owner'::regrole
  AND c.relrowsecurity AND c.relforcerowsecurity AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner))
  OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='saas.catalog_attribute_templates278_seeded'::regclass)
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_PROVENANCE_PRIVACY_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.catalog_attribute_templates278_seeded'::regclass
  AND contype='f'AND confrelid='saas.catalog_admin_resources'::regclass AND confdeltype='c'AND convalidated)
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_PROVENANCE_CLEANUP_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM saas.catalog_attribute_templates278_seeded s WHERE s.seeded_record->>'store_id'IS DISTINCT FROM s.store_id::text
  OR s.seeded_record->>'id'IS DISTINCT FROM s.resource_id::text OR s.seeded_record->>'slug'IS DISTINCT FROM s.template_slug
  OR s.seeded_record->>'resource_kind'IS DISTINCT FROM 'attribute'OR s.seeded_record->>'status'IS DISTINCT FROM 'active'
  OR CASE WHEN s.original_record IS NULL THEN
   s.seeded_record->'config'->'enabled'IS DISTINCT FROM 'false'::jsonb OR s.seeded_record->'config'->>'starterTemplate'IS DISTINCT FROM s.template_slug
   OR s.seeded_record->'config'->>'key'IS DISTINCT FROM s.template_slug OR s.seeded_record->'version'IS DISTINCT FROM '1'::jsonb
  ELSE s.store_id<>'7892a771-67a9-42d7-9b36-f4c3e8562e95'OR s.resource_id<>'d52682bd-6b26-40b0-8464-15d938d790c3'OR s.template_slug<>'agirlik'
   OR(s.seeded_record-ARRAY['config','version','updated_at'])IS DISTINCT FROM(s.original_record-ARRAY['config','version','updated_at'])
   OR s.seeded_record->'config'IS DISTINCT FROM((s.original_record->'config')||jsonb_build_object('measurementField','weight'))
   OR(s.seeded_record->>'version')::bigint<>(s.original_record->>'version')::bigint+1
  END)
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_PROVENANCE_SHAPE_INVALID';END IF;
END $assertions$;
COMMIT;
