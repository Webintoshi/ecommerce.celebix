-- Roll back the new capability only. User deletions and their operation evidence are not undone or erased.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DROP FUNCTION saas.store_engagement_popup_delete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
COMMIT;
