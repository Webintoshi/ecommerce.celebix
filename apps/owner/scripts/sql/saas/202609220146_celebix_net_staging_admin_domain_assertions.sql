DO $celebix_net_staging_admin_domain_assertions$
DECLARE
  definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'saas.provision_canonical_admin_domain(uuid,uuid,text,timestamp with time zone)'::regprocedure
  ) INTO definition;

  IF definition IS NULL
     OR definition !~ 'selected_store.slug \|\| ''.admin.celebix.site'''
     OR definition !~ 'selected_store.slug \|\| ''.admin.saas-staging.celebix.site'''
     OR definition !~ 'selected_store.slug \|\| ''.admin.saas-staging.celebix.net'''
     OR definition !~ 'existing.id <> p_domain_id'
     OR definition !~ 'admin_domain_conflict'
     OR NOT pg_catalog.has_function_privilege(
       'celebix_saas_bootstrap',
       'saas.provision_canonical_admin_domain(uuid,uuid,text,timestamp with time zone)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'CELEBIX_NET_STAGING_ADMIN_DOMAIN_ASSERTION_FAILED';
  END IF;
END
$celebix_net_staging_admin_domain_assertions$;
