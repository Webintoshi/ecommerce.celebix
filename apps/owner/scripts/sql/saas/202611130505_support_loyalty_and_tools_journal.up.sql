BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
  signature text;
  definition text;
  anchor text;
  replacement text;
  statement record;
  table_name text;
BEGIN
  signature := 'saas.loyalty_admin_command_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid,jsonb)';
  definition := pg_get_functiondef(signature::regprocedure);
  FOR statement IN SELECT * FROM (VALUES
    ('UPDATE saas.loyalty_programs SET enabled=NOT enabled', 'PERFORM saas.platform_support_begin(s,p,m,''loyalty_admin_command_v1''); UPDATE saas.loyalty_programs SET enabled=NOT enabled'),
    ('IF action=''duplicate''OR pr.id IS NULL THEN', 'PERFORM saas.platform_support_begin(s,p,m,''loyalty_admin_command_v1''); IF action=''duplicate''OR pr.id IS NULL THEN'),
    ('PERFORM saas.loyalty_apply_effect_v1(s,pr.id,pr.version,acc,customer,op,delta', 'PERFORM saas.platform_support_begin(s,p,m,''loyalty_admin_command_v1''); PERFORM saas.loyalty_apply_effect_v1(s,pr.id,pr.version,acc,customer,op,delta'),
    ('ELSIF action=''approve-pos''THEN result:=', 'ELSIF action=''approve-pos''THEN PERFORM saas.platform_support_begin(s,p,m,''loyalty_admin_command_v1''); result:='),
    ('ELSIF action=''prepare-pos-reward''THEN result:=', 'ELSIF action=''prepare-pos-reward''THEN PERFORM saas.platform_support_begin(s,p,m,''loyalty_admin_command_v1''); result:=')
  ) AS changes(before, after) LOOP
    IF length(definition) - length(replace(definition, statement.before, '')) <> length(statement.before) THEN
      RAISE EXCEPTION 'SUPPORT_LOYALTY_JOURNAL_DEFINITION_MISMATCH';
    END IF;
    definition := replace(definition, statement.before, statement.after);
  END LOOP;
  EXECUTE definition;

  signature := 'saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)';
  definition := pg_get_functiondef(signature::regprocedure);
  anchor := 'INSERT INTO saas.store_tool_purchases(store_id,id,principal_id,offer_id';
  replacement := 'PERFORM saas.platform_support_begin(p_store,p_principal,p_member,''store_tool_purchase_request''); ' || anchor;
  IF length(definition) - length(replace(definition, anchor, '')) <> length(anchor) THEN
    RAISE EXCEPTION 'SUPPORT_STORE_TOOL_JOURNAL_DEFINITION_MISMATCH';
  END IF;
  EXECUTE replace(definition, anchor, replacement);

  FOREACH table_name IN ARRAY ARRAY[
    'loyalty_programs', 'loyalty_program_versions', 'loyalty_operations',
    'loyalty_members', 'loyalty_effects', 'loyalty_rewards',
    'loyalty_pos_approvals', 'loyalty_pos_redemptions', 'store_tool_purchases'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER platform_support_atomic_journal AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',
      table_name
    );
  END LOOP;
END
$migration$;

COMMIT;
