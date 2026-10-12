BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION IF EXISTS saas.orders_list_archived_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text);
DROP FUNCTION IF EXISTS saas.orders_list_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text);
DROP FUNCTION IF EXISTS saas.orders_list_scope_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,boolean,text,text);
COMMIT;
