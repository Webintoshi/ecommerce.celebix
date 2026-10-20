-- Read-only validation of the supported starter snapshot constraint.
DO $assert$
DECLARE c pg_constraint%ROWTYPE;
BEGIN
 SELECT * INTO STRICT c FROM pg_constraint WHERE conrelid='saas.tenant_operations'::regclass AND conname='tenant_operations_result_payload_shape_check';
 IF encode(sha256(convert_to(pg_get_constraintdef(c.oid),'UTF8')),'hex')<>'b3fc157237969ac0db8bf44adbaf8ca216f71b224c764d8db9bd97dfc7fec775' OR c.contype<>'c' OR NOT c.convalidated OR c.condeferrable OR c.condeferred OR NOT c.conislocal OR c.coninhcount<>0 OR c.connoinherit THEN RAISE EXCEPTION 'STARTER255_ASSERT_CONSTRAINT_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=c.conrelid AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'STARTER255_ASSERT_TABLE_AUTHORITY';END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid=c.conrelid AND NOT tgisinternal AND tgname IN('tenant_operations_replay_immutable','tenant_operations_media_snapshot_authority') AND tgenabled='O')<>2 THEN RAISE EXCEPTION 'STARTER255_ASSERT_IMMUTABLE_TRIGGERS';END IF;
END $assert$;
