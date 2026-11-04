DO $verify$
DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['loyalty_migration_baseline','loyalty_programs','loyalty_program_versions','loyalty_members','loyalty_effects','loyalty_rewards','loyalty_order_effects','loyalty_order_queue','loyalty_operations','loyalty_pos_approvals']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity)THEN RAISE EXCEPTION 'LOYALTY_RLS_MISSING:%',t;END IF;
  IF has_table_privilege('celebix_saas_app','saas.'||t,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_host_resolver','saas.'||t,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_workflow','saas.'||t,'SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'LOYALTY_TABLE_GRANT:%',t;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.loyalty_migration_baseline LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY_ROUTINE_DRIFT:%',r.identity;END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_app','saas.loyalty_admin_command_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid,jsonb)','EXECUTE')OR NOT has_function_privilege('celebix_saas_host_resolver','saas.loyalty_customer_command_v1(text,timestamp with time zone,jsonb,text,uuid,jsonb)','EXECUTE')OR NOT has_function_privilege('celebix_saas_workflow','saas.loyalty_process_pending_v1(timestamp with time zone,integer)','EXECUTE')THEN RAISE EXCEPTION 'LOYALTY_ENTRYPOINT_GRANT';END IF;
 IF has_function_privilege('celebix_saas_app','saas.loyalty_apply_effect_v1(uuid,uuid,bigint,uuid,uuid,uuid,bigint,timestamp with time zone,text,jsonb)','EXECUTE')THEN RAISE EXCEPTION 'LOYALTY_HELPER_PUBLIC';END IF;
END $verify$;
