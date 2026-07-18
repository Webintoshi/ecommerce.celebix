# Shared storefront shell

This is a placeholder, fail-closed Next.js runtime for Phase 1. It serves no catalog, order, customer, checkout, payment, object storage, cache, or database data.

The request adapter ignores raw `Host`, `Forwarded`, `X-Original-Host`, `X-Host`, cookies, and query parameters for tenant authority. In approved staging it accepts `X-Forwarded-Host` only after a fixed storefront-only proxy header authenticates the Coolify-managed Traefik hop with a canonical 32-byte token and `X-Forwarded-Proto` is exactly `https`. Missing, partial, malformed, or production configuration remains disabled, and every invalid proxy authority returns the controlled `503` before any domain resolver or store loader runs.

The default route has no resolver and returns a controlled `503` page. There is no environment-derived slug or default tenant. `createStorefrontRequestHandler` accepts an exact `StoreDomainResolver` and authoritative store loader through dependency injection for tests and later integration. Unknown, unverified, disabled, inactive, ambiguous, invalid, and mismatched hosts never receive a storefront context.

Alias redirects are available only after the alias target is independently resolved as an exact active, self-canonical record for the same store ID and slug. Missing targets, cross-tenant targets, and redirect chains return the fail-closed shell without a `Location` header.
