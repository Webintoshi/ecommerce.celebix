DO $assertions$
DECLARE definition text; compact_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('saas.guard_product_media_authority()'::regprocedure) INTO definition;
  compact_definition:=pg_catalog.regexp_replace(definition,'[[:space:]]+','','g');
  IF pg_catalog.strpos(compact_definition,'OLD.status=''pending''ANDNEW.status=''active''ANDNEW.cleanup_state=''active''ANDNEW.archived_atISNULLANDNEW.retention_expires_atISNULLANDNEW.object_deleted_atISNULL')=0 THEN
    RAISE EXCEPTION 'media reorder lifecycle guard missing';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) AS privilege
    WHERE procedure.oid='saas.guard_product_media_authority()'::regprocedure
      AND privilege.grantee=0
      AND privilege.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'media lifecycle guard public execute'; END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.product_media'::regclass
      AND tgfoid='saas.guard_product_media_authority()'::regprocedure
      AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'media lifecycle trigger missing'; END IF;
END
$assertions$;
