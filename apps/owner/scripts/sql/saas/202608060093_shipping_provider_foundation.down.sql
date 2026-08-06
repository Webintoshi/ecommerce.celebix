BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

LOCK TABLE saas.shipping_operations,saas.shipping_validation_jobs,saas.shipping_provider_resources,
  saas.shipping_provider_profiles,saas.shipping_provider_definitions IN ACCESS EXCLUSIVE MODE;
DO $function$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.shipping_operations)
    OR EXISTS(SELECT 1 FROM saas.shipping_validation_jobs)
    OR EXISTS(SELECT 1 FROM saas.shipping_provider_resources)
    OR EXISTS(SELECT 1 FROM saas.shipping_provider_profiles)
    OR EXISTS(SELECT 1 FROM saas.shipping_provider_definitions WHERE provider_code<>'basit_kargo')
  THEN RAISE EXCEPTION 'SHIPPING_PROVIDER_FOUNDATION_DOWN_BLOCKED'; END IF;
END
$function$;

REVOKE ALL ON FUNCTION
  saas.shipping_connection_projection(uuid,uuid),
  saas.shipping_connection_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.shipping_connection_setup(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.shipping_connection_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,jsonb,text,text,bigint),
  saas.shipping_connection_select_resources(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,boolean,bigint),
  saas.shipping_connection_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.shipping_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
  saas.shipping_validation_claim(text,timestamptz,integer,uuid),
  saas.shipping_validation_claim_job(uuid,text,timestamptz,integer,uuid),
  saas.shipping_validation_open_credential(uuid,text,uuid,bigint,timestamptz),
  saas.shipping_validation_complete(uuid,text,uuid,bigint,timestamptz,text,jsonb),
  saas.shipping_validation_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer),
  saas.shipping_provider_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

DROP FUNCTION saas.shipping_provider_preflight();
DROP FUNCTION saas.shipping_validation_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer);
DROP FUNCTION saas.shipping_validation_complete(uuid,text,uuid,bigint,timestamptz,text,jsonb);
DROP FUNCTION saas.shipping_validation_open_credential(uuid,text,uuid,bigint,timestamptz);
DROP FUNCTION saas.shipping_validation_claim_job(uuid,text,timestamptz,integer,uuid);
DROP FUNCTION saas.shipping_validation_claim(text,timestamptz,integer,uuid);
DROP FUNCTION saas.shipping_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.shipping_connection_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.shipping_connection_select_resources(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,boolean,bigint);
DROP FUNCTION saas.shipping_connection_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,jsonb,text,text,bigint);
DROP FUNCTION saas.shipping_connection_setup(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.shipping_connection_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.shipping_connection_projection(uuid,uuid);

DROP TRIGGER shipping_operations_immutable ON saas.shipping_operations;
DROP FUNCTION saas.shipping_guard_operation_immutable();
DROP TRIGGER shipping_provider_resources_identity_guard ON saas.shipping_provider_resources;
DROP FUNCTION saas.shipping_guard_resource_identity();

ALTER TABLE saas.shipping_provider_profiles
  DROP CONSTRAINT shipping_provider_profiles_brand_fk,
  DROP CONSTRAINT shipping_provider_profiles_address_fk;
DROP TABLE saas.shipping_operations;
DROP TABLE saas.shipping_validation_jobs;
DROP TABLE saas.shipping_provider_resources;
DROP TABLE saas.shipping_provider_profiles;
DELETE FROM saas.shipping_provider_definitions WHERE provider_code='basit_kargo';
DROP TABLE saas.shipping_provider_definitions;
DROP FUNCTION saas.shipping_resource_batch_valid(jsonb);
DROP FUNCTION saas.shipping_credential_envelope_valid(jsonb,text);
DROP FUNCTION saas.shipping_timestamp(timestamptz);

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
    OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL
    OR p_required_action IS NULL OR p_required_action NOT IN (
      'orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage',
      'customers.read','customers.manage','customers.archive','catalog_admin.read','catalog_admin.manage',
      'catalog_admin.archive','catalog_admin.import','catalog_admin.moderate','promotions.read','promotions.manage',
      'promotions.archive','content.read','content.manage','content.archive','marketing.read','marketing.manage',
      'configuration.read','configuration.manage','configuration.archive','integrations.read','integrations.manage',
      'analytics.read','inventory.read','inventory.manage','purchasing.read','purchasing.manage','pricing.read','pricing.manage'
    ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores store_row WHERE store_row.id=p_store_id AND store_row.status='active')
  THEN RETURN 'store_inactive'; END IF;
  SELECT membership.role INTO membership_role FROM saas.memberships membership
  WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
    AND membership.principal_id=p_principal_id AND membership.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.subscriptions subscription
    JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id
      AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version
      AND subscription.status='active' AND subscription.valid_from<=p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
      AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
  ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.plan_features feature
    WHERE feature.plan_id=p_plan_id AND feature.enabled AND feature.feature_key=p_required_feature
  ) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (
    membership_role IN ('store_owner','admin')
    OR (membership_role='editor' AND p_required_action IN (
      'orders.read','orders.fulfill','orders.note','carts.read','customers.read','customers.manage',
      'catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage','marketing.read',
      'configuration.read','integrations.read','analytics.read','inventory.read','inventory.manage','purchasing.read','purchasing.manage','pricing.read'
    ))
    OR (membership_role='analyst' AND p_required_action IN (
      'orders.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read','marketing.read',
      'configuration.read','integrations.read','analytics.read','inventory.read','purchasing.read','pricing.read'
    ))
  ) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END
$function$;

COMMIT;
