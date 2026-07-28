-- Fail closed on namespace ownership, RLS, ACL, constraint, trigger, and backfill drift.
DO $assertions$
DECLARE
  relation_oid oid := pg_catalog.to_regclass('saas.store_media_namespaces');
  operation_relation_oid oid := pg_catalog.to_regclass('saas.store_media_operations');
  archive_relation_oid oid := pg_catalog.to_regclass('saas.product_media_archive_operations');
  guard_function pg_catalog.regprocedure :=
    pg_catalog.to_regprocedure('saas.guard_store_media_namespace_mutation()');
  archive_guard_function pg_catalog.regprocedure :=
    pg_catalog.to_regprocedure('saas.guard_product_media_archive_operation()');
  archive_fence_function pg_catalog.regprocedure :=
    pg_catalog.to_regprocedure('saas.guard_reserved_product_media_archive()');
  constraint_name text;
BEGIN
  IF relation_oid IS NULL OR operation_relation_oid IS NULL OR archive_relation_oid IS NULL
     OR guard_function IS NULL OR archive_guard_function IS NULL OR archive_fence_function IS NULL THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_OBJECT_MISSING';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=class.relowner
    WHERE class.oid=relation_oid
      AND owner.rolname='celebix_saas_owner'
      AND class.relrowsecurity
      AND class.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_RELATION_SECURITY_DRIFT';
  END IF;

  IF NOT pg_catalog.has_table_privilege('celebix_saas_bootstrap',relation_oid,'SELECT')
     OR NOT pg_catalog.has_table_privilege('celebix_saas_bootstrap',relation_oid,'INSERT')
     OR pg_catalog.has_table_privilege('celebix_saas_bootstrap',relation_oid,'UPDATE')
     OR pg_catalog.has_table_privilege('celebix_saas_bootstrap',relation_oid,'DELETE') THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_BOOTSTRAP_ACL_DRIFT';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.aclexplode(COALESCE(
      (SELECT relacl FROM pg_catalog.pg_class WHERE oid=relation_oid),
      pg_catalog.acldefault('r',(SELECT relowner FROM pg_catalog.pg_class WHERE oid=relation_oid))
    )) AS acl
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=acl.grantee
    WHERE (acl.grantee=0 OR grantee.rolname IN(
      'celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver'
    ))
      AND acl.privilege_type IN('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_FORBIDDEN_ACL_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=class.relowner
    WHERE class.oid=operation_relation_oid AND owner.rolname='celebix_saas_owner'
      AND class.relrowsecurity AND class.relforcerowsecurity
  ) OR EXISTS(
    SELECT 1
    FROM pg_catalog.aclexplode(COALESCE(
      (SELECT relacl FROM pg_catalog.pg_class WHERE oid=operation_relation_oid),
      pg_catalog.acldefault('r',(SELECT relowner FROM pg_catalog.pg_class WHERE oid=operation_relation_oid))
    )) AS acl
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=acl.grantee
    WHERE (acl.grantee=0 OR grantee.rolname IN(
      'celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_bootstrap'
    )) AND acl.privilege_type IN('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_OPERATION_RELATION_SECURITY_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid=operation_relation_oid AND tgname='store_media_operations_one_way'
      AND NOT tgisinternal AND tgenabled='O'
      AND tgfoid='saas.guard_store_media_operation_mutation()'::pg_catalog.regprocedure
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_OPERATION_TRIGGER_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=class.relowner
    WHERE class.oid=archive_relation_oid AND owner.rolname='celebix_saas_owner'
      AND class.relrowsecurity AND class.relforcerowsecurity
  ) OR EXISTS(
    SELECT 1
    FROM pg_catalog.aclexplode(COALESCE(
      (SELECT relacl FROM pg_catalog.pg_class WHERE oid=archive_relation_oid),
      pg_catalog.acldefault('r',(SELECT relowner FROM pg_catalog.pg_class WHERE oid=archive_relation_oid))
    )) AS acl
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=acl.grantee
    WHERE (acl.grantee=0 OR grantee.rolname IN(
      'celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_bootstrap'
    )) AND acl.privilege_type IN('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_ARCHIVE_OPERATION_RELATION_SECURITY_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid=archive_relation_oid AND tgname='product_media_archive_operations_one_way'
      AND NOT tgisinternal AND tgenabled='O'
      AND tgfoid='saas.guard_product_media_archive_operation()'::pg_catalog.regprocedure
  ) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_ARCHIVE_OPERATION_TRIGGER_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    WHERE procedure.oid=archive_guard_function
      AND owner.rolname='celebix_saas_owner'
      AND procedure.prosecdef
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  ) OR pg_catalog.has_function_privilege('public',archive_guard_function,'EXECUTE') THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_ARCHIVE_OPERATION_GUARD_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    WHERE procedure.oid=archive_fence_function
      AND owner.rolname='celebix_saas_owner'
      AND procedure.prosecdef
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  ) OR pg_catalog.has_function_privilege('public',archive_fence_function,'EXECUTE')
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='saas.product_media'::pg_catalog.regclass
         AND tgname='product_media_archive_reservation_fence'
         AND NOT tgisinternal AND tgenabled='O'
         AND tgfoid=archive_fence_function
     ) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_ARCHIVE_RESERVATION_FENCE_DRIFT';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM unnest(ARRAY[
      'saas.media_reserve_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint,text)',
      'saas.media_mark_product_uploaded(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,uuid,uuid,text)',
      'saas.media_finalize_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,uuid,uuid,text)',
      'saas.media_recover_product_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,uuid,uuid,text)',
      'saas.media_require_product_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,uuid,uuid,text)',
      'saas.media_mark_product_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,uuid,uuid,text)',
      'saas.media_reserve_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)',
      'saas.media_finalize_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)',
      'saas.media_recover_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)',
      'saas.media_mark_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,uuid,uuid,text)'
    ]) AS signature
    WHERE pg_catalog.to_regprocedure(signature) IS NULL
      OR NOT pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure(signature),'EXECUTE')
      OR pg_catalog.has_function_privilege('public',pg_catalog.to_regprocedure(signature),'EXECUTE')
      OR NOT EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
        WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
          AND owner.rolname='celebix_saas_owner'
          AND procedure.prosecdef
          AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_OPERATION_FUNCTION_SECURITY_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.product_media'::pg_catalog.regclass
      AND conname='product_media_object_deleted_check'
  ) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_OBJECT_DELETION_PROOF_DRIFT';
  END IF;

  IF pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.media_attach_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'LEGACY_MEDIA_ATTACH_AUTHORITY_DRIFT';
  END IF;

  IF pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.media_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'LEGACY_MEDIA_ARCHIVE_AUTHORITY_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    JOIN pg_catalog.pg_language AS language ON language.oid=procedure.prolang
    WHERE procedure.oid=guard_function
      AND owner.rolname='celebix_saas_owner'
      AND language.lanname='plpgsql'
      AND procedure.prosecdef
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  ) OR pg_catalog.has_function_privilege('public',guard_function,'EXECUTE') THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_GUARD_AUTHORITY_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid=relation_oid
      AND tgname='store_media_namespaces_immutable_authority'
      AND NOT tgisinternal
      AND tgenabled='O'
      AND tgfoid=guard_function
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_TRIGGER_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.tenant_operations'::pg_catalog.regclass
      AND tgname='tenant_operations_media_snapshot_authority'
      AND NOT tgisinternal AND tgenabled='O'
      AND tgfoid='saas.guard_tenant_operation_media_snapshot()'::pg_catalog.regprocedure
  ) OR pg_catalog.has_function_privilege(
    'public','saas.guard_tenant_operation_media_snapshot()'::pg_catalog.regprocedure,'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'TENANT_OPERATION_MEDIA_SNAPSHOT_TRIGGER_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.tenant_operations'::pg_catalog.regclass
      AND conname='tenant_operations_result_payload_shape_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%mediaStorage%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%ready%'
  ) THEN
    RAISE EXCEPTION 'TENANT_OPERATION_MEDIA_SNAPSHOT_SHAPE_DRIFT';
  END IF;

  FOREACH constraint_name IN ARRAY ARRAY[
    'store_media_namespaces_pkey',
    'store_media_namespaces_store_fk',
    'store_media_namespaces_prefix_key',
    'store_media_namespaces_prefix_check',
    'store_media_namespaces_status_check',
    'store_media_namespaces_version_check',
    'store_media_namespaces_timestamp_check'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid=relation_oid AND conname=constraint_name
    ) THEN
      RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_CONSTRAINT_DRIFT:%',constraint_name;
    END IF;
  END LOOP;

  IF EXISTS(
    SELECT store.id
    FROM saas.stores AS store
    LEFT JOIN saas.store_media_namespaces AS namespace
      ON namespace.store_id=store.id
     AND namespace.namespace_prefix='stores/' || store.id::text || '/'
    GROUP BY store.id
    HAVING pg_catalog.count(namespace.store_id)<>1
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_COVERAGE_DRIFT';
  END IF;
END
$assertions$;
