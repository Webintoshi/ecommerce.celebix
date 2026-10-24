# Custom domain origin routing repair

**Goal:** Restore Ezmeo's validated custom storefront/admin addresses and supply the missing shared origin route lifecycle.

**Evidence:** Cloudflare custom hostname and SSL are active for both Ezmeo addresses; DNS ownership records match. Public HTTPS returns Traefik's `503 no available server`. The actual SaaS fallback is the existing direct staging origin. Legacy merchants have exact proxy routes, but the existing wildcard file covers platform subdomains only. Do not switch to the obsolete tunnel adapter: it rewrites the transport host and currently returns another store's health.

**Architecture:** Read only eligible, provider-bound custom domains and their active platform hostname from the existing native database. Render exact-host routes to the same NET/SITE shared services and authority/OTP middleware chains as the existing platform routing. A bounded host service atomically replaces one owned proxy file only when its contents change. No application deployment, native migration, provider alteration, tenant impersonation, or direct domain-state mutation.

## Tasks

- [x] Add a strict pure route generator and regression tests for storefront/admin, NET/SITE, authority/OTP preservation, malformed/duplicate/reserved input, and unknown-host denial.
- [x] Add the read-only snapshot/apply wrapper, serialized against the existing canonical publication lock; failures retain the current proxy file.
- [x] Run focused tests, signup source compatibility and fresh NET/SITE HTTPS edge checks.
- [x] Install the narrowly scoped host service/timer and initial route file, retaining a concrete rollback.
- [x] Verify trusted public HTTPS identity for both Ezmeo addresses and existing merchants, then use the existing domain recheck/activation controls.
- [x] Verify public storefront, admin login, unknown-host denial, unchanged app/native pins, and timer no-op stability. Save operational evidence.

## Constraints

- The database remains the authority for host ownership and tenant access. Pending rows can receive health probes, but routing never marks a domain active or grants a session.
- Exact registered hosts only; no arbitrary external-host catch-all and no per-merchant application configuration.
- Preserve current Cloudflare fallback, DNS instructions, TLS configuration, proxy services and all existing route files.
- Timer reads only, at most once per minute; no provider polling, application rebuilds, or continuous storefront requests.
- If schema, dependency, input, lock or publication fails, report a generic failure/defer and keep the existing file.
