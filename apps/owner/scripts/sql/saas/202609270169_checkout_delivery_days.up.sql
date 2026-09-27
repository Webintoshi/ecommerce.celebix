BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

-- Preserve the installed validator, including any prior fee/legacy settings
-- refinements. This migration changes definitions only, never merchant records.
DO $precondition$
BEGIN
 IF pg_catalog.to_regprocedure('saas.merchant_admin_config_valid(text,jsonb)') IS NULL
  OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_delivery_days(text,jsonb)') IS NOT NULL
  OR pg_catalog.to_regclass('saas.checkout_delivery_days_backup') IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc
    WHERE oid='saas.merchant_admin_config_valid(text,jsonb)'::regprocedure
      AND proowner='celebix_saas_owner'::regrole AND prorettype='boolean'::regtype
      AND provolatile='i' AND proisstrict AND NOT prosecdef) THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_PRECONDITION_FAILED';
 END IF;
END $precondition$;

CREATE TABLE saas.checkout_delivery_days_backup(
 identity text PRIMARY KEY,
 definition text NOT NULL,
 acl text,
 owner_id oid NOT NULL,
 migrated_definition text
);
ALTER TABLE saas.checkout_delivery_days_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_delivery_days_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.checkout_delivery_days_backup FROM PUBLIC,
 celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
 celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
INSERT INTO saas.checkout_delivery_days_backup(identity,definition,acl,owner_id)
SELECT 'saas.merchant_admin_config_valid(text,jsonb)',pg_catalog.pg_get_functiondef(oid),proacl::text,proowner
FROM pg_catalog.pg_proc WHERE oid='saas.merchant_admin_config_valid(text,jsonb)'::regprocedure;

-- Clone the installed definition under a private name. CREATE OR REPLACE below
-- retains the original validator's OID, owner and ACL for all existing callers.
DO $clone$
DECLARE original text;
BEGIN
 SELECT definition INTO original FROM saas.checkout_delivery_days_backup;
 IF original NOT LIKE 'CREATE OR REPLACE FUNCTION saas.merchant_admin_config_valid(%' THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_DEFINITION_INVALID';
 END IF;
 EXECUTE pg_catalog.replace(original,
  'CREATE OR REPLACE FUNCTION saas.merchant_admin_config_valid(',
  'CREATE FUNCTION saas.merchant_admin_config_valid_without_delivery_days(');
END $clone$;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid_without_delivery_days(text,jsonb) FROM PUBLIC,
 celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
 celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
INSERT INTO saas.checkout_delivery_days_backup(identity,definition,acl,owner_id,migrated_definition)
SELECT 'saas.merchant_admin_config_valid_without_delivery_days(text,jsonb)',
 pg_catalog.pg_get_functiondef(oid),proacl::text,proowner,pg_catalog.pg_get_functiondef(oid)
FROM pg_catalog.pg_proc WHERE oid='saas.merchant_admin_config_valid_without_delivery_days(text,jsonb)'::regprocedure;

CREATE OR REPLACE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $function$
 SELECT CASE WHEN p_kind='shipping_setting' THEN
  CASE WHEN pg_catalog.jsonb_typeof(p_config)<>'object' THEN false ELSE
   saas.merchant_admin_config_valid_without_delivery_days(p_kind,p_config-'estimatedDays')
   AND CASE WHEN NOT p_config?'estimatedDays' THEN true
    WHEN pg_catalog.jsonb_typeof(p_config->'estimatedDays')<>'number' THEN false
    ELSE (p_config->>'estimatedDays')~'^[1-9][0-9]{0,2}$'
      AND (p_config->>'estimatedDays')::numeric BETWEEN 1 AND 365 END
  END
 ELSE saas.merchant_admin_config_valid_without_delivery_days(p_kind,p_config) END
$function$;
UPDATE saas.checkout_delivery_days_backup
SET migrated_definition=pg_catalog.pg_get_functiondef('saas.merchant_admin_config_valid(text,jsonb)'::regprocedure)
WHERE identity='saas.merchant_admin_config_valid(text,jsonb)';
COMMIT;
