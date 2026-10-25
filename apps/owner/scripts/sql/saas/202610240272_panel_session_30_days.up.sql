-- Native272. Fixed 720 hour WhatsApp merchant sessions, bounded by original assurance.
-- Existing sessions, email registration issuers, central TOTP and temporary tokens retain their deadlines.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.panel-session-30-days.release272',0));
DO $preflight$ BEGIN
 IF to_regclass('saas.panel_session_30_days272_functions')IS NOT NULL OR to_regclass('saas.panel_session_30_days272_constraints')IS NOT NULL
 THEN RAISE EXCEPTION 'SESSION_30D272_ALREADY_INSTALLED';END IF;
END $preflight$;
CREATE TABLE saas.panel_session_30_days272_functions(signature text PRIMARY KEY,definition text NOT NULL,predecessor_sha256 text NOT NULL,published_sha256 text,owner_oid oid NOT NULL,acl aclitem[],config text[],definer boolean NOT NULL,volatility "char" NOT NULL);
CREATE TABLE saas.panel_session_30_days272_constraints(table_name text NOT NULL,constraint_name text NOT NULL,definition text NOT NULL,predecessor_sha256 text NOT NULL,published_sha256 text,PRIMARY KEY(table_name,constraint_name));
ALTER TABLE saas.panel_session_30_days272_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.panel_session_30_days272_functions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.panel_session_30_days272_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.panel_session_30_days272_constraints FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.panel_session_30_days272_functions,saas.panel_session_30_days272_constraints FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap;
DO $backup$ DECLARE f record;r record;BEGIN
 FOR f IN SELECT * FROM(VALUES
 ('saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamp with time zone,timestamp with time zone)','ed480f82afa8a1af5085d6c12c1b1422ffde2bae941cac2662575b3d5a309ec4','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_identity=X/celebix_saas_owner}'),
 ('saas.merchant_whatsapp_command(text,jsonb)','ae4ad4fb22eb2e11b243df07c3d2426697c2867754f17559ff37afd9225b6c4d','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_identity=X/celebix_saas_owner}'),
 ('saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)','9c59179323e7b2f5632f8920e1d456aa18c4748f9aaa135c658838ff5b9557dd','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_identity=X/celebix_saas_owner}')
 )reviewed(signature,body_hash,acl)LOOP
  SELECT p.*,pg_get_functiondef(p.oid)definition INTO r FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature);
  IF r.definition IS NULL OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM f.body_hash OR r.proowner<>'celebix_saas_owner'::regrole OR r.proacl::text IS DISTINCT FROM f.acl OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR NOT r.prosecdef OR r.provolatile<>'v'
  THEN RAISE EXCEPTION 'SESSION_30D272_PREDECESSOR_DRIFT:%',f.signature;END IF;
  INSERT INTO saas.panel_session_30_days272_functions VALUES(f.signature,r.definition,f.body_hash,NULL,r.proowner,r.proacl,r.proconfig,r.prosecdef,r.provolatile);
 END LOOP;
 FOR f IN SELECT * FROM(VALUES
 ('saas.cross_host_panel_handoffs','cross_host_panel_handoffs_redemption_check','9c61d8951b0ea49c79768510bb76b41c36016989a94bd3eda86031e78e8caca9'),
 ('saas.panel_sessions','panel_sessions_timestamp_order_check','eb172890aa4964d9372323bd6eabb859279ca809a614e8e533982be1349453e6')
 )reviewed(table_name,constraint_name,body_hash)LOOP
  SELECT pg_get_constraintdef(c.oid)definition,c.convalidated,t.relowner,t.relrowsecurity,t.relforcerowsecurity INTO r FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE c.conrelid=to_regclass(f.table_name)AND c.conname=f.constraint_name;
  IF r.definition IS NULL OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM f.body_hash OR NOT r.convalidated OR r.relowner<>'celebix_saas_owner'::regrole OR NOT r.relrowsecurity OR NOT r.relforcerowsecurity
  THEN RAISE EXCEPTION 'SESSION_30D272_CONSTRAINT_PREDECESSOR_DRIFT:%:%',f.table_name,f.constraint_name;END IF;
  INSERT INTO saas.panel_session_30_days272_constraints VALUES(f.table_name,f.constraint_name,r.definition,f.body_hash,NULL);
 END LOOP;
END $backup$;
DO $patch$ DECLARE r record;d text;old text;replacement text;BEGIN
 FOR r IN SELECT * FROM saas.panel_session_30_days272_functions ORDER BY signature LOOP
  d:=r.definition;
  CASE split_part(split_part(r.signature,'(',1),'.',2)
  WHEN 'issue_panel_session' THEN
   old:=$old$OR p_expires_at <= p_now OR p_expires_at > p_now + interval '8 hours'$old$;
   replacement:=$new$OR p_expires_at <= p_now OR p_expires_at > p_now + interval '720 hours'
     OR (p_expires_at > p_now + interval '8 hours' AND NOT EXISTS(
       SELECT 1 FROM saas.admin_login_assurance a
       JOIN saas.admin_login_factors f ON f.principal_id=a.principal_id AND f.security_version=a.security_version
       WHERE a.family_id=p_family_id AND a.principal_id=p_principal_id AND NOT a.legacy AND a.authentication_method='whatsapp'
        AND a.session_id=p_session_id AND a.operation_id=p_operation_id AND a.token_key_id=p_token_key_id AND a.token_digest=p_token_digest
        AND a.created_at<=p_now AND a.expires_at<=a.created_at+interval '720 hours' AND p_expires_at<=a.expires_at AND a.expires_at>clock_timestamp()))$new$;
   IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'SESSION_30D272_ISSUE_PATCH_DRIFT';END IF;
   d:=replace(d,old,replacement);
  WHEN 'redeem_cross_host_panel_handoff' THEN
   -- Clamp every path, including pre-policy email sessions, before any assurance copy.
   old:=$old$BEGIN
 PERFORM 1 FROM saas.admin_login_factors$old$;
   replacement:=$new$BEGIN
 IF p_session_expires_at IS NOT NULL THEN
  SELECT least(p_session_expires_at,s.expires_at,coalesce(a.expires_at,s.expires_at)) INTO p_session_expires_at
  FROM saas.cross_host_panel_handoffs h JOIN saas.panel_sessions s ON s.session_id=h.source_session_id
  LEFT JOIN saas.admin_login_assurance a ON a.family_id=s.family_id
  WHERE h.token_key_id=p_token_key_id AND h.token_digest=p_token_digest AND h.destination_hostname=p_destination_hostname
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp();
 END IF;
 PERFORM 1 FROM saas.admin_login_factors$new$;
   IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'SESSION_30D272_HANDOFF_PATCH_DRIFT';END IF;
   d:=replace(d,old,replacement);
   old:=$old$p_session_expires_at > p_now + interval '8 hours'$old$;
   IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'SESSION_30D272_HANDOFF_LIMIT_PATCH_DRIFT';END IF;
   d:=replace(d,old,$new$p_session_expires_at > p_now + interval '720 hours'$new$);
  WHEN 'merchant_whatsapp_command' THEN
   old:=$old$n+interval '8 hours'$old$;
   IF (length(d)-length(replace(d,old,'')))/length(old)<>2 THEN RAISE EXCEPTION 'SESSION_30D272_WHATSAPP_PATCH_DRIFT';END IF;
   d:=replace(d,old,$new$n+interval '720 hours'$new$);
  ELSE RAISE EXCEPTION 'SESSION_30D272_UNEXPECTED_FUNCTION';
  END CASE;
  IF d=r.definition THEN RAISE EXCEPTION 'SESSION_30D272_EMPTY_PATCH';END IF;
  EXECUTE d;
  UPDATE saas.panel_session_30_days272_functions SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(r.signature)),'UTF8')),'hex')WHERE signature=r.signature;
 END LOOP;
 FOR r IN SELECT * FROM saas.panel_session_30_days272_constraints LOOP
  old:=$old$'08:00:00'::interval$old$;
  IF (length(r.definition)-length(replace(r.definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'SESSION_30D272_CONSTRAINT_PATCH_DRIFT';END IF;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.table_name,r.constraint_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.table_name,r.constraint_name,replace(r.definition,old,$new$'720 hours'::interval$new$));
  UPDATE saas.panel_session_30_days272_constraints b SET published_sha256=encode(sha256(convert_to(pg_get_constraintdef(c.oid),'UTF8')),'hex')FROM pg_constraint c WHERE c.conrelid=to_regclass(r.table_name)AND c.conname=r.constraint_name AND b.table_name=r.table_name AND b.constraint_name=r.constraint_name;
 END LOOP;
END $patch$;
COMMIT;
