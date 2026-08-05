BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_custom_domains_down_guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname_type='custom_domain' AND status='active')
     OR EXISTS(SELECT 1 FROM saas.store_domain_provisioning WHERE lease_id IS NOT NULL) THEN
    RAISE EXCEPTION 'STOREFRONT_CUSTOM_DOMAINS_DOWN_BLOCKED';
  END IF;
END
$storefront_custom_domains_down_guard$;

DROP FUNCTION saas.store_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean);
DROP FUNCTION saas.store_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,timestamptz);
DROP FUNCTION saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid);
DROP FUNCTION saas.merchant_store_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,jsonb,jsonb);
DROP FUNCTION saas.merchant_store_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text);
DROP FUNCTION saas.merchant_store_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.store_domain_projection(uuid);
DROP FUNCTION saas.store_domain_timestamp(timestamptz);
DROP TABLE saas.store_domain_operations;
DROP TRIGGER store_domain_provisioning_guard ON saas.store_domain_provisioning;
DROP FUNCTION saas.guard_store_domain_provisioning();
DROP FUNCTION saas.guard_store_domain_operation_mutation();
DROP TABLE saas.store_domain_provisioning;

COMMIT;
