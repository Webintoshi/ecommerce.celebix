BEGIN;
DO $fn$
DECLARE definition text;
BEGIN
 IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.resolve_public_storefront(text,timestamptz)'::regprocedure),'presentation.payload')=0 THEN RAISE EXCEPTION 'LIGHTWEIGHT_SHELL_DOWN_BLOCKED'; END IF;
 SELECT backup.definition INTO definition FROM saas.lightweight_storefront_shell_backup backup WHERE identity='saas.resolve_public_storefront(text,timestamptz)';
 IF definition IS NULL THEN RAISE EXCEPTION 'LIGHTWEIGHT_SHELL_BACKUP_MISSING'; END IF;
 EXECUTE definition;
END $fn$;
DROP TABLE saas.lightweight_storefront_shell_backup;
COMMIT;
