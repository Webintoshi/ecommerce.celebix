BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.public_starter_product_detail_v2(uuid,text,timestamptz,text);
COMMIT;
