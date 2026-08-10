BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $single_authority_category_showcase_down_guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_single_authority_category_showcase_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SINGLE_AUTHORITY_CATEGORY_SHOWCASE_DOWN_BLOCKED';
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.merchant_admin_records
    WHERE record_kind='category_showcase' AND config->>'layout'='duo'
  ) THEN
    RAISE EXCEPTION 'SINGLE_AUTHORITY_CATEGORY_SHOWCASE_DOWN_DATA_LOSS';
  END IF;
END
$single_authority_category_showcase_down_guard$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;

UPDATE saas.merchant_admin_records
SET config=config-'layout'
WHERE record_kind='category_showcase' AND config->>'layout'='grid';

DROP FUNCTION saas.public_starter_retail_presentation(uuid,timestamptz,boolean);
ALTER FUNCTION saas.public_starter_retail_presentation_without_single_authority_category_showcase(uuid,timestamptz,boolean)
  RENAME TO public_starter_retail_presentation;

DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
ALTER FUNCTION saas.merchant_admin_config_valid_without_single_authority_category_showcase(text,jsonb)
  RENAME TO merchant_admin_config_valid;

REVOKE ALL ON FUNCTION
  saas.merchant_admin_config_valid(text,jsonb),
  saas.public_starter_retail_presentation(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
