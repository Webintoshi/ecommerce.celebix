BEGIN;
SET LOCAL ROLE celebix_saas_owner;
UPDATE saas.admin_domains custom SET canonical=false,status='disabled',requested_removal=true,updated_at=clock_timestamp(),version=version+1 WHERE kind='custom_alias';
UPDATE saas.admin_domains platform SET canonical=true,updated_at=clock_timestamp(),version=version+1 WHERE platform.id=(SELECT id FROM saas.admin_domains candidate WHERE candidate.store_id=platform.store_id AND candidate.kind='platform_subdomain' AND candidate.status='active' ORDER BY candidate.created_at LIMIT 1) AND NOT EXISTS(SELECT 1 FROM saas.admin_domains current WHERE current.store_id=platform.store_id AND current.canonical);
DROP FUNCTION saas.resolve_admin_domain_origin_health(text,timestamptz);
DROP FUNCTION saas.admin_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean);
DROP FUNCTION saas.admin_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,timestamptz);
DROP FUNCTION saas.admin_domain_work_claim(text,timestamptz,timestamptz,integer,uuid);
DROP FUNCTION saas.merchant_admin_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_admin_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_admin_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_admin_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,jsonb,jsonb);
DROP FUNCTION saas.merchant_admin_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text);
DROP FUNCTION saas.merchant_admin_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.admin_domain_projection(uuid);
DROP FUNCTION saas.admin_domain_timestamp(timestamptz);
DROP TABLE saas.admin_domain_operations;
DROP INDEX saas.admin_domains_work_idx;
DROP INDEX saas.admin_domains_provider_hostname_key;
ALTER TABLE saas.admin_domains DROP CONSTRAINT admin_domains_custom_primary_ready_check,DROP CONSTRAINT admin_domains_lease_check,DROP CONSTRAINT admin_domains_attempt_check,DROP CONSTRAINT admin_domains_error_check,DROP CONSTRAINT admin_domains_validation_check,DROP CONSTRAINT admin_domains_origin_status_check,DROP CONSTRAINT admin_domains_dns_status_check,DROP CONSTRAINT admin_domains_ssl_status_check,DROP CONSTRAINT admin_domains_hostname_status_check,DROP CONSTRAINT admin_domains_cname_check,DROP CONSTRAINT admin_domains_provider_id_check,DROP CONSTRAINT admin_domains_provider_check,
  DROP COLUMN lease_expires_at,DROP COLUMN lease_owner,DROP COLUMN lease_id,DROP COLUMN attempt_count,DROP COLUMN requested_removal,DROP COLUMN last_checked_at,DROP COLUMN next_check_at,DROP COLUMN last_provider_error_code,DROP COLUMN certificate_validation,DROP COLUMN ownership_validation,DROP COLUMN origin_status,DROP COLUMN dns_status,DROP COLUMN ssl_status,DROP COLUMN hostname_status,DROP COLUMN cname_target,DROP COLUMN provider_hostname_id,DROP COLUMN provider,
  ADD CONSTRAINT admin_domains_canonical_kind_check CHECK(NOT canonical OR kind='platform_subdomain');
COMMIT;
