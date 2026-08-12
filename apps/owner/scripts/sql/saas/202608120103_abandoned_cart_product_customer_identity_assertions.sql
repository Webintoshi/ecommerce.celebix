-- Catalog authority proofs for Phase 4U abandoned-cart product/customer identity.

DO $assertions$
DECLARE
  projection_definition text;
  list_definition text;
  mutation_definition text;
  compatibility_definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid='saas.abandoned_carts'::pg_catalog.regclass
      AND attribute.attname='customer_id' AND NOT attribute.attisdropped
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint constraint_info
    WHERE constraint_info.conrelid='saas.abandoned_carts'::pg_catalog.regclass
      AND constraint_info.conname='abandoned_carts_customer_store_fk'
      AND constraint_info.contype='f' AND constraint_info.convalidated
      AND constraint_info.confrelid='saas.customers'::pg_catalog.regclass
  ) THEN RAISE EXCEPTION 'ABANDONED_CART_PRODUCT_CUSTOMER_IDENTITY_BINDING_INVALID'; END IF;

  IF pg_catalog.to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_cart_mutate_without_customer_identity_v103(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_verified_customer_from_candidates(uuid,timestamp with time zone,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'ABANDONED_CART_PRODUCT_CUSTOMER_IDENTITY_FUNCTION_MISSING'; END IF;

  IF NOT pg_catalog.has_function_privilege(
      'celebix_saas_host_resolver',
      'saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_host_resolver',
      'saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_host_resolver',
      'saas.public_cart_mutate_without_customer_identity_v103(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_host_resolver',
      'saas.storefront_verified_customer_from_candidates(uuid,timestamp with time zone,jsonb)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'ABANDONED_CART_PRODUCT_CUSTOMER_IDENTITY_PRIVILEGE_INVALID'; END IF;

  projection_definition:=pg_catalog.pg_get_functiondef(
    'saas.abandoned_carts_projection(uuid,uuid)'::pg_catalog.regprocedure
  );
  list_definition:=pg_catalog.pg_get_functiondef(
    'saas.abandoned_carts_list_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::pg_catalog.regprocedure
  );
  mutation_definition:=pg_catalog.pg_get_functiondef(
    'saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb)'::pg_catalog.regprocedure
  );
  compatibility_definition:=pg_catalog.pg_get_functiondef(
    'saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)'::pg_catalog.regprocedure
  );

  IF pg_catalog.strpos(projection_definition,'''customerId''')=0
    OR pg_catalog.strpos(projection_definition,'''firstProductName''')=0
    OR pg_catalog.strpos(projection_definition,'ORDER BY item.position,item.id')=0
    OR pg_catalog.strpos(list_definition,'item.product_name ILIKE')=0
    OR pg_catalog.strpos(mutation_definition,'storefront_verified_customer_from_candidates')=0
    OR pg_catalog.strpos(mutation_definition,'customer.status=''active''')=0
    OR pg_catalog.strpos(mutation_definition,'sync_durable_abandoned_cart')=0
    OR pg_catalog.strpos(mutation_definition,'p_customer_credentials')=0
    OR pg_catalog.strpos(compatibility_definition,'''[]''::jsonb')=0
    OR pg_catalog.strpos(compatibility_definition,'public_cart_mutate')=0
  THEN RAISE EXCEPTION 'ABANDONED_CART_PRODUCT_CUSTOMER_IDENTITY_BODY_INVALID'; END IF;

  IF projection_definition~*'(credential_digest|key_id|p_customer_credentials)'
    OR list_definition~*'(credential_digest|key_id|p_customer_credentials)'
  THEN RAISE EXCEPTION 'ABANDONED_CART_PRODUCT_CUSTOMER_IDENTITY_PROJECTION_LEAK'; END IF;
END
$assertions$;
