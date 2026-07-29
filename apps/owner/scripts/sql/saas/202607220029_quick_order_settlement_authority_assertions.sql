BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE attempt_projection regprocedure; reconciliation_projection regprocedure;
  attempt_source text; reconciliation_source text; selected_role text;
BEGIN
  attempt_projection:=pg_catalog.to_regprocedure('saas.quick_checkout_attempt_authority_projection(uuid)');
  reconciliation_projection:=pg_catalog.to_regprocedure('saas.quick_checkout_reconciliation_projection(uuid,uuid,text,integer)');
  IF attempt_projection IS NULL OR reconciliation_projection IS NULL THEN
    RAISE EXCEPTION 'PHASE3B2_SETTLEMENT_AUTHORITY_ASSERTION_FAILED: missing function';
  END IF;
  SELECT procedure.prosrc INTO attempt_source FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    WHERE procedure.oid=attempt_projection AND owner.rolname='celebix_saas_owner'
      AND NOT procedure.prosecdef AND procedure.provolatile='s'
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[];
  SELECT procedure.prosrc INTO reconciliation_source FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    WHERE procedure.oid=reconciliation_projection AND owner.rolname='celebix_saas_owner'
      AND NOT procedure.prosecdef AND procedure.provolatile='s'
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[];
  IF attempt_source IS NULL
     OR pg_catalog.strpos(attempt_source,'''itemCount''')=0
     OR pg_catalog.strpos(attempt_source,'quick_order_link_items')=0
     OR pg_catalog.strpos(attempt_source,'item.store_id=attempt.store_id')=0
     OR pg_catalog.strpos(attempt_source,'item.quick_order_link_id=attempt.quick_order_link_id')=0
     OR pg_catalog.strpos(attempt_source,'count(*)')=0 THEN
    RAISE EXCEPTION 'PHASE3B2_SETTLEMENT_AUTHORITY_ASSERTION_FAILED: item cardinality source';
  END IF;
  IF reconciliation_source IS NULL
     OR pg_catalog.strpos(reconciliation_source,'quick_checkout_attempt_authority_projection')=0
     OR pg_catalog.strpos(reconciliation_source,'''leaseToken''')=0
     OR pg_catalog.strpos(reconciliation_source,'''attemptNumber''')=0
     OR pg_catalog.strpos(reconciliation_source,'''workerId''')<>0 THEN
    RAISE EXCEPTION 'PHASE3B2_SETTLEMENT_AUTHORITY_ASSERTION_FAILED: reconciliation projection';
  END IF;
  FOREACH selected_role IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'] LOOP
    IF pg_catalog.has_function_privilege(selected_role,attempt_projection,'EXECUTE')
       OR pg_catalog.has_function_privilege(selected_role,reconciliation_projection,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B2_SETTLEMENT_AUTHORITY_ASSERTION_FAILED: private ACL %',selected_role;
    END IF;
  END LOOP;
END
$assertions$;
COMMIT;
