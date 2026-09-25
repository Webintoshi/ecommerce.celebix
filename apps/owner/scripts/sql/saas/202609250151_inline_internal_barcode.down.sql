BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$ BEGIN
  IF EXISTS(SELECT 1 FROM saas.barcode_label_operations WHERE operation_kind='reserve_internal') THEN
    RAISE EXCEPTION 'inline_internal_barcode_reservations_must_be_cleared_before_downgrade';
  END IF;
END $guard$;
DROP FUNCTION saas.barcode_label_reserve_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
ALTER TABLE saas.barcode_label_operations DROP CONSTRAINT barcode_label_operations_operation_kind_check;
ALTER TABLE saas.barcode_label_operations ADD CONSTRAINT barcode_label_operations_operation_kind_check
  CHECK (operation_kind IN ('save_template','archive_template','generate_internal','create_job'));
COMMIT;
