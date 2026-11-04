BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
DO $guard$BEGIN
 IF current_setting('celebix.allow_loyalty502_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'LOYALTY502_DOWN_OPT_IN_REQUIRED';END IF;
 IF to_regclass('saas.loyalty503_functions')IS NOT NULL THEN RAISE EXCEPTION 'LOYALTY502_REVERT_503_FIRST';END IF;
 IF EXISTS(SELECT 1 FROM saas.loyalty_programs)OR EXISTS(SELECT 1 FROM saas.loyalty_operations)THEN RAISE EXCEPTION 'LOYALTY502_HAS_MERCHANT_DATA_ROLL_FORWARD_REQUIRED';END IF;
END $guard$;
DO $restore$DECLARE r record;BEGIN FOR r IN SELECT * FROM saas.loyalty_migration_baseline LOOP
 IF encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY502_DOWN_ROUTINE_DRIFT';END IF;EXECUTE r.definition;
END LOOP;END $restore$;
DO $triggers$DECLARE r record;BEGIN FOR r IN SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas'AND t.tgname LIKE 'loyalty_%'LOOP EXECUTE format('DROP TRIGGER %I ON saas.%I',r.tgname,r.relname);END LOOP;END $triggers$;
DROP FUNCTION saas.loyalty_program_json_v1(saas.loyalty_programs,timestamptz),saas.loyalty_reward_json_v1(saas.loyalty_rewards,timestamptz);
DROP TABLE saas.loyalty_pos_approvals,saas.loyalty_operations,saas.loyalty_order_queue,saas.loyalty_order_members,saas.loyalty_order_effects,saas.loyalty_rewards,saas.loyalty_effects,saas.loyalty_members,saas.loyalty_program_versions,saas.loyalty_programs,saas.loyalty_migration_baseline;
DO $functions$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure::text signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'loyalty_%'ORDER BY proname LOOP EXECUTE 'DROP FUNCTION '||r.signature;END LOOP;END $functions$;
COMMIT;
