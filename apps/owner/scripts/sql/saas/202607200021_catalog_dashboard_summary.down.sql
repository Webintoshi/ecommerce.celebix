BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION IF EXISTS saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);

COMMIT;
