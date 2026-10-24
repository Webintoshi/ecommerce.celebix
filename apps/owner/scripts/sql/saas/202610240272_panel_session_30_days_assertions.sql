BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$ DECLARE r record;p record;BEGIN
 IF(SELECT count(*)FROM saas.panel_session_30_days272_functions)<>3 OR(SELECT count(*)FROM saas.panel_session_30_days272_constraints)<>2 THEN RAISE EXCEPTION 'SESSION_30D272_BACKUP_INCOMPLETE';END IF;
 FOR r IN SELECT * FROM saas.panel_session_30_days272_functions LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR p.proowner<>r.owner_oid OR p.proacl IS DISTINCT FROM r.acl OR p.proconfig IS DISTINCT FROM r.config OR p.prosecdef<>r.definer OR p.provolatile<>r.volatility OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM r.predecessor_sha256
  THEN RAISE EXCEPTION 'SESSION_30D272_PUBLISHED_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.panel_session_30_days272_constraints LOOP
  SELECT c.*,pg_get_constraintdef(c.oid)definition INTO p FROM pg_constraint c WHERE c.conrelid=to_regclass(r.table_name)AND c.conname=r.constraint_name;
  IF p.oid IS NULL OR NOT p.convalidated OR encode(sha256(convert_to(p.definition,'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM r.predecessor_sha256 THEN RAISE EXCEPTION 'SESSION_30D272_PUBLISHED_CONSTRAINT_DRIFT';END IF;
 END LOOP;
 FOR r IN SELECT unnest(ARRAY['saas.panel_session_30_days272_functions','saas.panel_session_30_days272_constraints'])table_name LOOP
  SELECT * INTO p FROM pg_class WHERE oid=to_regclass(r.table_name);
  IF p.relowner<>'celebix_saas_owner'::regrole OR NOT p.relrowsecurity OR NOT p.relforcerowsecurity THEN RAISE EXCEPTION 'SESSION_30D272_PRIVATE_TABLE_DRIFT';END IF;
  IF has_table_privilege('public',r.table_name,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_identity',r.table_name,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_app',r.table_name,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_workflow',r.table_name,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_host_resolver',r.table_name,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_bootstrap',r.table_name,'SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'SESSION_30D272_PRIVATE_TABLE_ACCESS';END IF;
 END LOOP;
 -- The legacy prepared email registration path is intentionally still 8 hours / 10 minutes.
 IF position('08:00:00' IN pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conrelid='saas.panel_session_handoffs'::regclass AND conname='panel_session_handoffs_session_lifetime')))=0 THEN RAISE EXCEPTION 'SESSION_30D272_LEGACY_HANDOFF_DRIFT';END IF;
END $assert$;
COMMIT;
