BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$ BEGIN
  IF EXISTS(SELECT 1 FROM saas.barcode_label_templates) OR EXISTS(SELECT 1 FROM saas.barcode_print_jobs) OR EXISTS(SELECT 1 FROM saas.barcode_label_operations) OR EXISTS(SELECT 1 FROM saas.product_variants WHERE barcode LIKE 'CXI-%') THEN
    RAISE EXCEPTION 'barcode_label_studio_down_blocked_data_exists';
  END IF;
END $f$;
DROP FUNCTION saas.barcode_print_job_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.barcode_print_job_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb);
DROP FUNCTION saas.barcode_label_ean13_valid(text);
DROP FUNCTION saas.barcode_label_code128_modules(text);
DROP FUNCTION saas.barcode_label_generate_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb);
DROP FUNCTION saas.barcode_label_template_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint);
DROP FUNCTION saas.barcode_label_template_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,jsonb,boolean);
DROP FUNCTION saas.barcode_label_template_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,integer,uuid);
DROP FUNCTION saas.barcode_print_job_projection(uuid,uuid);
DROP FUNCTION saas.barcode_label_template_projection(uuid,uuid);
DROP FUNCTION saas.barcode_label_variant_projection(uuid,uuid);
DROP FUNCTION saas.barcode_label_template_config_valid(jsonb);
DROP FUNCTION saas.barcode_label_timestamp(timestamptz);
DROP TABLE saas.barcode_label_operations;
DROP TABLE saas.barcode_label_sequences;
DROP TABLE saas.barcode_print_job_items;
DROP TABLE saas.barcode_print_jobs;
DROP TABLE saas.barcode_label_templates;
DROP INDEX saas.product_variants_store_internal_barcode_key;
COMMIT;
