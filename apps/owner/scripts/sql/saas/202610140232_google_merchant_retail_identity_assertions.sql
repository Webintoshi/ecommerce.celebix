BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $accept$ DECLARE tab text;BEGIN
 IF NOT saas.google_merchant_gtin_valid('4006381333931') OR NOT saas.google_merchant_gtin_valid('04006381333931') OR saas.google_merchant_gtin_valid('4006381333932') OR saas.google_merchant_gtin_valid('9800000000004') OR saas.google_merchant_gtin_valid('09800000000004') THEN RAISE EXCEPTION 'MERCHANT232_GTIN_GATE';END IF;
 IF saas.google_merchant_identity_profile('00000000-0000-4000-8000-000000000000')<>'{"ownBrand":false,"brandName":null,"version":0}'::jsonb THEN RAISE EXCEPTION 'MERCHANT232_UNSEEDED_IDENTITY_GATE';END IF;
 IF has_function_privilege('celebix_saas_app','saas.google_merchant_public_product_identifiers(uuid,uuid,timestamptz)','EXECUTE') OR has_function_privilege('celebix_saas_workflow','saas.google_merchant_public_product_identifiers(uuid,uuid,timestamptz)','EXECUTE') OR NOT has_function_privilege('celebix_saas_host_resolver','saas.google_merchant_public_product_identifiers(uuid,uuid,timestamptz)','EXECUTE') OR has_function_privilege('celebix_saas_host_resolver','saas.google_merchant_variant_identifiers(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT232_PUBLIC_AUTHORITY_GATE';END IF;
 FOREACH tab IN ARRAY ARRAY['google_merchant_identity_profiles','google_merchant_catalog_revisions','google_merchant_catalog_batches'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity) OR has_table_privilege('celebix_saas_app','saas.'||tab,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_host_resolver','saas.'||tab,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'MERCHANT232_PRIVATE_STORAGE_GATE';END IF;
 END LOOP;
 IF position('dynamic_price_unsupported' IN pg_get_functiondef('saas.google_merchant_projection(uuid,uuid,timestamptz)'::regprocedure))>0 OR position('unsupported_bullion' IN pg_get_functiondef('saas.google_merchant_projection(uuid,uuid,timestamptz)'::regprocedure))=0 THEN RAISE EXCEPTION 'MERCHANT232_RETAIL_SCOPE_GATE';END IF;
 IF position('google_merchant_delivery_control' IN pg_get_functiondef('saas.google_merchant_claim(timestamptz,integer,uuid)'::regprocedure))=0 OR position('lease_catalog_revision' IN pg_get_functiondef('saas.google_merchant_finish(uuid,uuid,bigint,bigint,uuid,timestamptz,text,text,jsonb)'::regprocedure))=0 THEN RAISE EXCEPTION 'MERCHANT232_DELIVERY_FENCE_GATE';END IF;
END $accept$;
ROLLBACK;
