-- Restore SQL180 canonical ownership. No settings, resources, metadata, or queues are modified.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DROP FUNCTION saas.seo_canonical_owned(uuid,timestamptz,text,text,uuid);
ALTER FUNCTION saas.seo_canonical_owned_before_indexable_targets(uuid,timestamptz,text,text,uuid) RENAME TO seo_canonical_owned;
COMMIT;
