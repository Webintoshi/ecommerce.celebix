-- Self-declared signup names are profile data, never authentication or role evidence.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.merchant_signup_profiles(
 principal_id uuid PRIMARY KEY REFERENCES saas.principals(id),
 first_name text NOT NULL CHECK(first_name=btrim(first_name) AND length(first_name) BETWEEN 1 AND 100 AND first_name!~'[[:cntrl:]]'),
 last_name text NOT NULL CHECK(last_name=btrim(last_name) AND length(last_name) BETWEEN 1 AND 100 AND last_name!~'[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.merchant_signup_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_signup_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.merchant_signup_profiles FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_platform_operator,celebix_saas_observability;
CREATE FUNCTION saas.merchant_whatsapp_bootstrap_profile(p_pending uuid,p_digest text,p_browser text,p_environment text,p_operation uuid,p_store uuid,p_first text,p_last text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE principal jsonb;
BEGIN
 IF p_first IS NULL OR p_last IS NULL OR p_first<>btrim(p_first) OR p_last<>btrim(p_last)
  OR length(p_first) NOT BETWEEN 1 AND 100 OR length(p_last) NOT BETWEEN 1 AND 100
  OR p_first~'[[:cntrl:]]' OR p_last~'[[:cntrl:]]' THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_PROFILE_INVALID';END IF;
 -- Delegate every proof, cutover and one-operation/one-store fence to the native authority.
 principal:=saas.merchant_whatsapp_bootstrap_principal(p_pending,p_digest,p_browser,p_environment,p_operation,p_store);
 INSERT INTO saas.merchant_signup_profiles(principal_id,first_name,last_name)
 VALUES((principal->>'id')::uuid,p_first,p_last) ON CONFLICT(principal_id) DO NOTHING;
 RETURN principal;
END $f$;
REVOKE ALL ON FUNCTION saas.merchant_whatsapp_bootstrap_profile(uuid,text,text,text,uuid,uuid,text,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_platform_operator,celebix_saas_observability;
GRANT EXECUTE ON FUNCTION saas.merchant_whatsapp_bootstrap_profile(uuid,text,text,text,uuid,uuid,text,text) TO celebix_saas_bootstrap;
COMMIT;
