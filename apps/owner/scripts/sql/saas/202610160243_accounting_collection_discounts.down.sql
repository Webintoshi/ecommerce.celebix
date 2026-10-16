-- Never discard an effective or reversed settlement-discount history.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $unused$ DECLARE f record;
BEGIN
 LOCK TABLE saas.accounting_release_state,saas.accounting_receivables,saas.accounting_allocations,saas.accounting_events,saas.accounting_operations IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.accounting_release_state WHERE collection_discounts_enabled)
  OR EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE discount_cents<>0)
  OR EXISTS(SELECT 1 FROM saas.accounting_allocations WHERE effect='discount')
  OR EXISTS(SELECT 1 FROM saas.accounting_events WHERE coalesce((metadata->>'discountCents')::numeric,0)<>0)
 THEN RAISE EXCEPTION 'ACCOUNTING243_DOWN_RETAIN_DISCOUNT_HISTORY_OR_ACTIVE_READER';END IF;
 IF (SELECT count(*) FROM saas.accounting_discount_243_backup)<>14 THEN RAISE EXCEPTION 'ACCOUNTING243_DOWN_BACKUP_INVALID';END IF;
 FOR f IN SELECT * FROM saas.accounting_discount_243_backup ORDER BY signature LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.function_oid AND p.proowner=f.function_owner AND p.proacl IS NOT DISTINCT FROM f.function_acl
    AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f.published_sha256)
  THEN RAISE EXCEPTION 'ACCOUNTING243_DOWN_FUNCTION_DRIFT: %',f.signature;END IF;
  EXECUTE f.definition;
 END LOOP;
END $unused$;
ALTER TABLE saas.accounting_allocations DROP CONSTRAINT accounting_allocations_effect_check;
ALTER TABLE saas.accounting_allocations ADD CONSTRAINT accounting_allocations_effect_check CHECK(effect IN('collect','return','refund','charge'));
ALTER TABLE saas.accounting_receivables DROP CONSTRAINT accounting_receivables_check1;
ALTER TABLE saas.accounting_receivables ADD CONSTRAINT accounting_receivables_check1 CHECK(refunded_cents BETWEEN 0 AND greatest(collected_cents-sale_cents+return_cents,0));
ALTER TABLE saas.accounting_receivables DROP COLUMN discount_cents;
ALTER TABLE saas.accounting_release_state DROP COLUMN collection_discounts_enabled;
DROP TABLE saas.accounting_discount_243_backup;
COMMIT;
