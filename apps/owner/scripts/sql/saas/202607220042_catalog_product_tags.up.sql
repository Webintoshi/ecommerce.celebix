-- Extend the existing catalog-admin resource authority with product tags.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.catalog_admin_resources
  DROP CONSTRAINT catalog_admin_resources_resource_kind_check,
  ADD CONSTRAINT catalog_admin_resources_resource_kind_check
    CHECK (
      resource_kind = ANY (
        ARRAY['collection','brand','attribute','extra','definition','tag']::text[]
      )
    );

CREATE OR REPLACE FUNCTION saas.catalog_admin_list_resources(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_kind text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE e text;
BEGIN
  e:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','catalog_admin.read'
  );
  IF e IS NOT NULL THEN
    RETURN QUERY SELECT e,NULL::jsonb;
    RETURN;
  END IF;
  IF NOT (
    p_kind = ANY (
      ARRAY['collection','brand','attribute','extra','definition','tag']::text[]
    )
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    'listed',
    pg_catalog.jsonb_build_object(
      'items',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            saas.catalog_admin_resource_projection(p_store_id,r.id)
            ORDER BY r.updated_at DESC,r.id DESC
          )
          FROM (
            SELECT id,updated_at
            FROM saas.catalog_admin_resources
            WHERE store_id=p_store_id AND resource_kind=p_kind
            ORDER BY updated_at DESC,id DESC
            LIMIT 200
          ) r
        ),
        '[]'::jsonb
      )
    );
END
$f$;

CREATE OR REPLACE FUNCTION saas.catalog_admin_save_resource(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_resource_id uuid,
  p_expected_version bigint,
  p_kind text,
  p_name text,
  p_slug text,
  p_description text,
  p_config jsonb,
  p_product_ids uuid[]
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  e text;
  op saas.catalog_admin_operations%ROWTYPE;
  current_resource saas.catalog_admin_resources%ROWTYPE;
  result jsonb;
BEGIN
  e:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','catalog_admin.manage'
  );
  IF e IS NOT NULL THEN
    RETURN QUERY SELECT e,NULL::jsonb;
    RETURN;
  END IF;

  SELECT *
  INTO op
  FROM saas.catalog_admin_operations
  WHERE operation_id=p_operation_id AND store_id=p_store_id;
  IF FOUND THEN
    IF op.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',op.result_payload;
    END IF;
    RETURN;
  END IF;

  IF
    p_fingerprint!~'^[a-f0-9]{64}$'
    OR NOT (
      p_kind = ANY (
        ARRAY['collection','brand','attribute','extra','definition','tag']::text[]
      )
    )
    OR p_name IS NULL
    OR p_name<>pg_catalog.btrim(p_name)
    OR pg_catalog.char_length(p_name) NOT BETWEEN 1 AND 120
    OR p_name~'[[:cntrl:]]'
    OR p_slug IS NULL
    OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$'
    OR pg_catalog.char_length(p_slug)>120
    OR (
      p_description IS NOT NULL
      AND (
        p_description<>pg_catalog.btrim(p_description)
        OR pg_catalog.char_length(p_description) NOT BETWEEN 1 AND 2000
        OR p_description~'[[:cntrl:]]'
      )
    )
    OR pg_catalog.jsonb_typeof(p_config)<>'object'
    OR pg_catalog.pg_column_size(p_config)>8192
    OR COALESCE(pg_catalog.array_length(p_product_ids,1),0)>100
    OR COALESCE(pg_catalog.array_length(p_product_ids,1),0)
      <>COALESCE(
        (
          SELECT pg_catalog.count(DISTINCT product_id)
          FROM pg_catalog.unnest(p_product_ids) AS product_ids(product_id)
        ),
        0
      )
    OR EXISTS(
      SELECT 1
      FROM pg_catalog.unnest(p_product_ids) AS product_ids(product_id)
      WHERE NOT EXISTS(
        SELECT 1
        FROM saas.products p
        WHERE
          p.store_id=p_store_id
          AND p.id=product_ids.product_id
          AND p.status<>'archived'
      )
    )
  THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  SELECT *
  INTO current_resource
  FROM saas.catalog_admin_resources
  WHERE store_id=p_store_id AND id=p_resource_id
  FOR UPDATE;
  IF FOUND THEN
    IF current_resource.resource_kind<>p_kind THEN
      RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;
      RETURN;
    END IF;
    IF
      p_expected_version IS NULL
      OR current_resource.version<>p_expected_version
      OR current_resource.status<>'active'
    THEN
      RETURN QUERY
      SELECT
        CASE
          WHEN current_resource.status<>'active' THEN 'invalid_transition'
          ELSE 'version_conflict'
        END,
        NULL::jsonb;
      RETURN;
    END IF;
    UPDATE saas.catalog_admin_resources
    SET
      name=p_name,
      slug=p_slug,
      description=p_description,
      config=p_config,
      version=version+1,
      updated_at=p_now
    WHERE store_id=p_store_id AND id=p_resource_id;
  ELSE
    IF p_expected_version IS NOT NULL THEN
      RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;
      RETURN;
    END IF;
    BEGIN
      INSERT INTO saas.catalog_admin_resources(
        id,store_id,resource_kind,name,slug,description,config,status,version,
        created_at,updated_at
      )
      VALUES(
        p_resource_id,p_store_id,p_kind,p_name,p_slug,p_description,p_config,
        'active',1,p_now,p_now
      );
    EXCEPTION
      WHEN unique_violation THEN
        RETURN QUERY SELECT 'slug_conflict',NULL::jsonb;
        RETURN;
    END;
  END IF;

  DELETE FROM saas.catalog_admin_resource_products
  WHERE store_id=p_store_id AND resource_id=p_resource_id;
  INSERT INTO saas.catalog_admin_resource_products(
    store_id,resource_id,product_id,position
  )
  SELECT p_store_id,p_resource_id,id,ordinality-1
  FROM pg_catalog.unnest(p_product_ids) WITH ORDINALITY x(id,ordinality);

  SELECT saas.catalog_admin_mutation_projection(
    r.id,r.version,r.status,r.updated_at
  )
  INTO result
  FROM saas.catalog_admin_resources r
  WHERE r.store_id=p_store_id AND r.id=p_resource_id;
  INSERT INTO saas.catalog_admin_operations
  VALUES(
    p_operation_id,p_store_id,'save_resource',p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT 'saved',result;
END
$f$;

COMMIT;
