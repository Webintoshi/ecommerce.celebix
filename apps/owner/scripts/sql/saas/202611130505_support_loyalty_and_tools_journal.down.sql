BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
  signature text;
  definition text;
  marker text;
  table_name text;
BEGIN
  signature := 'saas.loyalty_admin_command_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid,jsonb)';
  definition := pg_get_functiondef(signature::regprocedure);
  marker := 'PERFORM saas.platform_support_begin(s,p,m,''loyalty_admin_command_v1''); ';
  IF length(definition) - length(replace(definition, marker, '')) <> 5 * length(marker) THEN
    RAISE EXCEPTION 'SUPPORT_LOYALTY_JOURNAL_DEFINITION_MISMATCH';
  END IF;
  EXECUTE replace(definition, marker, '');

  signature := 'saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)';
  definition := pg_get_functiondef(signature::regprocedure);
  marker := 'PERFORM saas.platform_support_begin(p_store,p_principal,p_member,''store_tool_purchase_request''); ';
  IF length(definition) - length(replace(definition, marker, '')) <> length(marker) THEN
    RAISE EXCEPTION 'SUPPORT_STORE_TOOL_JOURNAL_DEFINITION_MISMATCH';
  END IF;
  EXECUTE replace(definition, marker, '');

  FOREACH table_name IN ARRAY ARRAY[
    'loyalty_programs', 'loyalty_program_versions', 'loyalty_operations',
    'loyalty_members', 'loyalty_effects', 'loyalty_rewards',
    'loyalty_pos_approvals', 'loyalty_pos_redemptions', 'store_tool_purchases'
  ] LOOP
    EXECUTE format('DROP TRIGGER platform_support_atomic_journal ON saas.%I', table_name);
  END LOOP;
END
$migration$;

COMMIT;
