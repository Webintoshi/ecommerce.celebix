# Shared storefront

This is the fail-closed Phase 3A4 shared public storefront. It resolves an exact active hostname through the reviewed PostgreSQL public role and renders only active catalog and media projections. It has no checkout, payment, customer, or authenticated merchant authority.

The request adapter ignores raw `Host`, `Forwarded`, `X-Original-Host`, `X-Host`, cookies, and query parameters for tenant authority. In approved staging it accepts `X-Forwarded-Host` only after a fixed storefront-only proxy header authenticates the Coolify-managed Traefik hop with a canonical 32-byte token and `X-Forwarded-Proto` is exactly `https`. Missing, partial, malformed, or production configuration remains disabled, and every invalid proxy authority returns the controlled `503` before any domain resolver or store loader runs.

The default runtime remains disabled unless both the trusted proxy and complete isolated staging data profiles are active. There is no environment-derived slug or default tenant. Unknown, pending, disabled, or inactive exact domains receive no storefront context; invalid proxy authority is rejected before PostgreSQL access.

Alias redirects are available only after the alias target is independently resolved as an exact active, self-canonical record for the same store ID and slug. Missing targets, cross-tenant targets, and redirect chains return the fail-closed shell without a `Location` header.
