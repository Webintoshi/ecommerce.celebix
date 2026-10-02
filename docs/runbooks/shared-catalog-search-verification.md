# Shared catalog search verification — 2026-10-02

## Scope

One private Meilisearch index serves existing and future shared storefront tenants. Hostname authority supplies the store filter; cards are hydrated from current database prices, stock and publication state. Transactional catalog triggers maintain a leased, generation-safe outbox. New stores require no additional engine, application or key.

The normalized PostgreSQL search remains the fallback. Header and search page use the same suggestion form. Generic page context no longer loads homepage product sections; the homepage retains its existing complete presentation.

## Verification before release

- Shared storefront: 755 server and 51 browser tests passed (806 total).
- Search provider/worker: 25 focused tests passed; coverage cover exact identifiers, tenant/query-bound cursors, unavailable-provider fallback, migration arrival without a runtime restart, generation-safe acknowledgement and index recreation.
- PostgreSQL 16 disposable socket-only fixture: 20 tests passed. Covers Turkish folding, SKU/barcode/variant/taxonomy matching, relevance, millisecond cursor pagination, new-store indexing, tombstones, concurrent worker leases, stale acknowledgement, retry recovery, Unicode normalization bounds, access control and rollback.
- Infrastructure reconciliation: 15 behavioral tests passed. Private service, scoped keys, idempotent setup, environment preservation and fixed application/field guards.
- Production builds passed for shared storefront, owner and legacy admin. Legacy admin build required public build-only Supabase placeholders; no production credentials were used locally.
- Shared storefront, owner and data-package type checks passed. Legacy admin type check has existing unrelated failures in `variant-attribute-sync.ts`, duplicate `CategoryInfo` and its TypeScript import-extension configuration; this change does not edit those files.
- Full data-package run had one unrelated hosted-checkout child-process timeout under concurrent execution; the affected test passed in isolation. Search tests and the complete shared-storefront suite passed independently.
- Both final migrations were rehearsed against the actual schema in an outer transaction ending in rollback. Lightweight hostname resolution matched existing presentation and canonical authority for four verified primary domains; its restore/reapply path also passed. No durable catalog mutation occurred during rehearsal.

## Release gates and operational checks

Install the private pinned engine and persist the five shared search settings. Publish compatible readers to SITE then NET through the guarded release transport with an exact source pin, a fresh encrypted environment snapshot and unchanged existing payment build authorities. Then apply migrations 194/195 atomically. The scope reader falls back per request until the migration is present; the worker retries its readiness check. This order prevents the new relevance cursor from reaching an old reader. No payment-provider or card operation is part of this release.

Check actual engine count-only search, exact SKU/barcode, typo handling and store filter using removable synthetic documents. After release verify both application image/source pins and health, queue synchronization, private-engine health, public Turkish/ASCII queries, suggestions and tenant separation. Record timings from actual requests; vendor timing claims are not measurements.

Rollback application code before restoring compatible SQL if needed. Preserve the engine volume and key state. Use the supported workflow requeue function for index recovery; the runtime also requeues automatically when recreating an index and periodically reconciles current documents.
