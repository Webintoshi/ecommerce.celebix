-- Phase 3B2 quick-order link ownership, catalog, constraint, tenant authority and secret-boundary assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3b2_quick_order_link_assertions$
DECLARE
  checked_table text;
  checked_index text;
  checked_function regprocedure;
  constraint_definition text;
  constraint_catalog_fingerprint text;
  address_definition text := pg_catalog.pg_get_functiondef('saas.quick_link_address_is_valid(jsonb)'::regprocedure);
  base64url_definition text := pg_catalog.pg_get_functiondef('saas.quick_link_base64url_is_canonical(text)'::regprocedure);
  timestamp_definition text := pg_catalog.pg_get_functiondef('saas.quick_link_timestamp_is_canonical(text)'::regprocedure);
  envelope_definition text := pg_catalog.pg_get_functiondef('saas.quick_link_sealed_envelope_is_valid(jsonb,text)'::regprocedure);
  operation_result_definition text := pg_catalog.pg_get_functiondef('saas.quick_link_operation_result_is_valid(jsonb,uuid)'::regprocedure);
  image_function regprocedure := 'saas.quick_link_canonical_image_url(uuid,uuid,uuid)'::regprocedure;
  image_definition text := pg_catalog.pg_get_functiondef(image_function);
  provider_guard_definition text := pg_catalog.pg_get_functiondef('saas.guard_quick_link_provider_authority()'::regprocedure);
  authority_function regprocedure := 'saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)'::regprocedure;
  authority_definition text := pg_catalog.pg_get_functiondef(authority_function);
  merchant_definition text := pg_catalog.pg_get_functiondef('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure);
BEGIN
  FOREACH checked_table IN ARRAY ARRAY[
    'checkout_provider_configs','quick_order_links','quick_order_link_items','quick_order_link_operations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
      WHERE namespace.nspname = 'saas'
        AND relation.relname = checked_table
        AND relation.relkind = 'r'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND owner_role.rolname = 'celebix_saas_owner'
    ) THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: ownership/RLS drift on %', checked_table;
    END IF;

    IF EXISTS (
         SELECT 1
         FROM pg_catalog.pg_class AS relation,
              LATERAL pg_catalog.aclexplode(
                COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
              ) AS privilege
         WHERE relation.oid = ('saas.' || checked_table)::regclass
           AND privilege.grantee = 0
       )
       OR pg_catalog.has_table_privilege(
         'celebix_saas_app', 'saas.' || checked_table,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       ) THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: broad table privilege on %', checked_table;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policy
    WHERE polrelid = ANY (ARRAY[
      'saas.checkout_provider_configs'::regclass,
      'saas.quick_order_links'::regclass,
      'saas.quick_order_link_items'::regclass,
      'saas.quick_order_link_operations'::regclass
    ])
  ) <> 0 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: deny-by-default RLS policy drift';
  END IF;

  IF (
    SELECT pg_catalog.string_agg(
      column_name || ':' || data_type || ':' || is_nullable || ':' || COALESCE(column_default, ''),
      ',' ORDER BY ordinal_position
    )
    FROM information_schema.columns
    WHERE table_schema = 'saas' AND table_name = 'checkout_provider_configs'
  ) IS DISTINCT FROM
    'id:uuid:NO:,store_id:uuid:NO:,provider_key:text:NO:,status:text:NO:,public_origin:text:NO:,configuration_key_id:text:NO:,sealed_configuration:jsonb:NO:,version:bigint:NO:1,created_at:timestamp with time zone:NO:,updated_at:timestamp with time zone:NO:'
  THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: provider columns drift';
  END IF;

  IF (
    SELECT pg_catalog.string_agg(
      column_name || ':' || data_type || ':' || is_nullable || ':' || COALESCE(column_default, ''),
      ',' ORDER BY ordinal_position
    )
    FROM information_schema.columns
    WHERE table_schema = 'saas' AND table_name = 'quick_order_links'
  ) IS DISTINCT FROM
    'id:uuid:NO:,store_id:uuid:NO:,creating_membership_id:uuid:NO:,provider_config_id:uuid:NO:,status:text:NO:,token_digest:character:NO:,token_key_id:text:NO:,sealed_token:jsonb:NO:,customer_name:text:NO:,customer_email:text:NO:,customer_phone:text:YES:,shipping_address:jsonb:NO:,billing_address:jsonb:NO:,customer_note:text:YES:,internal_label:text:YES:,currency:text:NO:,subtotal_cents:bigint:NO:,shipping_cents:bigint:NO:,discount_cents:bigint:NO:,total_cents:bigint:NO:,expires_at:timestamp with time zone:NO:,opened_at:timestamp with time zone:YES:,paid_at:timestamp with time zone:YES:,cancelled_at:timestamp with time zone:YES:,order_id:uuid:YES:,version:bigint:NO:1,created_at:timestamp with time zone:NO:,updated_at:timestamp with time zone:NO:'
  THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: link columns drift';
  END IF;

  IF (
    SELECT pg_catalog.string_agg(
      column_name || ':' || data_type || ':' || is_nullable || ':' || COALESCE(column_default, ''),
      ',' ORDER BY ordinal_position
    )
    FROM information_schema.columns
    WHERE table_schema = 'saas' AND table_name = 'quick_order_link_items'
  ) IS DISTINCT FROM
    'id:uuid:NO:,store_id:uuid:NO:,quick_order_link_id:uuid:NO:,product_id:uuid:NO:,variant_id:uuid:NO:,position:integer:NO:,product_name:text:NO:,variant_name:text:YES:,sku:text:YES:,image_url:text:YES:,unit_price_cents:bigint:NO:,quantity:integer:NO:,line_total_cents:bigint:NO:,created_at:timestamp with time zone:NO:'
  THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: item columns drift';
  END IF;

  IF (
    SELECT pg_catalog.string_agg(
      column_name || ':' || data_type || ':' || is_nullable || ':' || COALESCE(column_default, ''),
      ',' ORDER BY ordinal_position
    )
    FROM information_schema.columns
    WHERE table_schema = 'saas' AND table_name = 'quick_order_link_operations'
  ) IS DISTINCT FROM
    'operation_id:uuid:NO:,store_id:uuid:NO:,quick_order_link_id:uuid:NO:,operation_kind:text:NO:,payload_fingerprint:character:NO:,result_payload:jsonb:NO:,committed_at:timestamp with time zone:NO:'
  THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: operation columns drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = ANY (ARRAY[
      'saas.checkout_provider_configs'::regclass,
      'saas.quick_order_links'::regclass,
      'saas.quick_order_link_items'::regclass,
      'saas.quick_order_link_operations'::regclass
    ])
      AND contype IN ('p','u','c')
  ) <> 49 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: exact check/unique count drift';
  END IF;

  SELECT pg_catalog.md5(pg_catalog.string_agg(
    relation.relname || ':' || constraint_record.conname || ':' || constraint_record.contype::text || ':' ||
      pg_catalog.pg_get_constraintdef(constraint_record.oid),
    E'\n' ORDER BY relation.relname, constraint_record.conname
  ))
    INTO constraint_catalog_fingerprint
  FROM pg_catalog.pg_constraint AS constraint_record
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_record.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'saas'
    AND relation.relname IN (
      'checkout_provider_configs','quick_order_links','quick_order_link_items','quick_order_link_operations'
    )
    AND constraint_record.contype IN ('p','u','c');

  IF constraint_catalog_fingerprint <> '37fcc3f0811b7fd0424ca861bfdf88ba' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: exact check/unique definitions drift: %', constraint_catalog_fingerprint;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO constraint_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'saas.quick_order_links'::regclass
    AND conname = 'quick_order_links_total_cents_check';
  IF constraint_definition !~ 'subtotal_cents >= 0'
     OR constraint_definition !~ '7999200000000000'
     OR constraint_definition !~ '500000000000000'
     OR constraint_definition !~ 'total_cents.*numeric.*='
     OR constraint_definition !~ 'subtotal_cents.*numeric.*\+.*shipping_cents.*numeric'
     OR constraint_definition !~ '-.*discount_cents.*numeric'
     OR constraint_definition !~ 'total_cents.*numeric'
     OR constraint_definition !~ 'subtotal_cents.*numeric'
     OR constraint_definition !~ 'shipping_cents.*numeric'
     OR constraint_definition !~ 'discount_cents.*numeric'
     OR constraint_definition !~ '8500000000000000' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: total money bounds drift: %', constraint_definition;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO constraint_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'saas.quick_order_link_items'::regclass
    AND conname = 'quick_order_link_items_line_total_check';
  IF constraint_definition !~ 'line_total_cents.*numeric.*='
     OR constraint_definition !~ 'unit_price_cents.*numeric.*\*.*quantity.*numeric'
     OR constraint_definition !~ 'line_total_cents >= 0'
     OR constraint_definition !~ '79992000000000'
     OR constraint_definition !~ 'line_total_cents.*numeric'
     OR constraint_definition !~ 'unit_price_cents.*numeric'
     OR constraint_definition !~ 'quantity.*numeric'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = 'saas.quick_order_link_items'::regclass
         AND conname = 'quick_order_link_items_unit_price_check'
         AND pg_catalog.pg_get_constraintdef(oid) ~ 'unit_price_cents >= 0'
         AND pg_catalog.pg_get_constraintdef(oid) ~ '8000000000'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = 'saas.quick_order_link_items'::regclass
         AND conname = 'quick_order_link_items_quantity_check'
         AND pg_catalog.pg_get_constraintdef(oid) = 'CHECK (((quantity >= 1) AND (quantity <= 9999)))'
     ) THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: item arithmetic bounds drift: %', constraint_definition;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO constraint_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'saas.quick_order_links'::regclass
    AND conname = 'quick_order_links_expiry_check';
  IF constraint_definition !~ '04:00:00'
     OR constraint_definition !~ '12:00:00'
     OR constraint_definition !~ '24:00:00'
     OR constraint_definition !~ '48:00:00'
     OR constraint_definition !~ '72:00:00' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: expiry set drift';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO constraint_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'saas.quick_order_links'::regclass
    AND conname = 'quick_order_links_lifecycle_check';
  IF constraint_definition !~ 'status = ''active'''
     OR constraint_definition !~ 'status = ''opened'''
     OR constraint_definition !~ 'status = ''paid'''
     OR constraint_definition !~ 'paid_at >= opened_at'
     OR constraint_definition !~ 'status = ''cancelled'''
     OR constraint_definition !~ 'status = ''expired'''
     OR constraint_definition !~ 'order_id IS NOT NULL' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: lifecycle drift';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO constraint_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'saas.quick_order_links'::regclass
    AND conname = 'quick_order_links_timestamp_check';
  IF constraint_definition !~ 'updated_at >= created_at'
     OR constraint_definition !~ 'updated_at >= COALESCE.opened_at, created_at.'
     OR constraint_definition !~ 'updated_at >= COALESCE.paid_at, created_at.'
     OR constraint_definition !~ 'updated_at >= COALESCE.cancelled_at, created_at.' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: timestamp authority drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_token_digest_check'
      AND pg_catalog.pg_get_constraintdef(oid) = 'CHECK ((token_digest ~ ''^[a-f0-9]{64}$''::text))'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_token_digest_key'
      AND pg_catalog.pg_get_constraintdef(oid) = 'UNIQUE (token_digest)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_shipping_address_check'
      AND pg_catalog.pg_get_constraintdef(oid) = 'CHECK (saas.quick_link_address_is_valid(shipping_address))'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_billing_address_check'
      AND pg_catalog.pg_get_constraintdef(oid) = 'CHECK (saas.quick_link_address_is_valid(billing_address))'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_sealed_token_check'
      AND pg_catalog.pg_get_constraintdef(oid) = 'CHECK (saas.quick_link_sealed_envelope_is_valid(sealed_token, token_key_id))'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.checkout_provider_configs'::regclass
      AND conname = 'checkout_provider_configs_sealed_check'
      AND pg_catalog.pg_get_constraintdef(oid) = 'CHECK (saas.quick_link_sealed_envelope_is_valid(sealed_configuration, configuration_key_id))'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_link_operations'::regclass
      AND conname = 'quick_order_link_operations_result_payload_check'
      AND pg_catalog.pg_get_constraintdef(oid) = 'CHECK (saas.quick_link_operation_result_is_valid(result_payload, quick_order_link_id))'
  ) THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: token/address/envelope/result constraint drift';
  END IF;

  IF address_definition !~ 'jsonb_typeof.candidate. <> ''object'''
     OR address_definition !~ 'recipientName.*phone.*line1.*city.*country'
     OR address_definition !~ 'line2.*district.*postalCode'
     OR address_definition !~ 'NOT BETWEEN 1 AND 300'
     OR address_definition !~ 'NOT BETWEEN 3 AND 32'
     OR address_definition !~ '\^\[A-Z\]\{2\}\$' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: exact address helper drift';
  END IF;

  IF pg_catalog.strpos(base64url_definition, 'candidate !~ ''^[A-Za-z0-9_-]+$''') = 0
     OR pg_catalog.strpos(base64url_definition, 'char_length(candidate) % 4 = 1') = 0
     OR pg_catalog.strpos(base64url_definition, 'translate(candidate, ''-_'', ''+/'')') = 0
     OR pg_catalog.strpos(base64url_definition, 'repeat(') = 0
     OR pg_catalog.strpos(base64url_definition, 'decode(padded, ''base64'')') = 0
     OR pg_catalog.strpos(base64url_definition, 'encode(decoded, ''base64'')') = 0
     OR pg_catalog.strpos(base64url_definition, 'E''+/=\n\r''') = 0
     OR pg_catalog.strpos(base64url_definition, 'canonical = candidate') = 0
     OR pg_catalog.strpos(base64url_definition, 'WHEN OTHERS') = 0 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: canonical base64url helper drift';
  END IF;

  IF pg_catalog.strpos(timestamp_definition, '(?:[0-9]{3}|[0-9]{6})Z$') = 0
     OR pg_catalog.strpos(timestamp_definition, 'candidate::timestamptz') = 0
     OR pg_catalog.strpos(timestamp_definition, 'AT TIME ZONE ''UTC''') = 0
     OR pg_catalog.strpos(timestamp_definition, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = 0
     OR pg_catalog.strpos(timestamp_definition, 'WHEN OTHERS') = 0 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: canonical timestamp helper drift';
  END IF;

  IF pg_catalog.strpos(envelope_definition, 'pg_column_size(candidate) <= 12288') = 0
     OR envelope_definition !~ 'algorithm.*ciphertext.*iv.*keyId.*tag.*version'
     OR envelope_definition !~ 'A256GCM'
     OR pg_catalog.strpos(envelope_definition, '{16}') = 0
     OR pg_catalog.strpos(envelope_definition, '{22}') = 0
     OR pg_catalog.strpos(envelope_definition, 'char_length(candidate->>''ciphertext'') BETWEEN 1 AND 8192') = 0
     OR pg_catalog.strpos(envelope_definition, 'quick_link_base64url_is_canonical(candidate->>''iv'')') = 0
     OR pg_catalog.strpos(envelope_definition, 'quick_link_base64url_is_canonical(candidate->>''tag'')') = 0
     OR pg_catalog.strpos(envelope_definition, 'quick_link_base64url_is_canonical(candidate->>''ciphertext'')') = 0
     OR pg_catalog.strpos(envelope_definition, 'candidate->>''keyId'' = expected_key_id') = 0 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: exact sealed-envelope helper drift: %', envelope_definition;
  END IF;

  IF pg_catalog.strpos(operation_result_definition, 'pg_column_size(candidate) <= 32768') = 0
     OR pg_catalog.strpos(operation_result_definition, 'id'',''status'',''version'',''expiresAt'',''updatedAt') = 0
     OR pg_catalog.strpos(operation_result_definition, 'jsonb_object_keys(candidate)') = 0
     OR pg_catalog.strpos(operation_result_definition, 'candidate->>''id'' = expected_link_id::text') = 0
     OR pg_catalog.strpos(operation_result_definition, 'active'',''opened'',''paid'',''cancelled'',''expired') = 0
     OR pg_catalog.strpos(operation_result_definition, '^[1-9][0-9]{0,18}$') = 0
     OR pg_catalog.strpos(operation_result_definition, '9223372036854775807') = 0
     OR pg_catalog.strpos(operation_result_definition, 'quick_link_timestamp_is_canonical(candidate->>''expiresAt'')') = 0
     OR pg_catalog.strpos(operation_result_definition, 'quick_link_timestamp_is_canonical(candidate->>''updatedAt'')') = 0 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: exact operation result descriptor drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = ANY (ARRAY[
      'saas.checkout_provider_configs'::regclass,
      'saas.quick_order_links'::regclass,
      'saas.quick_order_link_items'::regclass,
      'saas.quick_order_link_operations'::regclass
    ])
      AND contype = 'f'
  ) <> 8 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: FK count drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.product_variants'::regclass
      AND conname = 'product_variants_store_product_id_key'
      AND pg_catalog.pg_get_constraintdef(oid) = 'UNIQUE (store_id, product_id, id)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.checkout_provider_configs'::regclass
      AND conname = 'checkout_provider_configs_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id) REFERENCES saas.stores(id)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_link_items'::regclass
      AND conname = 'quick_order_link_items_variant_product_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, product_id, variant_id) REFERENCES saas.product_variants(store_id, product_id, id)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_store_currency_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, currency) REFERENCES saas.stores(id, currency)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_creator_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, creating_membership_id) REFERENCES saas.memberships(store_id, id)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_provider_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, provider_config_id) REFERENCES saas.checkout_provider_configs(store_id, id)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_links'::regclass
      AND conname = 'quick_order_links_order_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, order_id) REFERENCES saas.orders(store_id, id)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_link_items'::regclass
      AND conname = 'quick_order_link_items_link_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, quick_order_link_id) REFERENCES saas.quick_order_links(store_id, id)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.quick_order_link_operations'::regclass
      AND conname = 'quick_order_link_operations_link_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, quick_order_link_id) REFERENCES saas.quick_order_links(store_id, id)'
  ) THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: composite store authority drift';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
       WHERE procedure.oid = image_function
         AND owner_role.rolname = 'celebix_saas_owner'
         AND procedure.provolatile = 's'
         AND procedure.prosecdef
         AND procedure.proisstrict
         AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     )
     OR pg_catalog.has_function_privilege('public', image_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app', image_function, 'EXECUTE')
     OR pg_catalog.strpos(image_definition, 'FROM saas.product_media AS media') = 0
     OR pg_catalog.strpos(image_definition, 'media.store_id = p_store_id') = 0
     OR pg_catalog.strpos(image_definition, 'media.product_id = p_product_id') = 0
     OR pg_catalog.strpos(image_definition, 'media.status = ''active''') = 0
     OR pg_catalog.strpos(image_definition, 'media.variant_id = p_variant_id OR media.variant_id IS NULL') = 0
     OR pg_catalog.strpos(image_definition, 'ORDER BY (media.variant_id = p_variant_id) DESC NULLS LAST, media.sort_order ASC, media.id ASC') = 0
     OR pg_catalog.strpos(image_definition, 'LIMIT 1') = 0
     OR pg_catalog.to_regclass('saas.product_media_product_status_order_idx') IS NULL THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: executable canonical product_media source drift';
  END IF;

  FOREACH checked_index IN ARRAY ARRAY[
    'checkout_provider_configs_store_status_idx',
    'quick_order_links_store_status_expiry_idx',
    'quick_order_links_token_digest_idx',
    'quick_order_link_items_link_position_idx',
    'quick_order_link_operations_store_committed_idx'
  ] LOOP
    IF pg_catalog.to_regclass('saas.' || checked_index) IS NULL THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: bounded index missing: %', checked_index;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.quick_order_link_operations'::regclass
      AND tgname = 'quick_order_link_operations_immutable'
      AND NOT tgisinternal
      AND (tgtype & 2) = 2
      AND (tgtype & 8) = 8
      AND (tgtype & 16) = 16
      AND tgfoid = 'saas.guard_quick_link_operation_mutation()'::regprocedure
  )
  OR pg_catalog.pg_get_functiondef('saas.guard_quick_link_operation_mutation()'::regprocedure)
     !~ 'QUICK_LINK_OPERATION_IMMUTABLE' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: operation immutability drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.quick_order_links'::regclass
      AND tgname = 'quick_order_links_provider_authority'
      AND NOT tgisinternal
      AND tgfoid = 'saas.guard_quick_link_provider_authority()'::regprocedure
  )
  OR provider_guard_definition !~ 'store[.]status = ''active'''
  OR provider_guard_definition !~ 'provider[.]status = ''active'''
  OR provider_guard_definition !~ 'provider[.]provider_key = ''paytr'''
  OR provider_guard_definition !~ 'provider[.]store_id = store[.]id' THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: active provider/store guard drift';
  END IF;

  FOREACH checked_function IN ARRAY ARRAY[
    'saas.quick_link_address_is_valid(jsonb)'::regprocedure,
    'saas.quick_link_base64url_is_canonical(text)'::regprocedure,
    'saas.quick_link_timestamp_is_canonical(text)'::regprocedure,
    'saas.quick_link_sealed_envelope_is_valid(jsonb,text)'::regprocedure,
    image_function,
    'saas.quick_link_operation_result_is_valid(jsonb,uuid)'::regprocedure,
    'saas.guard_quick_link_provider_authority()'::regprocedure,
    'saas.guard_quick_link_operation_mutation()'::regprocedure,
    authority_function
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = checked_function
        AND owner_role.rolname = 'celebix_saas_owner'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    )
    OR pg_catalog.has_function_privilege('public', checked_function, 'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app', checked_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: function owner/search_path/ACL drift on %', checked_function;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc
    WHERE oid = ANY (ARRAY[
      'saas.quick_link_address_is_valid(jsonb)'::regprocedure,
      'saas.quick_link_base64url_is_canonical(text)'::regprocedure,
      'saas.quick_link_timestamp_is_canonical(text)'::regprocedure,
      'saas.quick_link_sealed_envelope_is_valid(jsonb,text)'::regprocedure,
      'saas.quick_link_operation_result_is_valid(jsonb,uuid)'::regprocedure
    ])
      AND provolatile = 'i'
      AND proisstrict
  ) <> 5 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: immutable strict validation helper drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc
    WHERE oid = authority_function
      AND prosecdef
      AND provolatile = 's'
  )
  OR pg_catalog.has_function_privilege('celebix_saas_app', authority_function, 'EXECUTE')
  OR pg_catalog.strpos(authority_definition, 'p_required_action NOT IN (''quick_links.read'',''quick_links.manage'')') = 0
  OR pg_catalog.strpos(authority_definition, 'WHEN ''quick_links.read'' THEN ''orders.read''') = 0
  OR pg_catalog.strpos(authority_definition, 'WHEN ''quick_links.manage'' THEN ''orders.manage''') = 0
  OR pg_catalog.strpos(authority_definition, 'merchant_action_authority_error(') = 0
  OR pg_catalog.strpos(authority_definition, '''orders'',') = 0
  OR pg_catalog.strpos(authority_definition, 'mapped_action') = 0
  OR pg_catalog.strpos(authority_definition, 'authority_error IS NOT NULL') = 0
  OR pg_catalog.strpos(authority_definition, 'FROM saas.plan_features AS feature') = 0
  OR pg_catalog.strpos(authority_definition, 'feature.enabled') = 0
  OR pg_catalog.strpos(authority_definition, 'ORDER BY feature.feature_ordinal') = 0
  OR pg_catalog.strpos(authority_definition, 'enabled_feature.feature_key = ''checkout''') = 0
  OR pg_catalog.strpos(merchant_definition, 'FROM saas.plan_features AS feature') = 0
  OR pg_catalog.strpos(merchant_definition, 'enabled_feature.feature_key = p_required_feature') = 0
  OR pg_catalog.strpos(merchant_definition, 'ORDER BY feature.feature_ordinal') = 0 THEN
    RAISE EXCEPTION 'PHASE3B2_QUICK_LINK_ASSERTION_FAILED: exact action mapping or dual-feature authority drift';
  END IF;
END
$phase3b2_quick_order_link_assertions$;

COMMIT;
