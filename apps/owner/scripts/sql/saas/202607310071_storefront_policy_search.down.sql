BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DROP FUNCTION IF EXISTS saas.public_resolve_product_ids(text,timestamptz,uuid[]);
DROP FUNCTION IF EXISTS saas.public_search_products(text,timestamptz,text,integer,text);
DROP FUNCTION IF EXISTS saas.public_effective_product_projection(uuid,uuid,timestamptz);
DROP FUNCTION IF EXISTS saas.public_policy_get(text,timestamptz,text);
DROP FUNCTION IF EXISTS saas.public_policy_index(text,timestamptz);
DROP FUNCTION IF EXISTS saas.store_policy_public_store(text,timestamptz);
DROP FUNCTION IF EXISTS saas.store_policy_hostname_valid(text);
DROP FUNCTION IF EXISTS saas.store_policy_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION IF EXISTS saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint,text,text);
DROP FUNCTION IF EXISTS saas.store_policy_list_admin(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION IF EXISTS saas.store_policy_public_projection(uuid,text,boolean);
DROP FUNCTION IF EXISTS saas.store_policy_admin_projection(uuid,text);
DROP FUNCTION IF EXISTS saas.store_policy_body_valid(text,text);
DROP FUNCTION IF EXISTS saas.store_policy_key_valid(text);
DROP FUNCTION IF EXISTS saas.store_policy_timestamp(timestamptz);
DROP TRIGGER IF EXISTS stores_policy_pages ON saas.stores;
DROP FUNCTION IF EXISTS saas.create_store_policy_pages();
DROP FUNCTION IF EXISTS saas.seed_store_policy_pages(uuid,timestamptz);
DROP TABLE IF EXISTS saas.store_policy_operations;
DROP TABLE IF EXISTS saas.store_policy_pages;
DROP FUNCTION IF EXISTS saas.guard_store_policy_operations();
DROP FUNCTION IF EXISTS saas.guard_store_policy_pages();

COMMIT;
