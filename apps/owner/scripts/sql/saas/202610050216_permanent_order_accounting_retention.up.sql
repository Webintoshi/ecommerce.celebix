-- Order deletion detaches financial evidence; it never refunds or changes stock.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));

CREATE TABLE saas.permanent_order_accounting_restore(signature text PRIMARY KEY,definition text NOT NULL);
ALTER TABLE saas.permanent_order_accounting_restore ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.permanent_order_accounting_restore FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.permanent_order_accounting_restore FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability;
INSERT INTO saas.permanent_order_accounting_restore
SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p
WHERE p.pronamespace='saas'::regnamespace AND p.proname IN(
 'delete_order','accounting_immutable','in_store_credit_snapshot_guard',
 'accounting_receivable_projection','accounting_read','accounting_mutate');

ALTER TABLE saas.accounting_receivables
 ADD COLUMN deleted_order_id uuid,
 ADD COLUMN deleted_order_number text,
 ADD CONSTRAINT accounting_receivable_deleted_order_snapshot CHECK(
   (deleted_order_id IS NULL AND deleted_order_number IS NULL)
   OR (order_id IS NULL AND deleted_order_id IS NOT NULL AND deleted_order_number IS NOT NULL
       AND length(deleted_order_number) BETWEEN 1 AND 200));
ALTER TABLE saas.accounting_events
 ADD COLUMN deleted_order_id uuid,
 ADD COLUMN deleted_order_number text,
 ADD CONSTRAINT accounting_event_deleted_order_snapshot CHECK(
   (deleted_order_id IS NULL AND deleted_order_number IS NULL)
   OR (order_id IS NULL AND deleted_order_id IS NOT NULL AND deleted_order_number IS NOT NULL
       AND length(deleted_order_number) BETWEEN 1 AND 200));

CREATE OR REPLACE FUNCTION saas.accounting_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_SCHEMA='saas' AND TG_TABLE_NAME='accounting_events' THEN
   IF OLD.order_id IS NOT NULL AND NEW.order_id IS NULL
      AND saas.permanent_order_deletion_context(OLD.store_id,OLD.order_id)
      AND OLD.deleted_order_id IS NULL AND OLD.deleted_order_number IS NULL
      AND NEW.deleted_order_id=OLD.order_id
      AND NEW.deleted_order_number=(SELECT order_number FROM saas.orders WHERE store_id=OLD.store_id AND id=OLD.order_id)
      AND to_jsonb(NEW)-ARRAY['order_id','deleted_order_id','deleted_order_number']
          =to_jsonb(OLD)-ARRAY['order_id','deleted_order_id','deleted_order_number']
   THEN RETURN NEW;END IF;
 END IF;
 RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE';
END $f$;

CREATE FUNCTION saas.accounting_detach_deleted_order(p_store uuid,p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE number_value text;r record;
BEGIN
 IF saas.permanent_order_deletion_context(p_store,p_order) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ACCOUNTING_PERMANENT_DELETE_CONTEXT_REQUIRED';END IF;
 SELECT order_number INTO STRICT number_value FROM saas.orders WHERE store_id=p_store AND id=p_order FOR UPDATE;
 FOR r IN SELECT id,customer_id,currency FROM saas.accounting_receivables
          WHERE store_id=p_store AND order_id=p_order ORDER BY id FOR UPDATE LOOP
   UPDATE saas.accounting_receivables SET order_id=NULL,deleted_order_id=p_order,
     deleted_order_number=number_value,version=version+1 WHERE store_id=p_store AND id=r.id;
   PERFORM saas.accounting_bump_customer(p_store,r.customer_id,r.currency);
 END LOOP;
 UPDATE saas.accounting_events SET order_id=NULL,deleted_order_id=p_order,
   deleted_order_number=number_value WHERE store_id=p_store AND order_id=p_order;
END $f$;
REVOKE ALL ON FUNCTION saas.accounting_detach_deleted_order(uuid,uuid)
 FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_bootstrap,
 celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator;

-- The existing POS tombstone may redact only these two intent fields.
CREATE OR REPLACE FUNCTION saas.in_store_credit_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF OLD.status='completed' AND OLD.order_id IS NOT NULL AND NEW.order_id IS NULL
    AND saas.permanent_order_deletion_context(OLD.store_id,OLD.order_id)
    AND current_setting('saas.in_store.redact_sale',true)=OLD.store_id::text||':'||OLD.id::text
    AND current_setting('saas.in_store.redact_order',true)=OLD.store_id::text||':'||OLD.order_id::text
    AND NEW.intent=jsonb_set(jsonb_set(OLD.intent,'{customerName}','null'),'{note}','null')
    AND to_jsonb(NEW)-ARRAY['order_id','intent','version','updated_at']
        =to_jsonb(OLD)-ARRAY['order_id','intent','version','updated_at']
    AND NEW.version=OLD.version+1 AND NEW.updated_at>=OLD.updated_at
 THEN RETURN NEW;END IF;
 IF OLD.contract_version=3 AND OLD.status IN('payment_pending','payment_received','completed')
    AND NEW.status<>'draft' AND (OLD.customer_id IS DISTINCT FROM NEW.customer_id
      OR OLD.customer_snapshot IS DISTINCT FROM NEW.customer_snapshot
      OR OLD.initial_collection_cents IS DISTINCT FROM NEW.initial_collection_cents
      OR OLD.due_date IS DISTINCT FROM NEW.due_date OR OLD.items IS DISTINCT FROM NEW.items
      OR OLD.total_cents IS DISTINCT FROM NEW.total_cents OR OLD.intent IS DISTINCT FROM NEW.intent)
 THEN RAISE EXCEPTION 'IN_STORE_CREDIT_SNAPSHOT_IMMUTABLE';END IF;
 RETURN NEW;
END $f$;

-- Patch the current definitions, including platform support audit wrappers and ACLs.
DO $patch$
DECLARE r record;d text;anchor text;replacement text;
BEGIN
 IF (SELECT count(*) FROM saas.permanent_order_accounting_restore)<>6
 THEN RAISE EXCEPTION 'PERMANENT_ORDER_ACCOUNTING_RESTORE_INCOMPLETE';END IF;
 FOR r IN SELECT signature,definition FROM saas.permanent_order_accounting_restore
          WHERE signature LIKE 'saas.delete_order(%' LOOP
   d:=r.definition;anchor:='  PERFORM saas.record_deletion_operation_lock(p_store_id,p_operation_id);';
   IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1
   THEN RAISE EXCEPTION 'PERMANENT_ORDER_ACCOUNTING_DELETE_LOCK_ANCHOR';END IF;
   replacement:='  PERFORM pg_advisory_xact_lock_shared(hashtextextended(''saas.accounting.release'',0));
  PERFORM pg_advisory_xact_lock(hashtextextended(''saas.catalog.store:''||p_store_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(''saas.accounting.store:''||p_store_id::text,0));
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,''orders'',''orders.delete''
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
'||anchor;
   d:=replace(d,anchor,replacement);
   anchor:='  PERFORM pg_catalog.set_config(''saas.permanent_delete_order'',p_store_id::text||'':''||p_order_id::text,true);';
   IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1
   THEN RAISE EXCEPTION 'PERMANENT_ORDER_ACCOUNTING_DELETE_CONTEXT_ANCHOR';END IF;
   EXECUTE replace(d,anchor,anchor||E'\n  PERFORM saas.accounting_detach_deleted_order(p_store_id,p_order_id);');
 END LOOP;
 FOR r IN SELECT signature,definition FROM saas.permanent_order_accounting_restore
          WHERE signature LIKE 'saas.accounting_receivable_projection(%' OR signature LIKE 'saas.accounting_read(%' LOOP
   d:=r.definition;anchor:='o.order_number';
   IF position(anchor IN d)=0 THEN RAISE EXCEPTION 'PERMANENT_ORDER_ACCOUNTING_NUMBER_ANCHOR';END IF;
   EXECUTE replace(d,anchor,'coalesce(o.order_number,r.deleted_order_number)');
 END LOOP;
 FOR r IN SELECT signature,definition FROM saas.permanent_order_accounting_restore
          WHERE signature LIKE 'saas.accounting_mutate(%' LOOP
   d:=r.definition;
   anchor:=' ELSE SELECT version INTO current_version FROM saas.accounting_accounts WHERE store_id=p_store AND id=account_id_value FOR UPDATE;END IF;';
   IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1
   THEN RAISE EXCEPTION 'PERMANENT_ORDER_ACCOUNTING_REVERSE_ANCHOR';END IF;
   replacement:=' ELSIF original.kind=''return_credit'' AND account_id_value IS NULL THEN
 SELECT d.version INTO current_version FROM saas.accounting_receivables d
 JOIN saas.accounting_allocations a ON a.store_id=d.store_id AND a.receivable_id=d.id
 WHERE a.store_id=p_store AND a.event_id=original.id AND a.effect=''return'' FOR UPDATE OF d;
'||anchor;
   EXECUTE replace(d,anchor,replacement);
 END LOOP;
END $patch$;
COMMIT;
