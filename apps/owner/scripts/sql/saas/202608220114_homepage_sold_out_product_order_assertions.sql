BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $homepage_sold_out_product_order_assertions$
DECLARE
  home_oid oid:=pg_catalog.to_regprocedure('saas.public_starter_retail_home(uuid,text,timestamp with time zone)');
  definition text;
  owner_oid oid:='celebix_saas_owner'::pg_catalog.regrole;
  host_resolver_oid oid:='celebix_saas_host_resolver'::pg_catalog.regrole;
  role_name text;
BEGIN
  IF home_oid IS NULL THEN
    RAISE EXCEPTION 'HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_FUNCTION_MISSING';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(home_oid) INTO definition;

  IF pg_catalog.strpos(definition,$$pg_catalog.jsonb_array_elements(items) WITH ORDINALITY AS ordered(value,ordinality)$$)=0
     OR pg_catalog.strpos(definition,$$pg_catalog.jsonb_agg(ordered.value ORDER BY COALESCE((ordered.value->>'available')::boolean,false) DESC,ordered.ordinality)$$)=0
  THEN
    RAISE EXCEPTION 'HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_MISSING';
  END IF;

  IF pg_catalog.strpos(definition,$$result.outcome<>'found' OR items IS NULL$$)=0
     OR pg_catalog.strpos(definition,$$pg_catalog.jsonb_agg(ordered.value ORDER BY COALESCE((ordered.value->>'available')::boolean,false) DESC,ordered.ordinality)$$)
        < pg_catalog.strpos(definition,$$result.outcome<>'found' OR items IS NULL$$)
  THEN
    RAISE EXCEPTION 'HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_INVALID';
  END IF;

  IF pg_catalog.strpos(definition,$$WHERE COALESCE((ordered.value->>'available')::boolean,false)$$)>0
     OR pg_catalog.strpos(definition,$$WHERE COALESCE((filtered.value->>'available')::boolean,false)$$)>0
  THEN
    RAISE EXCEPTION 'HOMEPAGE_SOLD_OUT_PRODUCT_FILTER_FORBIDDEN';
  END IF;

  IF NOT pg_catalog.has_function_privilege(host_resolver_oid,home_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_HOST_RESOLVER_ACL_MISSING';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=home_oid
      AND (
        privilege.grantee NOT IN (owner_oid,host_resolver_oid)
        OR privilege.privilege_type<>'EXECUTE'
        OR privilege.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_ACL_INVALID';
  END IF;

  FOR role_name IN SELECT value FROM (VALUES
    ('public'),('celebix_saas_identity'),('celebix_saas_app'),('celebix_saas_workflow'),
    ('celebix_saas_bootstrap'),('celebix_saas_observability'),('celebix_saas_migrator')
  ) roles(value)
  LOOP
    IF pg_catalog.has_function_privilege(role_name,home_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_UNEXPECTED_ACL';
    END IF;
  END LOOP;
END
$homepage_sold_out_product_order_assertions$;

COMMIT;
