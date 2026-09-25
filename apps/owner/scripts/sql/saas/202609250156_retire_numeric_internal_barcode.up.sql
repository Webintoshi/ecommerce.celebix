BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- Apply only after the customer panel has switched to the EAN-13 entrypoints.
DO $preflight$
BEGIN
  IF pg_catalog.to_regprocedure('saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'internal_ean13_entrypoints_required_before_numeric_retirement'; END IF;
END
$preflight$;

DROP FUNCTION saas.barcode_label_generate_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb);
DROP FUNCTION saas.barcode_label_reserve_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.barcode_label_next_numeric_internal(uuid,timestamptz);

-- Historical 97 values stay on products, so their uniqueness index remains.
COMMIT;
