-- State-preserving backoff for transient storefront and admin-domain reconciliation failures.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF pg_catalog.to_regprocedure('saas.store_domain_work_complete(uuid,uuid,text,timestamp with time zone,text,text,text,text,text,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.admin_domain_work_complete(uuid,uuid,text,timestamp with time zone,text,text,text,text,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'DOMAIN_RECONCILIATION_DEFER_PRECONDITION_FAILED';
  END IF;
END
$precondition$;

CREATE FUNCTION saas.store_domain_work_defer(
  p_domain_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz,p_retry_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected saas.store_domain_provisioning%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM saas.store_domain_provisioning WHERE domain_id=p_domain_id FOR UPDATE;
  IF selected.domain_id IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.lease_id IS DISTINCT FROM p_lease_id OR selected.lease_owner IS DISTINCT FROM p_worker_id
     OR selected.lease_expires_at<p_now THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_retry_at IS NULL OR NOT pg_catalog.isfinite(p_retry_at)
     OR p_retry_at<=p_now OR p_retry_at>p_now+interval '24 hours' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.store_domain_provisioning SET
    attempt_count=greatest(attempt_count-1,0),next_check_at=p_retry_at,last_checked_at=p_now,
    lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now,version=version+1
  WHERE domain_id=p_domain_id;
  RETURN QUERY SELECT 'retry_scheduled'::text,saas.store_domain_projection(p_domain_id);
END
$function$;

CREATE FUNCTION saas.admin_domain_work_defer(
  p_domain_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz,p_retry_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected saas.admin_domains%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND kind='custom_alias' FOR UPDATE;
  IF selected.id IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.lease_id IS DISTINCT FROM p_lease_id OR selected.lease_owner IS DISTINCT FROM p_worker_id
     OR selected.lease_expires_at<p_now THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_retry_at IS NULL OR NOT pg_catalog.isfinite(p_retry_at)
     OR p_retry_at<=p_now OR p_retry_at>p_now+interval '24 hours' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.admin_domains SET
    attempt_count=greatest(attempt_count-1,0),next_check_at=p_retry_at,last_checked_at=p_now,
    lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now,version=version+1
  WHERE id=p_domain_id;
  RETURN QUERY SELECT 'retry_scheduled'::text,saas.admin_domain_projection(p_domain_id);
END
$function$;

REVOKE ALL ON FUNCTION saas.store_domain_work_defer(uuid,uuid,text,timestamptz,timestamptz),
  saas.admin_domain_work_defer(uuid,uuid,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.store_domain_work_defer(uuid,uuid,text,timestamptz,timestamptz),
  saas.admin_domain_work_defer(uuid,uuid,text,timestamptz,timestamptz) TO celebix_saas_workflow;

COMMIT;
