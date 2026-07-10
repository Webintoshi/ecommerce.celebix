# SaaS storefront runtime

This package provides the pure, infrastructure-free storefront request boundary:

`trusted host value -> strict normalization -> exact resolver port -> StorefrontRequestContext -> canonical and tenant namespace helpers`

`StorefrontRequestContext` is intentionally distinct from the frozen authenticated `TenantContext`. Anonymous storefront visitors have no staff principal or active membership, so this package never invents either. The only store authority is the store ID returned by an exact persisted hostname record, and the loaded store record must match it and be active.

## Trust and failure boundary

`normalizeStoreHostname` accepts a host value already selected by a trusted server/proxy adapter. It does not read or trust `X-Forwarded-Host`. Production proxy trust configuration, exact domain verification, TLS issuance, and persistence adapters are later infrastructure gates. Unknown, unverified, disabled, inactive, duplicate, and mismatched records fail closed; there is no suffix lookup or default tenant.

An alias record does not make its `canonicalHostname` authoritative by itself. Redirect eligibility requires a second exact active resolver lookup. The alias, canonical record, and loaded store must share the same store ID and slug, and the canonical record must point to itself. Missing, ambiguous, inactive, cross-store, or chained canonical targets fail closed before a redirect can be emitted.

The included `InMemoryStoreDomainResolver` is for tests only. This phase has no database, object storage, cache, queue, payment, DNS, TLS, or deployment implementation.

Namespace helper inputs are normalized opaque identifiers, not presentation data. Cache and job keys must never receive email addresses, hostnames, customer names, or other PII. Object names should use random or immutable IDs instead of raw customer-provided filenames or names.

## Scale-safe adapter expectations

- Domain caches key by normalized exact hostname, use short negative caching, invalidate by `cacheVersion`, and must not preserve stale ownership after a domain transfer.
- The application runtime remains stateless across horizontal replicas. A pooled database resolver and optional Redis adapter may be supplied later; tenant selection never lives in a process-global variable.
- Object storage uses one controlled shared bucket or controlled shards. Every key starts with a validated `stores/{storeId}/` prefix, and deletion requires the same validated store scope.
- Every job payload carries an authoritative store ID and opaque idempotency key. Workers enforce per-tenant fairness/concurrency and reject globally unscoped payloads.
- Custom domains come only from exact persisted mappings. Verification and TLS remain infrastructure gates; a custom domain does not create a separate application deployment.
