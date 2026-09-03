# Redis Cache Foundation Design

Date: 2026-09-03
Status: Approved for staging execution by Atlas

## Objective

Add one environment-scoped, cache-only Redis service and a reusable fail-open cache package. The first production consumer is the shared Storefront public projection layer. Customer Panel mutations invalidate Storefront namespaces only after their PostgreSQL transaction succeeds. Owner, Customer Panel, and Storefront expose cache dependency state without turning an optional cache outage into an application outage.

## Safety boundary

PostgreSQL remains the source of truth. Redis is never an authority for hostname resolution, authentication, sessions, carts, checkout, orders, payments, stock, idempotency, provider credentials, customer data, or any personally identifiable information. Cache keys contain only the environment namespace, opaque store UUID, a fixed data-class name, a schema version, a namespace token, and a SHA-256 digest of normalized public query inputs.

The cache is staging-only in this delivery. No database migration is required. `apps/admin/**` is outside the implementation scope.

## Resource topology

Coolify receives one private resource named `celebix-staging-redis-cache` in the existing Celebix staging project and environment. It uses the pinned official `redis:8.10.1-alpine` multi-architecture digest `sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576`. It exposes no public port or FQDN, requires authentication, and is reachable only on the Coolify internal network.

Limits are 0.5 CPU, CPU weight 512, 512 MiB reserved memory, and 768 MiB hard memory with swap no greater than the hard limit. Redis `maxmemory` is 512 MiB with `allkeys-lfu`. Persistence is disabled with `appendonly no` and `save ""`; `protected-mode yes`, TCP keepalive 60 seconds, and idle timeout 0 are retained.

## Package architecture

`@celebix/saas-cache` owns:

- strict environment parsing for enabled, required, connection/command timeouts, TTLs, payload size, namespace, and URL;
- a process singleton around the exact-pinned official Node Redis client;
- deterministic normalized query hashing and central tenant-safe key construction;
- versioned JSON envelopes, runtime parsing, payload limits, TTL jitter, negative entries, and process-local singleflight;
- fail-open read-through behavior, bounded Redis commands, namespace-token rotation, health state, counters, and graceful shutdown.

When cache configuration is disabled, malformed, unavailable, or slow and `REDIS_CACHE_REQUIRED=false`, application reads go directly to PostgreSQL. Redis failures are classified and counted without leaking the connection URL or user data.

## Storefront reads

The Storefront repository decorator leaves `getPublicStorefront(hostname)` uncached because hostname authority must always come from PostgreSQL. Once a trusted storefront projection supplies the store UUID, the decorator caches only public, reproducible projections:

- public product lists and category product lists;
- public product detail and related products;
- public product media;
- public storefront design;
- public campaign-home projection.

Catalog entries use the catalog TTL; design/settings entries use the settings TTL. Not-found results use the negative TTL. Cached envelopes are parsed before use; malformed, oversized, or schema-mismatched data is discarded and reloaded from PostgreSQL.

## Invalidation

Customer Panel repository decorators call the real mutation first. Only a successful return triggers an awaited, fail-open namespace rotation for the affected store. Catalog, media, pricing, and merchant-resource mutations rotate the catalog namespace; design and storefront-asset mutations rotate the settings namespace. Failed or rolled-back writes never invalidate. No `KEYS`, wildcard delete, or `FLUSH*` command is used.

Namespace-token rotation makes all prior keys unreachable without a scan. Token keys are store- and data-class-scoped, so one tenant cannot evict or read another tenant's entries.

## Health and observability

Each application reports cache as `disabled`, `healthy`, or `degraded`. Optional-cache degradation preserves HTTP 200 when the application's authoritative dependencies are healthy. Metrics are bounded counters for hit, miss, negative hit, bypass, error, write, invalidation, and singleflight join, grouped only by fixed scope names.

## Verification

Unit tests cover parsing, key isolation, normalization, envelope parsing, payload limits, TTL jitter, singleflight, fail-open behavior, and invalidation ordering. A disposable Redis harness runs against the exact deployed image/digest and proves authentication, read/write/TTL, negative caching, namespace rotation, outage fallback, and reconnect without application restart.

Staging verification records 20–50 controlled cold and warm samples, hit ratio, mutation freshness, application health during a Redis stop, automatic reconnect after restart, browser console/network results, and cleanup of the single prefixed QA product.

## Rollback

Code rollback is sufficient because no schema changes exist and PostgreSQL remains authoritative. Redis can be disabled per application with `REDIS_CACHE_ENABLED=false`. Deleting the cache resource is optional cleanup only after applications no longer reference it.
