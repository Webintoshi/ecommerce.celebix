-- Cash counts describe physical observations; they never change the financial ledger.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $predecessors$
BEGIN
 IF to_regclass('saas.accounting_schedule_239_backup') IS NULL
  OR to_regprocedure('saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean)') IS NULL
  OR to_regprocedure('saas.platform_support_begin(uuid,uuid,uuid,text)') IS NULL
  OR to_regprocedure('saas.platform_support_journal_write()') IS NULL
 THEN RAISE EXCEPTION 'ACCOUNTING240_PREDECESSOR_REQUIRED';END IF;
END $predecessors$;

CREATE TABLE saas.accounting_cash_sessions(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),account_id uuid NOT NULL,
 sequence bigint NOT NULL CHECK(sequence BETWEEN 1 AND 9007199254740991),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),status text NOT NULL CHECK(status IN('open','closed')),
 opened_at timestamptz NOT NULL CHECK(isfinite(opened_at)),opened_by uuid NOT NULL,
 opening_count_cents bigint NOT NULL CHECK(opening_count_cents BETWEEN 0 AND 9007199254740991),
 opening_balance_cents bigint NOT NULL CHECK(opening_balance_cents BETWEEN 0 AND 9007199254740991),
 opening_account_version bigint NOT NULL CHECK(opening_account_version BETWEEN 1 AND 9007199254740991),
 opening_note text CHECK(opening_note IS NULL OR(length(opening_note) BETWEEN 1 AND 2000 AND opening_note=btrim(opening_note) AND opening_note!~'[[:cntrl:]]')),
 closed_at timestamptz,closed_by uuid,counted_cents bigint,closing_note text,
 closing_balance_cents bigint,closing_account_version bigint,
 UNIQUE(store_id,id),UNIQUE(store_id,account_id,sequence),
 FOREIGN KEY(store_id,account_id) REFERENCES saas.accounting_accounts(store_id,id),
 FOREIGN KEY(store_id,opened_by) REFERENCES saas.memberships(store_id,id),
 FOREIGN KEY(store_id,closed_by) REFERENCES saas.memberships(store_id,id),
 CHECK(opening_count_cents=opening_balance_cents OR opening_note IS NOT NULL),
 CHECK(closing_note IS NULL OR(length(closing_note) BETWEEN 1 AND 2000 AND closing_note=btrim(closing_note) AND closing_note!~'[[:cntrl:]]')),
 CHECK((status='open' AND closed_at IS NULL AND closed_by IS NULL AND counted_cents IS NULL AND closing_note IS NULL
    AND closing_balance_cents IS NULL AND closing_account_version IS NULL)
  OR(status='closed' AND closed_at IS NOT NULL AND isfinite(closed_at) AND closed_at>=opened_at AND closed_by IS NOT NULL
    AND counted_cents IS NOT NULL AND counted_cents BETWEEN 0 AND 9007199254740991
    AND closing_balance_cents IS NOT NULL AND closing_balance_cents BETWEEN 0 AND 9007199254740991
    AND closing_account_version IS NOT NULL AND closing_account_version BETWEEN opening_account_version AND 9007199254740991
    AND opening_count_cents::numeric+closing_balance_cents-opening_balance_cents BETWEEN -9007199254740991 AND 9007199254740991
    AND counted_cents::numeric-opening_count_cents-closing_balance_cents+opening_balance_cents BETWEEN -9007199254740991 AND 9007199254740991
    AND(counted_cents::numeric-opening_count_cents-closing_balance_cents+opening_balance_cents=0 OR closing_note IS NOT NULL)))
);
CREATE UNIQUE INDEX accounting_cash_one_open ON saas.accounting_cash_sessions(store_id,account_id) WHERE status='open';
CREATE TABLE saas.accounting_cash_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),actor_membership_id uuid NOT NULL,
 account_id uuid NOT NULL,session_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('open','close')),
 payload_fingerprint text NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'),committed_at timestamptz NOT NULL CHECK(isfinite(committed_at)),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id),
 FOREIGN KEY(store_id,account_id) REFERENCES saas.accounting_accounts(store_id,id),
 FOREIGN KEY(store_id,session_id) REFERENCES saas.accounting_cash_sessions(store_id,id)
);

CREATE FUNCTION saas.accounting_cash_session_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='open' AND NEW.status='closed'
  AND to_jsonb(NEW)-ARRAY['status','closed_at','closed_by','counted_cents','closing_note','closing_balance_cents','closing_account_version']
   =to_jsonb(OLD)-ARRAY['status','closed_at','closed_by','counted_cents','closing_note','closing_balance_cents','closing_account_version']
 THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'ACCOUNTING240_SESSION_IMMUTABLE';
END $f$;
CREATE TRIGGER accounting_cash_session_guard BEFORE UPDATE OR DELETE ON saas.accounting_cash_sessions
 FOR EACH ROW EXECUTE FUNCTION saas.accounting_cash_session_guard();
CREATE TRIGGER accounting_immutable BEFORE UPDATE OR DELETE ON saas.accounting_cash_operations
 FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable();
DO $tables$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['accounting_cash_sessions','accounting_cash_operations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',t);
  EXECUTE format('CREATE TRIGGER platform_support_journal_write AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',t);
 END LOOP;
END $tables$;

CREATE FUNCTION saas.accounting_cash_session_intent_valid(p_kind text,p_args jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE k text;v jsonb;n numeric;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('open','close') OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RETURN false;END IF;
 IF pg_column_size(p_args)>16384 OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>5
  OR NOT(p_args?&ARRAY['accountId','expectedVersion','countedCents','note',CASE p_kind WHEN 'open' THEN 'expectedLastSessionId' ELSE 'sessionId' END])
 THEN RETURN false;END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_args) LOOP
  IF k IN('accountId','sessionId','expectedLastSessionId') THEN
   IF k='expectedLastSessionId' AND v='null'::jsonb THEN CONTINUE;END IF;
   IF jsonb_typeof(v)<>'string' OR v#>>'{}'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false;END IF;
  ELSIF k IN('expectedVersion','countedCents') THEN
   IF jsonb_typeof(v)<>'number' THEN RETURN false;END IF;
   n:=(v#>>'{}')::numeric;
   IF n<>trunc(n) OR n NOT BETWEEN (CASE WHEN k='expectedVersion' THEN 1 ELSE 0 END) AND 9007199254740991 THEN RETURN false;END IF;
  ELSIF k='note' THEN
   IF v='null'::jsonb THEN CONTINUE;END IF;
   IF jsonb_typeof(v)<>'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 2000 OR v#>>'{}'<>btrim(v#>>'{}') OR v#>>'{}'~'[[:cntrl:]]' THEN RETURN false;END IF;
  ELSE RETURN false;
  END IF;
 END LOOP;
 RETURN true;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $f$;

CREATE FUNCTION saas.accounting_cash_session_projection(p_store uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE s saas.accounting_cash_sessions%ROWTYPE;live_balance bigint;live_version bigint;movement numeric;expected numeric;difference numeric;total_difference numeric;
BEGIN
 SELECT * INTO s FROM saas.accounting_cash_sessions WHERE store_id=p_store AND id=p_session;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF s.status='open' THEN
  SELECT balance_cents,version INTO live_balance,live_version FROM saas.accounting_accounts WHERE store_id=p_store AND id=s.account_id;
 ELSE live_balance:=s.closing_balance_cents;live_version:=s.closing_account_version;END IF;
 movement:=live_balance::numeric-s.opening_balance_cents;
 expected:=s.opening_count_cents::numeric+movement;
 IF s.status='closed' THEN difference:=s.counted_cents::numeric-expected;total_difference:=s.counted_cents::numeric-live_balance;END IF;
 IF live_balance IS NULL OR live_version IS NULL OR expected NOT BETWEEN -9007199254740991 AND 9007199254740991
  OR difference IS NOT NULL AND difference NOT BETWEEN -9007199254740991 AND 9007199254740991 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',s.id,'accountId',s.account_id,'sequence',s.sequence,'currency',s.currency,'status',s.status,
  'openedAt',saas.orders_json_timestamp(s.opened_at),'openedBy',s.opened_by,
  'openingCountCents',s.opening_count_cents,'openingBalanceCents',s.opening_balance_cents,
  'openingDifferenceCents',s.opening_count_cents::numeric-s.opening_balance_cents,'openingNote',s.opening_note,
  'closedAt',CASE WHEN s.closed_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(s.closed_at) END,'closedBy',s.closed_by,
  'countedCents',s.counted_cents,'closingNote',s.closing_note,'balanceCents',live_balance,'accountVersion',live_version,
  'movementCents',movement,'expectedCents',expected,'differenceCents',difference,'totalDifferenceCents',total_difference);
END $f$;

CREATE FUNCTION saas.accounting_cash_session_list(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_account uuid)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;account saas.accounting_accounts%ROWTYPE;active_session uuid;active_value jsonb;history_value jsonb;last_session uuid;more boolean;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_account IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=p_account;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF account.account_type<>'cash' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT id INTO active_session FROM saas.accounting_cash_sessions WHERE store_id=p_store AND account_id=p_account AND status='open';
 IF active_session IS NOT NULL THEN
  active_value:=saas.accounting_cash_session_projection(p_store,active_session);
  IF active_value IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 END IF;
 WITH recent AS(SELECT id,sequence FROM saas.accounting_cash_sessions WHERE store_id=p_store AND account_id=p_account AND status='closed' ORDER BY sequence DESC LIMIT 101)
 SELECT coalesce((SELECT jsonb_agg(saas.accounting_cash_session_projection(p_store,id) ORDER BY sequence DESC) FROM(SELECT id,sequence FROM recent ORDER BY sequence DESC LIMIT 100) visible),'[]'::jsonb),
  (SELECT count(*)>100 FROM recent) INTO history_value,more;
 SELECT id INTO last_session FROM saas.accounting_cash_sessions WHERE store_id=p_store AND account_id=p_account ORDER BY sequence DESC LIMIT 1;
 RETURN QUERY SELECT 'found',jsonb_build_object('account',saas.accounting_account_projection(p_store,p_account),
  'active',active_value,'history',history_value,'lastSessionId',last_session,'hasMore',more);
END $f$;

CREATE FUNCTION saas.accounting_cash_session_get_operation(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_cash_operations%ROWTYPE;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NOT NULL AND p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_cash_operations WHERE operation_id=p_operation AND store_id=p_store AND actor_membership_id=p_member;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF p_fingerprint IS NOT NULL AND prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('replayed',true);
END $f$;

CREATE FUNCTION saas.accounting_cash_session_mutate(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text,p_kind text,p_args jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.accounting_cash_operations%ROWTYPE;account saas.accounting_accounts%ROWTYPE;s saas.accounting_cash_sessions%ROWTYPE;
 last_session uuid;last_sequence bigint;session_id_value uuid;counted bigint;note_value text;expected numeric;difference numeric;result jsonb;now_value timestamptz;
BEGIN
 PERFORM saas.platform_support_begin(p_store,p_principal,p_member,'accounting_cash_session_mutate');
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_operation::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR NOT saas.accounting_cash_session_intent_valid(p_kind,p_args)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.cash.operation:'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store::text,0));
 PERFORM 1 FROM saas.memberships WHERE store_id=p_store AND id=p_member FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan FOR SHARE;
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_cash_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.store_id=p_store AND prior.actor_membership_id=p_member AND prior.kind=p_kind AND prior.payload_fingerprint=p_fingerprint
   AND prior.account_id=(p_args->>'accountId')::uuid AND(p_kind='open' OR prior.session_id=(p_args->>'sessionId')::uuid)
  THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);
  ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=(p_args->>'accountId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF account.account_type<>'cash' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF account.version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 counted:=(p_args->>'countedCents')::bigint;note_value:=p_args->>'note';
 IF p_kind='open' THEN
  SELECT id,sequence INTO last_session,last_sequence FROM saas.accounting_cash_sessions WHERE store_id=p_store AND account_id=account.id ORDER BY sequence DESC LIMIT 1;
  IF last_session IS DISTINCT FROM (p_args->>'expectedLastSessionId')::uuid THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.accounting_cash_sessions WHERE store_id=p_store AND account_id=account.id AND status='open') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF coalesce(last_sequence,0)>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
  IF counted<>account.balance_cents AND note_value IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  session_id_value:=p_operation;now_value:=clock_timestamp();
  INSERT INTO saas.accounting_cash_sessions(id,store_id,account_id,sequence,currency,status,opened_at,opened_by,
   opening_count_cents,opening_balance_cents,opening_account_version,opening_note)
  VALUES(session_id_value,p_store,account.id,coalesce(last_sequence,0)+1,account.currency,'open',now_value,p_member,counted,account.balance_cents,account.version,note_value);
 ELSE
  session_id_value:=(p_args->>'sessionId')::uuid;
  SELECT * INTO s FROM saas.accounting_cash_sessions WHERE store_id=p_store AND account_id=account.id AND id=session_id_value FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF s.status<>'open' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  expected:=s.opening_count_cents::numeric+account.balance_cents-s.opening_balance_cents;difference:=counted::numeric-expected;
  IF expected NOT BETWEEN -9007199254740991 AND 9007199254740991 OR difference NOT BETWEEN -9007199254740991 AND 9007199254740991
  THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
  IF difference<>0 AND note_value IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  now_value:=greatest(s.opened_at,clock_timestamp());
  UPDATE saas.accounting_cash_sessions SET status='closed',closed_at=now_value,closed_by=p_member,counted_cents=counted,
   closing_note=note_value,closing_balance_cents=account.balance_cents,closing_account_version=account.version WHERE store_id=p_store AND id=session_id_value;
 END IF;
 result:=jsonb_build_object('operationId',p_operation,'replayed',false,'kind',p_kind,'session',saas.accounting_cash_session_projection(p_store,session_id_value));
 INSERT INTO saas.accounting_cash_operations(operation_id,store_id,actor_membership_id,account_id,session_id,kind,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation,p_store,p_member,account.id,session_id_value,p_kind,p_fingerprint,result,now_value);
 RETURN QUERY SELECT 'committed',result;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;

DO $grants$ DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_cash_session_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',f.signature);
  IF f.proname IN('accounting_cash_session_list','accounting_cash_session_mutate','accounting_cash_session_get_operation') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.signature);END IF;
 END LOOP;
END $grants$;
COMMIT;
