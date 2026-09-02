-- Emergency/pre-restore rollback only. Paired custom hostname rows are retained.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.owner_adopt_admin_domain_companion(uuid,uuid,text,text,timestamptz);
DROP FUNCTION saas.owner_bind_admin_domain_companion(uuid,bigint,text,jsonb,jsonb,timestamptz);
DROP FUNCTION saas.owner_prepare_admin_domain_companion(uuid,uuid,uuid,text,text,text,timestamptz);
DROP FUNCTION saas.merchant_store_domain_bundle_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_bundle_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_bundle_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text,uuid,text,text);
DROP TRIGGER admin_domains_global_hostname_guard ON saas.admin_domains;
DROP TRIGGER store_domains_global_hostname_guard ON saas.store_domains;
DROP FUNCTION saas.guard_global_domain_hostname();
DROP TABLE saas.domain_bundle_operations;
DROP TABLE saas.admin_domain_companion_audit;
DROP INDEX saas.admin_domains_one_system_companion_per_storefront_idx;
ALTER TABLE saas.admin_domains DROP CONSTRAINT admin_domains_source_storefront_fk,DROP CONSTRAINT admin_domains_management_check;
UPDATE saas.admin_domains SET management='merchant',source_storefront_domain_id=NULL WHERE kind='custom_alias';
ALTER TABLE saas.admin_domains DROP COLUMN source_storefront_domain_id,DROP COLUMN management;
COMMIT;
