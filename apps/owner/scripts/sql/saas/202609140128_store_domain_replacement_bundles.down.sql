-- Emergency rollback of replacement orchestration. Domain rows are deliberately retained.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $history_guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.store_domain_replacements)
     OR EXISTS(SELECT 1 FROM saas.store_domain_replacement_actions) THEN
    RAISE EXCEPTION 'STORE_DOMAIN_REPLACEMENT_DOWN_HISTORY_CONFLICT';
  END IF;
END
$history_guard$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_domain_make_primary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.admin_domains%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND store_id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.status<>'active' OR selected.verified_at IS NULL OR selected.hostname_status<>'active' OR selected.ssl_status<>'active' OR selected.dns_status<>'ready' OR selected.origin_status<>'ready' OR selected.last_provider_error_code IS NOT NULL OR selected.requested_removal THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>p_domain_id;
  UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'activated',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_domain_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.admin_domains%ROWTYPE; fallback_id uuid;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND store_id=p_store_id AND kind='custom_alias' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.canonical THEN
    SELECT id INTO fallback_id FROM saas.admin_domains WHERE store_id=p_store_id AND kind='platform_subdomain' AND status='active' AND verified_at<=p_now ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF fallback_id IS NULL THEN RETURN QUERY SELECT 'fallback_missing',NULL::jsonb; RETURN; END IF;
    UPDATE saas.admin_domains SET canonical=false WHERE id=p_domain_id;
    UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=fallback_id;
  END IF;
  UPDATE saas.admin_domains SET status='disabled',canonical=false,verified_at=NULL,requested_removal=true,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'disabled',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_store_domain_bundle_make_primary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_outcome text; selected_payload jsonb; companion_id uuid;
BEGIN
  SELECT result.outcome,result.result_payload INTO selected_outcome,selected_payload
    FROM saas.merchant_store_domain_make_primary(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_domain_id,p_expected_version) result;
  IF selected_outcome='activated' THEN
    SELECT id INTO companion_id FROM saas.admin_domains WHERE store_id=p_store_id AND source_storefront_domain_id=p_domain_id AND management='system'
      AND status='active' AND hostname_status='active' AND ssl_status='active' AND dns_status='ready' AND origin_status='ready'
      AND last_provider_error_code IS NULL AND NOT requested_removal FOR UPDATE;
    IF companion_id IS NOT NULL THEN
      UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>companion_id;
      UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=companion_id;
    END IF;
  END IF;
  RETURN QUERY SELECT selected_outcome,selected_payload;
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_store_domain_bundle_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_outcome text; selected_payload jsonb; companion_id uuid; companion_primary boolean; fallback_id uuid;
BEGIN
  SELECT id,canonical INTO companion_id,companion_primary FROM saas.admin_domains
    WHERE store_id=p_store_id AND source_storefront_domain_id=p_domain_id AND management='system' FOR UPDATE;
  SELECT result.outcome,result.result_payload INTO selected_outcome,selected_payload
    FROM saas.merchant_store_domain_disable(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_domain_id,p_expected_version) result;
  IF selected_outcome='disabled' AND companion_id IS NOT NULL THEN
    UPDATE saas.admin_domains SET status='disabled',canonical=false,verified_at=NULL,requested_removal=true,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE id=companion_id;
    IF companion_primary THEN
      SELECT id INTO fallback_id FROM saas.admin_domains WHERE store_id=p_store_id AND kind='platform_subdomain' AND status='active' ORDER BY created_at LIMIT 1 FOR UPDATE;
      IF fallback_id IS NULL THEN RAISE EXCEPTION 'ADMIN_FALLBACK_MISSING'; END IF;
      UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=fallback_id;
    END IF;
  END IF;
  RETURN QUERY SELECT selected_outcome,selected_payload;
END $f$;

DROP FUNCTION saas.merchant_store_domain_replacement_rollback(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_replacement_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_replacement_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.merchant_store_domain_replacement_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,uuid,text,text);
DROP FUNCTION saas.merchant_store_domain_replacement_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.store_domain_replacement_projection(uuid);
DROP TRIGGER store_domain_replacement_actions_immutable ON saas.store_domain_replacement_actions;
DROP TABLE saas.store_domain_replacement_actions;
DROP TRIGGER store_domain_replacements_guard ON saas.store_domain_replacements;
DROP FUNCTION saas.guard_store_domain_replacement();
DROP TABLE saas.store_domain_replacements;
COMMIT;
