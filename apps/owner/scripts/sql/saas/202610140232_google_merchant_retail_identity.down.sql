-- Do not silently remove reference-delivery fencing or a used manufacturer declaration.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
DO $unused$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.google_merchant_identity_profiles)
  OR EXISTS(SELECT 1 FROM saas.google_merchant_catalog_revisions WHERE revision>0)
  OR EXISTS(SELECT 1 FROM saas.google_merchant_outbox WHERE lease_catalog_revision IS NOT NULL)
  OR EXISTS(SELECT 1 FROM saas.google_merchant_outbox WHERE last_submitted_at>=(SELECT min(installed_at) FROM saas.google_merchant_232_backup))
 THEN RAISE EXCEPTION 'MERCHANT232_ROLLBACK_REQUIRES_UNUSED_AUTOMATION';END IF;
END $unused$;
DROP TRIGGER google_merchant_reference_changed ON saas.pricing_reference_state;
DROP TRIGGER google_merchant_dynamic_activation_changed ON saas.pricing_dynamic_activation;
DROP TRIGGER google_merchant_identity_changed ON saas.google_merchant_identity_profiles;
DO $restore$ DECLARE entry record;BEGIN FOR entry IN SELECT * FROM saas.google_merchant_232_backup LOOP EXECUTE entry.definition;END LOOP;END $restore$;
DROP FUNCTION saas.google_merchant_public_product_identifiers(uuid,uuid,timestamptz),saas.google_merchant_command_before_retail_identity(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.google_merchant_identity_profile(uuid),saas.google_merchant_editable_attributes(jsonb),saas.google_merchant_variant_identifiers(uuid,uuid),saas.google_merchant_catalog_changed(),saas.google_merchant_advance_catalog_batches(timestamptz);
ALTER TABLE saas.google_merchant_outbox DROP COLUMN lease_catalog_revision;
DROP TABLE saas.google_merchant_catalog_batches,saas.google_merchant_catalog_revisions,saas.google_merchant_identity_profiles,saas.google_merchant_232_backup;
COMMIT;
