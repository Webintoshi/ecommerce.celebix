# Shared tenant HTTPS repair — 2026-10-21

## Incident and cause

Hızlı Kutu Ambalaj's registration had committed and its canonical NET host bindings were active. The new admin and storefront names resolved to the shared origin, but the proxy presented its self-signed default certificate. Older tenants worked through individual exact-host certificates. Neither NET nor SITE had the required shared storefront and nested admin wildcard certificates/routing installed.

Database signup compatibility and HTTP application builds did not establish public HTTPS readiness. No customer registration, handoff token, OTP, or authenticated session was replayed to repair or verify this incident.

## Live changes

1. Installed an additive exact-host NET configuration for Hızlı Kutu using the existing shared services and OTP ingress middleware. Let's Encrypt HTTP-01 issued trusted certificates for its current addresses. Existing proxy configuration was preserved.
2. Created a separate user-approved Cloudflare token with Zone Read and DNS Edit for only `celebix.net` and `celebix.site`, usable only from the current server IPv4. The credential is stored root-only outside the proxy mount; temporary local and initial server copies were removed after canonical installation.
3. Issued two independently managed certificates containing all four required wildcard names. The official `goacme/lego:v4.35.2` Docker image is pinned to index digest `sha256:ae124a405844759b201b31efbd7a0ba302dbd16e86f2fb177c4b6db8bdc782c8`. Actual CLI help and a command with the real mounts were checked. The official image's `/lego` executable must not be shadowed by a directory bind; managed state is mounted at `/var/lib/lego`.
4. Atomically published only `celebix-tenant-wildcard-tls.yml` and `celebix-tenant-wildcard-routes.yml` through the existing Traefik file provider. Twelve bounded NET/SITE routers reuse existing services and middleware; reserved platform names and existing exact routes retain precedence. Unknown hosts receive no tenant authority.
5. Installed the canonical root-operated helper and a daily renewal timer. A real renewal run completed successfully without republishing fresh certificates before the timer was enabled. Renewals use the fixed 30-day threshold, preserve the current publication on failure, and require both certificate pairs to validate before replacement.

Canonical locations and failure/rollback recovery are documented in [the operations guide](../operations/tenant-wildcard-certificates.md). No application image, application environment, database schema, customer data, or existing proxy/router file was changed. The six application runtimes and central application configuration digest were identical after the repair. Traefik was not restarted.

## Acceptance evidence

- Strict public TLS passed for fresh random NET and SITE admin/storefront names. Both wildcard certificates cover exactly their two intended names and expire on 2027-01-19.
- `npm run verify:signup-edge` passed for both environments: healthy known tenant/platform endpoints, four fresh wildcard TLS probes, and application 404 responses for unknown tenants. Proxy fallback 503 responses now fail the combined gate.
- Hızlı Kutu admin login and storefront returned HTTP 200. Its branded WhatsApp login screen opened in the browser without a certificate interstitial.
- The bare `/auth/handoff` URL returned expected HTTP 405: this is a POST-only route. No handoff payload was submitted.
- Butik Siora login returned HTTP 200. Güzide, Alpler and Lilyum branded login pages loaded in the browser. Raw non-browser requests to their custom domains encountered Cloudflare 403 protection; these were not misclassified as an application outage.
- The renewal service completed with `Result=success`, `ExecMainStatus=0`, and `published=false`; the timer was active and enabled afterward.
- Focused route/edge/guard tests and 11 offline cryptographic/publication tests passed. Both real disposable PostgreSQL signup suites passed: 8 current-signup and 9 historical-snapshot checks, with zero external database connections.
- The source-bound release receipt includes the new infrastructure and readiness scripts. CI now separately checks public NET/SITE HTTPS and routing, without customer credentials.

Private operational receipts are kept in the task workspace and on the server; credentials, private keys, raw provider logs and customer authentication artifacts are excluded from repository evidence.

## Limits

This acceptance verifies public HTTPS, correct host denial/routing and unauthenticated login rendering. It does not claim a new authenticated customer signup was completed during verification. Public probes sample a resolved endpoint and do not certify every possible A/AAAA address or backend. Certificate renewal failures require normal operational follow-up; no notification integration was added.
