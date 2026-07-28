# Tenant R2 Media and Export Isolation Design

**Date:** 2026-07-28

**Status:** User-approved for implementation planning

**Working branch:** `codex/guzide-woocommerce-migration-foundation`

**Current base:** `42f847d8384ebc00492a16ba03b5471643419591`

**Targets:** shared-SaaS PostgreSQL, `packages/saas-contracts`, `packages/saas-data`, `apps/owner`, `apps/customer-panel`, `apps/storefront-shared`, and focused Phase 2/3 tests

## 1. Outcome

Every Celebix store receives a durable, immutable object-storage namespace as part of tenant creation. Celebix owns one private Cloudflare R2 bucket per deployment environment. Stores never receive bucket credentials and never select a storage namespace. All object authority is derived server-side from the current durable `TenantContext.store.id`.

The delivery also closes the current bulk-catalog gap: provider image URLs are no longer silently ignored. They are ingested through a bounded, SSRF-safe, durable media workflow and become store-scoped R2 objects plus authoritative `saas.product_media` records.

Merchant data portability is provided through independent exports for products, product media, customers, orders, categories and brands, content, and settings/integrations. There is deliberately no single export-all operation. Secrets, credentials, sessions, tokens, and raw provider configuration are never exported.

## 2. Selected approach

Use a Celebix-managed private R2 bucket per environment with a durable namespace registry and strict store-prefixed object keys:

```text
stores/<storeId>/products/<productId>/<mediaId>.<extension>
stores/<storeId>/content/<contentId>/<mediaId>.<extension>
stores/<storeId>/imports/<jobId>/<itemId>.<extension>
stores/<storeId>/exports/<exportType>/<jobId>/<artifact>
```

The namespace is a logical isolation boundary, not an R2 folder or merchant credential. R2 has a flat object namespace; PostgreSQL is the durable namespace and lifecycle authority.

Rejected alternatives:

- Store ID prefixes without a durable registry do not prove that a new tenant completed storage provisioning and provide no lifecycle authority for suspension, deletion, or export.
- A bucket and credential per merchant creates unnecessary credential sprawl, provisioning failure modes, Cloudflare API dependency, and support overhead.
- Browser-supplied object keys, store IDs, public URLs, source URLs, or export types would create cross-store authority and are forbidden.
- A public R2 bucket cannot safely hold customer/order exports. The bucket remains private; public media and private exports use different delivery paths over the same private store.

## 3. Non-negotiable authority boundaries

- Durable PostgreSQL session revalidation and `TenantContext` remain the only merchant authority.
- Store, tenant, principal, membership, plan, namespace, object key, bucket, and public origin are never accepted from browser input.
- R2 account ID, access key, secret, bucket name, and signing material remain server-only and are never stored per merchant.
- A repository operation may address only the exact immutable namespace for `TenantContext.store.id`.
- PostgreSQL rows and R2 keys must carry the same store authority. A mismatched store prefix fails before R2 access.
- Direct app-role table writes remain denied. Reviewed SECURITY DEFINER functions enforce active store, membership, subscription, feature, plan version, and effective storage limit.
- R2 is blob authority; PostgreSQL remains product, customer, order, content, media relationship, lifecycle, quota, and export-job authority.
- Production R2 provisioning, credentials, deployment, and migration execution require a separate explicit gate.
- `apps/admin/**` remains unchanged.

## 4. Current gap

The current manual product-media route already generates `stores/<storeId>/products/...` keys and writes image bytes to R2. `PostgresProductMediaRepository` independently rejects non-namespaced keys. This is a sound base.

The missing guarantees are:

- tenant creation does not persist a storage namespace/provisioning proof;
- the customer-panel media runtime is staging-only and bucket configuration is application-global rather than represented by a durable store binding;
- catalog import treats `images`, `image`, `image src`, and `media` columns as unsupported and discards them;
- there is no durable remote-image ingestion workflow, item-level recovery, or orphan cleanup;
- there is no store-scoped export job authority;
- the current public media origin model does not establish that private export prefixes are unreachable.

## 5. Architecture

```text
self-serve tenant completion
  -> create store/principal/membership/subscription/domain
  -> create immutable store media namespace in the same PostgreSQL transaction
  -> finalize tenant snapshot only when namespace proof matches the store

authenticated media/import request
  -> durable panel session
  -> current TenantContext
  -> exact active store namespace
  -> reserve durable object/media operation
  -> validated R2 PUT
  -> finalize PostgreSQL media relationship
  -> public product-media delivery through allowlisted media gateway

authenticated export request
  -> current TenantContext + export entitlement/role
  -> create one typed export job
  -> store-scoped snapshot/stream
  -> private R2 artifact + manifest/checksums
  -> short-lived authenticated download grant
  -> expiry cleanup
```

## 6. Persistence authority

Migration `202607280058_store_media_namespace_exports` introduces the following authorities and is added to a dedicated phase manifest with checksums for every new up/down SQL file.

### 6.1 `saas.store_media_namespaces`

- `store_id uuid` primary key and foreign key to `saas.stores`;
- `namespace_prefix text` unique and constrained to exact `stores/<storeId>/`;
- `status text` constrained to `active`, `suspended`, `deleting`, or `deleted`;
- positive monotonic `version`;
- immutable `created_at` and monotonic `updated_at`;
- nullable safe operational failure code, never provider text or credentials.

The store ID and prefix are immutable. No app-role direct `INSERT`, `UPDATE`, or `DELETE` is granted. Existing stores are backfilled only after validating UUID, status, subscription, and absence of conflicting prefixes. A trigger prevents store or prefix mutation even by an accidentally over-privileged caller.

Tenant creation inserts the namespace in the same transaction that creates the store graph. The immutable committed tenant result is extended with a safe storage-readiness proof and is validated against the persisted namespace before the registration workflow can become `tenant_created`. Replays return the same namespace proof and never create a second binding.

### 6.2 `saas.store_media_operations`

This table is the cross-system lifecycle ledger for manual and imported media:

- operation ID/fingerprint and store namespace binding;
- product/variant/content target authority;
- server-generated media ID and exact object key;
- safe media type, expected byte limit, source kind, and source digest;
- state `reserved`, `uploaded`, `committed`, `cleanup_required`, or `deleted`;
- bounded attempt/recovery metadata and timestamps;
- no raw remote URL, image bytes, credentials, cookies, or provider response.

The same operation/fingerprint is idempotent. A different fingerprint for an existing operation is rejected. State transitions are one-way and use row locks plus expected version.

### 6.3 `saas.catalog_media_ingest_jobs` and items

One catalog import can create a bounded media-ingest job after the product/variant records are durably committed. Each item binds:

- import job, store, product, optional variant, and deterministic position;
- a digest of the exact source URL plus authenticated encrypted source-URL ciphertext, IV, and key ID required by the bounded worker;
- reserved media/object authority;
- state `queued`, `processing`, `committed`, `failed`, or `cleanup_required`;
- one safe error code and bounded attempts.

Items are independently retryable without duplicating objects. Decryption keys come only from the server-owned rotating key ring. Raw URLs never appear in SQL function projections, browser payloads, logs, error text, operation fingerprints, or export artifacts. Terminal items erase the ciphertext after the configured recovery window. Product import success and media ingestion status are reported separately and truthfully.

### 6.4 `saas.store_export_jobs`

Each row represents one store and exactly one export type:

```text
products
product_media
customers
orders
categories_brands
content
settings_integrations
```

It stores operation/fingerprint, state, schema version, snapshot boundary, object key, byte count, record/file counts, artifact SHA-256, manifest SHA-256, expiry, safe failure code, timestamps, and monotonic version. It stores no download signature or secret.

Allowed states are `queued`, `processing`, `completed`, `failed`, `expired`, and `deleted`. Only bounded worker claims may move queued work to processing. Completion requires the exact reserved object key and expected checksums. Expired jobs cannot issue downloads and are deleted from R2 by a bounded cleanup worker.

## 7. Object-key and delivery policy

All object keys are generated by server-only pure functions from validated UUIDs and fixed enum values. They reject traversal, encoding alternatives, duplicate separators, backslashes, control characters, oversized values, unexpected extensions, and caller-provided prefixes.

The R2 bucket is private and its `r2.dev` endpoint and direct public-bucket custom-domain access remain disabled. Two delivery paths exist:

- Public storefront media uses a dedicated Cloudflare Worker custom origin with an R2 binding. The Worker permits only the exact server-generated product/content media key grammar and safe GET/HEAD behavior, rejects `imports/` and `exports/` before R2 access, and applies bounded cache/content headers. It never contains R2 API credentials because the binding supplies server-side access.
- Export downloads use a short-lived server-generated R2/S3 presigned GET URL on the R2 S3 API domain. The authenticated route first revalidates the current session, membership, exact store, completed job, type, version, and expiry. The signature authorizes only GET for one exact object and expires in at most five minutes. R2 CORS allows only the exact customer-panel origin and GET/HEAD. Grants are never logged or persisted.

Public media URLs stored in PostgreSQL use the configured media-delivery origin, not the R2 S3 endpoint. Export object keys never become public media URLs.

## 8. Media write lifecycle

R2 and PostgreSQL cannot participate in one atomic transaction. Writes use a durable saga:

```text
reserved -> uploaded -> committed
                    \-> cleanup_required -> deleted
```

1. PostgreSQL validates current authority, target product/content, media feature, namespace, per-file limit, media-count limit, and effective `storageBytes` quota, then reserves an operation and object key.
2. The server validates bytes and performs one R2 PUT to the reserved key.
3. PostgreSQL finalizes the exact operation and creates/activates `product_media` or content-media authority.
4. A known finalization rejection deletes the exact reserved object and marks the ledger deleted.
5. PostgreSQL `commit_unknown` performs one read-only recovery. It never issues an automatic second finalize write and never deletes an object that may have committed.
6. An unresolved operation becomes `cleanup_required`; a worker proves absence of an active media relationship before deleting the object.

Quota accounting includes active media plus outstanding reserved/uploaded bytes so concurrent requests cannot exceed the plan limit. Archived media remains charged until object deletion completes.

## 9. Bulk catalog image ingestion

Provider mappings retain bounded image URL lists instead of emitting `unsupported_fields_ignored`. The first delivery supports the exact image fields already present in the approved provider exports, including WooCommerce `Images`, while keeping unknown fields truthful.

Remote retrieval is server-only and fail-closed:

- exact trimmed canonical HTTPS URL, bounded length, no credentials or fragment;
- DNS resolution on every hop with IPv4 and IPv6 private, loopback, link-local, multicast, metadata, and internal destinations rejected;
- no request cookies, authorization, referer, forwarded headers, or ambient credentials;
- manual redirect handling with a small fixed hop limit and complete revalidation of every destination;
- connection, total-time, content-length, streamed-byte, dimension, and image-count limits;
- status 200 only; redirects, partial content, HTML, SVG, text, archives, and malformed/missing/comma-separated content types rejected;
- fatal byte-signature validation using the existing JPEG/PNG/WebP allowlist;
- no raw URL, image bytes, or provider response in logs or browser errors.

The exact remote URL remains available only inside the short-lived authorized job payload required to execute the fetch and is removed or cryptographically protected after terminal completion. The storefront uses only the resulting Celebix media URL.

The import report shows product totals and separate media totals: queued, committed, failed, and retryable. One image failure does not attach a different image, duplicate a product, or silently claim full success.

## 10. Independent exports

There is no export-all route or UI action. Each export type is requested, authorized, produced, downloaded, expired, and audited independently.

- `products`: CSV and versioned JSON for products, variants, pricing, inventory-facing quantities, descriptions, statuses, and stable public references.
- `product_media`: ZIP/TAR-compatible archive of real media bytes plus a mapping manifest; no external hotlinks.
- `customers`: bounded CSV and JSON with the merchant's durable customer records only.
- `orders`: bounded CSV and JSON with durable orders and line items only; payment secrets and provider payloads are excluded.
- `categories_brands`: CSV and JSON taxonomy plus product relationships.
- `content`: content records and their separately authorized media mapping.
- `settings_integrations`: safe configuration metadata. Secret values, tokens, private keys, passwords, callback credentials, and session material are replaced by non-sensitive configured/not-configured indicators.

Exports use a consistent manifest containing schema version, store authority, export type, snapshot time, file list, sizes, record counts, and SHA-256 checksums. The manifest contains no secret or cross-store identifier beyond the requesting store's own export authority.

Large exports stream and paginate; they never load the entire store dataset or archive into process memory. A completed artifact is immutable. Re-running an export creates a new job and snapshot, not a mutation of the previous archive.

## 11. HTTP and user experience

Media and export endpoints require the genuine panel session and freshly resolved `TenantContext`. Mutating requests additionally require exact same-origin authority, fixed methods and paths, bounded body/content type/content length, and operation IDs.

The admin panel shows:

- storage readiness and usage without exposing bucket, prefix, credential, or internal UUID;
- truthful manual upload progress and safe errors;
- catalog import product and image progress separately;
- one action per export category, with queued/running/completed/failed/expired states;
- download only for a current completed non-expired job;
- retry that creates/resumes the same authorized operation without duplicate output.

Browser payloads contain no full `TenantContext`, raw object key, R2 endpoint, signing credential, internal source URL, or cross-store count.

## 12. Error and recovery policy

- Missing/inactive namespace: fail closed before R2 access; do not fabricate readiness.
- Inactive store/membership/subscription or missing media feature: deny before object reservation.
- Quota/media-count exceeded: stable non-retryable limit error; no R2 PUT.
- Invalid or unsafe remote image: fail only that ingest item with a stable safe code.
- R2 timeout/network/5xx: leave a recoverable reserved item; no second blind write.
- Known R2 rejection: mark the item failed without a media row.
- PostgreSQL finalization rejection: delete only the exact uncommitted reserved object.
- PostgreSQL unknown commit: evict the client, perform one read-only recovery, and never issue an automatic second mutation.
- Export failure: no completed/downloadable projection; partial object is cleanup-required.
- Cleanup failure: bounded retry with safe operational code; never delete a key outside the exact store and operation.
- Store deletion: namespace moves to deleting only after retention/export policy approval; object deletion is enumerated by exact prefix and audited before status deleted.

## 13. Test and evidence matrix

Implementation is test-first. Required automated evidence includes:

- namespace parser/key-builder immutability, traversal/encoding/near-match, and cross-store negatives;
- tenant creation/replay/concurrency/unknown-commit tests proving one immutable namespace and no completed tenant without it;
- migration apply/assert/rollback/reapply, manifest checksum, grants, RLS, backfill, cross-store denial, direct-write denial, lifecycle, operation recovery, and cleanup on disposable PostgreSQL 16;
- repository tests proving `TenantContext`-derived authority, exact query parameters, quota concurrency, item state transitions, and safe projections;
- R2 adapter tests for exact host/key/method, signed request, redirect denial, status handling, timeout, and no secret logging;
- media saga tests for success, known failure, unknown commit, orphan cleanup, replay, and cross-store object substitution;
- remote-fetch tests for IPv4/IPv6 SSRF classes, DNS rebinding, every redirect hop, credentials, schemes, ports, content types, byte/dimension/count limits, malformed images, timeout, and no ambient headers;
- provider tests proving WooCommerce and other approved image columns map in order without losing exact product association;
- import tests proving product/media status separation, partial image failure, retry, idempotency, and no silent image discard;
- export tests for every independent type, role/session/store isolation, snapshot consistency, pagination/streaming, manifest/checksums, redaction, expiry, signed download, and cleanup;
- public media gateway tests proving products/content may be read while imports/exports, near-match paths, wrong methods, unknown/archived/cross-store media, range abuse, and unsafe content are denied;
- UI tests for storage readiness, upload/import progress, independent export actions and all terminal/error/empty states;
- customer-panel, Owner, storefront-shared, SaaS contracts/data, Phase 1/2/3 regression, typecheck, build, and `git diff --check`;
- tracked-diff, bundle, DOM/RSC/network, PostgreSQL projection, R2 listing, runtime-log, raw-secret, token, cookie, private-ID, source-URL, and cross-store artifact scans;
- `apps/admin/**` diff count remains zero.

Staging acceptance uses at least two disposable stores to prove positive access and symmetric cross-store denial. It verifies namespace creation during genuine registration, manual upload, bulk WooCommerce image ingestion, storefront delivery, each export type, expiry/cleanup, quota behavior, and zero production impact. Staging deployment and Cloudflare configuration are separate authorization gates.

## 14. Delivery decomposition

This scope is implemented in independently reviewable slices while preserving the final architecture:

1. Namespace persistence and tenant-completion binding.
2. Durable media reservation/finalization/cleanup saga and private-bucket delivery boundary.
3. Bulk catalog remote-image ingestion and truthful progress.
4. Independent export authority, workers, HTTP projection, and admin UI.
5. Disposable PostgreSQL/R2-adapter regression and separately authorized isolated staging acceptance.

No slice may claim completion by displaying UI before its durable authority and negative isolation tests pass.

## 15. Definition of code-complete

Code-complete requires every new store and backfilled store to have exactly one immutable namespace; all writes and reads to derive store authority only from `TenantContext`; bulk imports to persist validated images in R2 and `product_media`; all seven exports to operate independently with private expiring artifacts; two-store cross-isolation, concurrency, recovery, cleanup, quota, SSRF, redaction, and regression matrices to pass; `apps/admin/**` to remain unchanged; and production impact to remain zero.

The feature is live-complete only after separately authorized private R2/media-gateway staging configuration, exact-SHA deployment, two-store browser/API/R2/PostgreSQL acceptance, credential handling proof, cleanup, and production-readiness review.

## 16. Official R2 references

- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 public bucket behavior and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [R2 flat bucket/key model](https://developers.cloudflare.com/r2/buckets/)
- [R2 browser CORS rules](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 object downloads](https://developers.cloudflare.com/r2/objects/download-objects/)
