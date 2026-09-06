# Promotions Studio migration 126 staging rollout

This runbook applies only to the Celebix SaaS staging PostgreSQL database and the staging Customer Panel and Storefront services. It does not authorize production access, a production deployment, real payment traffic, or changes to `apps/admin`.

## Release identity and stop gates

Record the merged commit, remote canonical branch SHA, source branch SHA, Customer Panel UUID and Storefront UUID before any mutation. Record existing running SHAs and health responses. Stop if the canonical SHA is not the reviewed merge commit, either service has unresolved pending configuration, the database is not PostgreSQL 16, the connection is a superuser application runtime, or any secret would be printed.

Only the existing server-side migration credential may apply SQL. Never place a connection string, credential, key, customer value, coupon value, or backup payload in logs or the evidence report.

## Backup and isolated restore verification

1. Create a timestamped, encrypted or access-restricted custom-format backup of the staging SaaS database with the installed PostgreSQL 16 tools.
2. Store mode, timestamp, byte size, SHA-256 checksum, PostgreSQL major version and safe backup identifier. Do not store row payloads.
3. Verify archive readability with `pg_restore --list`.
4. Create a new isolated PostgreSQL 16 restore database that no application, worker, DNS name or Coolify resource references.
5. Restore using `pg_restore --exit-on-error --single-transaction` with ownership and extension handling matching the reviewed staging procedure.
6. Compare safe aggregate counts for stores, products, orders and migration-125 relations. Verify required RLS/FORCE flags, role membership and representative read-only functions. Never query or report customer PII.
7. Drop the isolated restore database and remove plaintext temporary backup/list/log files. Retain only the protected backup and safe checksum evidence.

Migration 126 is blocked unless both archive verification and an actual isolated restore pass.

## Migration-first application

Keep Customer Panel and Storefront on their current code while applying, in this order:

1. `apps/owner/scripts/sql/saas/202609050126_promotions_studio.up.sql`
2. `apps/owner/scripts/sql/saas/202609050126_promotions_studio_assertions.sql`
3. Replay the up migration and assertions with `ON_ERROR_STOP=1` to prove idempotency.

Immediately verify the exact eleven promotion relations, RLS/FORCE, owner, pinned search paths, narrow function grants, absence of direct application table DML and the public compiled-read grant. Prove old checkout functions remain present and unchanged, legacy discounts remain present, mappable legacy rows are adopted once as drafts, and an unmappable row remains read-only. Do not publish adopted drafts automatically.

## Deployment order

After migration and assertions pass:

1. Deploy Storefront Shared at the exact merge SHA and verify running SHA and health.
2. Deploy Customer Panel at the exact merge SHA and verify running SHA and health.
3. Deploy Analytics Worker or Owner only if their runtime artifacts changed; otherwise record their unchanged SHAs.

Do not bypass payment build-evidence gates, alter provider test/live modes, restart unrelated containers, or silently return to an older SHA.

## Staging certification

Use only timestamped `ATLAS-QA-PROMO-*` products, campaigns, batch codes and offline/non-charged checkout facts. Verify the template chooser, five-step wizard, natural-language summary, dirty-state protection, conflict and margin gates, simulator, publication, pause/resume, archive, code batch/CSV, same-host share link, automatic/code cart display, progress hints, offline checkout, immutable order snapshot, refund cap and PostgreSQL-truth analytics.

Verify store-owner/admin management, editor draft-only behavior, analyst read/simulate-only behavior, cross-origin rejection and cross-tenant opacity. Run Chrome at 1440, 1024 and 390 CSS pixels; horizontal overflow, console errors, unexpected warnings, login loops and unexpected 4xx/5xx must all be zero.

## Redis outage drill

Stop only the staging cache dependency after recording its exact resource identity. Do not stop PostgreSQL or any production cache. While Redis is unavailable, quote the same QA cart repeatedly and prove the canonical PostgreSQL evaluator returns the same discount, checkout remains available and no unexpected 5xx occurs. Restore the same cache resource, verify health and confirm a fresh compiled projection can be cached. Reservation, redemption, idempotency and analytics must remain PostgreSQL-backed throughout.

## Standard rollback

`STANDARD ROLLBACK = CODE ROLLBACK ONLY.` Redeploy the previously verified Customer Panel and Storefront commits while leaving additive migration 126 in place. Verify old application + new schema behavior and health. Do not delete promotion data, order snapshots, reservations, redemptions or audits.

`DOWN MIGRATION = EMERGENCY, PRE-RESTORE ONLY.` The down migration must be run only under an approved incident procedure immediately before restoring the verified pre-migration backup. Its guard must refuse when promotion, reservation, redemption, hosted-session or order-snapshot data exists. Never weaken or bypass the guard.

## Cleanup and evidence

Archive QA campaigns and products, pause or revoke QA batches, release active QA reservations, revoke QA recovery tokens, restore temporary payment/shipping settings and remove temporary CSV/fixture files. Preserve audit-required promotion, redemption and order-snapshot history. Verify real Güzide product, customer, order and campaign counts were not mutated by comparing the recorded safe baselines.

The closeout record contains merge and running SHAs, resource UUIDs, health codes, backup timestamp/size/checksum, restore result, migration/assertion/replay result, browser viewport results, safe QA fixture identifiers, Redis outage result and cleanup result. It contains no secrets, customer data, raw coupons, recovery tokens or database URLs. Preserve the source branch until Atlas closes staging certification.
