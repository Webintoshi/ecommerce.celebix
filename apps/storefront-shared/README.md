# Shared storefront shell

This is a placeholder, fail-closed Next.js runtime for Phase 1. It serves no catalog, order, customer, checkout, payment, object storage, cache, or database data.

The request adapter selects the direct `Host` header and deliberately ignores `X-Forwarded-Host`. A production reverse proxy may only supply forwarded authority after an explicitly reviewed trust configuration; proxy trust, DNS, TLS, wildcard routing, persistence, and deployment are later infrastructure gates.

The default route has no resolver and returns a controlled `503` page. There is no environment-derived slug or default tenant. `createStorefrontRequestHandler` accepts an exact `StoreDomainResolver` and authoritative store loader through dependency injection for tests and later integration. Unknown, unverified, disabled, inactive, ambiguous, invalid, and mismatched hosts never receive a storefront context.
