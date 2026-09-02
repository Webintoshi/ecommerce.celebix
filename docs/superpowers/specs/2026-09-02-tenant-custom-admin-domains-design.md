# Tenant Custom Admin Domains Design

## Scope

Add tenant-owned admin hostnames to the shared `apps/customer-panel` runtime without changing storefront routing or removing platform fallback hostnames. The pilot hostname is `admin.guzidekuyumcu.com.tr`; the existing `guzide-kuyumcu-4.admin.saas-staging.celebix.site` hostname remains active.

## Existing authority

- `saas.store_domains` is the storefront hostname authority and remains unchanged.
- `saas.admin_domains` is globally unique, store-bound, active/disabled, and already resolves platform admin hosts.
- Customer Panel sessions are store-bound and cookies are host-only.
- Cloudflare for SaaS already provisions and monitors storefront custom hostnames with TLS 1.2.
- Central Logto callback completion hands sessions to a destination admin host.

## Data model

Migration 120 extends `saas.admin_domains` instead of introducing a competing hostname table. `kind` remains `platform_subdomain | custom_alias`; `canonical` becomes the primary-admin marker for either kind. Provider, DNS, TLS, origin-health, retry, and audit columns mirror the proven storefront lifecycle where appropriate.

Invariants:

- `store_domains` and its resolver remain storefront-only.
- `admin_domains` and its resolver remain admin-only.
- An admin hostname is globally unique and belongs to exactly one store.
- A store has at most one active primary admin hostname.
- A verified active custom alias may be primary; the verified active platform hostname remains as fallback.
- Pending, failed, disabled, or deleted rows do not resolve Customer Panel tenant authority.
- A custom hostname is not made primary until DNS, certificate, and origin health are all ready.

The migration replaces affected SQL functions in place so old application code remains compatible with the new schema. URL selection is custom primary, then active verified platform fallback, then fail closed.

## Request authority and tenant isolation

The request hostname is normalized as an exact DNS hostname, with a valid numeric port removed when present. It is derived from the direct `Host` header. `X-Forwarded-Host` is not accepted as tenant authority; Coolify/Traefik must preserve the external Host header.

Before protected Customer Panel content or mutations are served, the server resolves the active admin hostname and requires its store identity to equal the store in the authenticated session. The browser cannot supply store ID, slug, or tenant headers. Unknown hosts, storefront hosts, disabled admin hosts, and cross-store sessions fail closed.

## Lifecycle and operations

The admin-domain service has list, create, recheck, make-primary, and disable operations. It reuses the Cloudflare for SaaS adapter but persists through admin-domain-specific SQL functions and projections. The settings page shows storefront and admin domains as separate purposes, including DNS, TLS, primary/fallback, last check, and recheck controls.

For the pilot, Cloudflare for SaaS is preferred because the existing adapter provides hostname ownership, managed certificate state, TLS 1.2, and origin-health lifecycle without binding certificate issuance to one Coolify deployment. Coolify still receives the hostname on the same Customer Panel application so the origin route is explicit.

## Authentication and cookies

The existing central Logto callback is retained. The exact discovered callback and logout-return paths are registered for the custom host, without wildcards or HTTP. Returning login and cross-host handoff SQL accept any verified active admin hostname belonging to the selected store, not only platform subdomains.

Login returns to the initiating admin hostname. Logout derives its return origin from the resolved request admin hostname. Session cookies stay `Secure`, host-only, and SameSite-protected; neither storefront nor sibling admin host receives the other host's cookie. Same-origin mutation checks accept the resolved custom admin origin and reject every other origin.

## Compatibility and rollout

- Old code + migration 120: platform primary and existing resolver behavior remain valid.
- New code + migration 120: custom primary and platform fallback both resolve.
- Code-only rollback + migration 120: platform fallback remains usable; custom-primary selection remains a valid HTTPS origin.
- Down migration is emergency/pre-restore only.

Rollout is migration-first after a verified backup, followed by fallback-host smoke, exact merge-SHA deploy, Cloudflare/DNS/TLS activation, exact Logto URI registration, custom-host browser QA, and fallback regression QA.

## Rollback

Remove custom primary status while retaining the platform fallback, stop traffic, remove exact Logto URIs and the Customer Panel FQDN, safely remove the Cloudflare/DNS hostname, and roll code back. The storefront apex and `www` records are never touched.

