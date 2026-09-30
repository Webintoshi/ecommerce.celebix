BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.merchant_product_images(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb);
COMMIT;
