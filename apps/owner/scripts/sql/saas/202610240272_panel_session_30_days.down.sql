BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.panel-session-30-days.release272',0));
DO $restore$ DECLARE r record;p record;BEGIN
 IF current_setting('celebix.allow_native272_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'SESSION_30D272_ROLLBACK_CONFIRMATION_REQUIRED';END IF;
 -- Retain expired and revoked authority and tombstones; rollback must never erase an issued promise.
 IF EXISTS(SELECT 1 FROM saas.panel_sessions WHERE expires_at>issued_at+interval '8 hours')
 OR EXISTS(SELECT 1 FROM saas.cross_host_panel_handoffs WHERE session_expires_at>redeemed_at+interval '8 hours')
 OR EXISTS(SELECT 1 FROM saas.admin_login_assurance WHERE NOT legacy AND authentication_method='whatsapp' AND expires_at>created_at+interval '8 hours')
 THEN RAISE EXCEPTION 'SESSION_30D272_ROLLBACK_IN_USE';END IF;
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
 FOR r IN SELECT * FROM saas.panel_session_30_days272_functions LOOP EXECUTE r.definition;END LOOP;
 FOR r IN SELECT * FROM saas.panel_session_30_days272_constraints LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.table_name,r.constraint_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.table_name,r.constraint_name,r.definition);
 END LOOP;
END $restore$;
DROP TABLE saas.panel_session_30_days272_functions,saas.panel_session_30_days272_constraints;
COMMIT;
