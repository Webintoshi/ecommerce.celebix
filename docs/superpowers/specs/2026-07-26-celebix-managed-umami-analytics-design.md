# Celebix Managed Umami Analytics Design

**Date:** 2026-07-26

**Status:** User-approved for implementation planning

**Implementation branch:** `codex/celebix-managed-umami-analytics`

**Implementation base:** `9e95a85dc553a5b3b533a4f6920a73a7f0427fe4`

**Immutable read-only Hemenaku donor:** `apps/admin` from `fc6c5318b47f045a7cefcedc7612d5b10563ba32`

**Targets:** `apps/customer-panel`, `apps/storefront-shared`, `packages/saas-contracts`, `packages/saas-data`, and versioned shared-SaaS PostgreSQL migrations

## 1. Outcome

Add real, tenant-isolated Umami v3 analytics to the shared Celebix merchant platform. Each active store is mapped to one Umami website owned by the Celebix-managed analytics service. The verified shared-storefront host emits privacy-safe page and commerce events. The authenticated customer panel reads bounded live aggregates through a server-only gateway and renders them in the dashboard and a dedicated analytics console.

No unsupported metric, integration state, historical row, or success message is fabricated. The existing dashboard `analytics` slice remains unsupported until the PostgreSQL authority, provider gateway, authenticated HTTP projection, and loaded/empty/error UI states pass together.

This is the first independent delivery. Shipping integrations follow in a separate design and implementation cycle after this analytics slice is code-complete.

## 2. Selected approach

Use one centrally managed Umami v3 service with one Umami website per verified Celebix store hostname.

Rejected alternatives:

- Merchant-supplied Umami base URLs and API keys create SSRF, secret-sprawl, provider-version, and support risks. They are not accepted in this slice.
- Periodic ETL of all Umami rows into the Celebix database adds stale data and duplicate analytics ownership. The first slice reads live bounded aggregates instead.
- Donor `apps/admin` analytics code uses legacy local/Plausible/Supabase authority and is presentation reference only. It is never imported or copied as runtime authority.

## 3. Non-negotiable boundaries

- `apps/admin/**` remains byte-for-byte unchanged. Donor inspection uses `git show fc6c5318...:<path>` only.
- The browser-facing merchant application remains `apps/customer-panel`; no iframe, reverse proxy to an admin application, or second merchant panel is introduced.
- Merchant authority remains `__Host-celebix_panel` -> durable PostgreSQL session -> current store/membership revalidation -> server-only `TenantContext`.
- Browser requests never provide store, tenant, principal, membership, plan, or Umami website authority.
- Full `TenantContext`, internal UUID authority, database configuration, Umami API credentials, bearer tokens, and provider response bodies never cross into client components, RSC payloads, browser JSON, logs, analytics events, or error text.
- The public Umami website ID may reach the verified storefront document because Umami's tracker protocol requires it. PostgreSQL and the storefront server still select it from the exact trusted hostname; the browser cannot choose a different ID.
- Production deployment, production credential changes, production Umami provisioning, merge, and pilot activation remain separate authorization gates.
- No new third-party SDK is required. The gateway uses the platform `fetch` implementation with local strict validators.

## 4. Architecture

```text
trusted storefront proxy authority
  -> exact active canonical storefront hostname
  -> public analytics configuration projection
  -> exact Celebix-managed Umami tracker origin + website ID
  -> privacy-safe Umami collection

authenticated customer-panel request
  -> durable panel session
  -> current TenantContext and analytics entitlement
  -> store-scoped analytics connection projection
  -> server-only Umami v3 gateway
  -> strict bounded provider-response parser
  -> immutable safe analytics DTO
  -> dashboard analytics slice / analytics console
```

The PostgreSQL connection record is durable mapping authority. Umami remains analytics data authority. The customer-panel gateway does not persist or recreate Umami pageview/session data.

## 5. Persistence authority

Migration `202607260039_store_analytics_authority` introduces:

### `saas.store_analytics_connections`

- `id uuid` primary key;
- `store_id uuid` with a unique active connection per store;
- `provider text` constrained to `umami`;
- `website_id uuid` unique across active connections;
- `hostname text` bound to the store's exact persisted canonical active storefront hostname;
- `status text` constrained to `pending`, `active`, `disabled`, or `failed`;
- `version bigint` monotonic and positive;
- `last_verified_at timestamptz` nullable;
- `created_at` and `updated_at` immutable/monotonic timestamps.

The table contains no Umami API key, password, bearer token, API base URL, tracker URL, user identity, visitor identity, or raw provider payload.

App-role direct `INSERT`, `UPDATE`, and `DELETE` remain denied. `celebix_saas_app` receives only execute permission on reviewed functions. RLS and SECURITY DEFINER functions enforce current store, membership, plan, exact `analytics` entitlement, canonical active hostname, and role.

Required function projections:

- `saas.analytics_connection_get(...)` returns only the active store's public provider, website ID, exact hostname, status, version, and verification timestamp.
- `saas.analytics_connection_get_for_host(requested_hostname, now)` is executable only by `celebix_saas_host_resolver`; it reuses exact host resolution and returns only public tracker configuration for one active canonical hostname. It returns no row for aliases, inactive/unknown hosts, inactive stores, disabled subscriptions/features, or non-active connections.
- `saas.analytics_connection_begin(...)` is restricted to `store_owner`/`admin`, uses an operation UUID/fingerprint, allocates a server-generated Website ID, snapshots the store's currently persisted canonical hostname, and creates or resumes one pending workflow.
- `saas.analytics_connection_activate(...)` accepts only the same operation, fingerprint, Website ID, and exact provider-verified domain before changing `pending` to `active`.
- `saas.analytics_connection_recover_operation(...)` provides exact idempotent operation recovery.
- `saas.analytics_connection_disable(...)` preserves history and prevents further collection/read use without deleting records.

### `saas.analytics_delivery_outbox`

- stores only server-created privacy-safe `purchase` delivery intent;
- binds one unique delivery to store, durable order settlement, analytics connection, event kind, and payload digest;
- stores internal order authority only for idempotency and never projects it to Umami or the browser;
- carries bounded `pending`, `processing`, `delivered`, or `failed` state, attempts, claim expiry, next attempt, safe last-error code, and timestamps;
- is writable only through settlement/outbox SECURITY DEFINER functions and readable only through bounded worker claims and safe operational counts.

`celebix_saas_host_resolver` and `celebix_saas_workflow` receive no direct table privileges. The resolver can execute only the public exact-host projection. The workflow role can execute only bounded outbox claim, delivery acknowledgement, and retry/failure functions. Neither role can execute merchant connection mutation functions.

Connection provisioning is not browser authority. An authenticated merchant sends only enable/disable intent plus an idempotency key. The server derives `TenantContext`, canonical hostname, connection/Website UUID, and provider request. It starts the pending PostgreSQL workflow, calls `POST /api/websites` with the preallocated Website ID, verifies the exact returned ID/domain, and activates the same workflow. If the provider write outcome is unknown, it performs one read-only `GET /api/websites/:websiteId` recovery; it never issues an automatic second create. Database activation `commit_unknown` uses one read-only operation recovery and no second activation write.

## 6. Server-only Umami configuration and gateway

The two applications parse separate immutable profiles from server environment:

- customer-panel private API profile: mode `disabled` or `approved_staging`, canonical HTTPS API base URL, server-only service username/password, request timeout, response-byte maximum, and metric-row maximum;
- storefront public collector profile: mode `disabled` or `approved_staging`, canonical HTTPS tracker script URL, and canonical HTTPS collector origin;
- both profiles must resolve to the same exact approved Umami origin in staging, but the storefront environment never contains the service username, password, bearer token, or private API profile.

Configuration rejects credentials in URLs, fragments, query strings, whitespace changes, control characters, localhost, loopback, link-local, private/internal hostnames, unapproved ports, and non-HTTPS origins. Production-like mode remains disabled until separately authorized.

The gateway:

- exchanges the service credentials for a bearer token, keeps the token only in server memory, and never persists it;
- on a read-only request's first 401, clears the cached token, performs one fresh login, and retries that exact read once; writes are never retried automatically;
- uses `redirect: "manual"` and rejects every redirect;
- requires status 200 for login, read, and website provisioning operations;
- requires one syntactically valid JSON media type and rejects missing, comma-separated, malformed, text, HTML, and wildcard media types;
- enforces `Content-Length` and streamed-body byte limits;
- performs fatal UTF-8 decoding and strict JSON object/array validation;
- bounds time range, timezone, metric type, page count, field length, integer ranges, and result rows;
- calls only the configured Umami origin and the website ID selected from PostgreSQL;
- maps provider/network/timeout/parse failures to stable safe local errors without provider details;
- never logs request authorization, provider bodies, website mapping internals, visitor/session values, or event data.

The first dashboard request set is deliberately bounded to Umami's documented endpoints:

- `GET /api/websites/:websiteId/stats`;
- `GET /api/websites/:websiteId/pageviews`;
- `GET /api/websites/:websiteId/active`;
- `GET /api/websites/:websiteId/metrics` for `path`, `referrer`, `device`, and `country`.

Requests run with a maximum of four parallel provider calls. A short in-process cache retains successful already-parsed immutable safe DTOs, keyed by connection ID, website ID, exact range, timezone, and metric type, for at most 30 seconds. Errors, credentials, response bodies, and cross-store aliases are never cached.

## 7. Public storefront collection

Only a successfully resolved exact active canonical storefront host with an active analytics connection receives tracker configuration.

The storefront document emits:

- the exact approved tracker script URL;
- the selected public Umami website ID;
- the exact trusted hostname;
- `data-domains` containing only that exact trusted hostname;
- `data-auto-track="false"`, `data-exclude-search="true"`, `data-exclude-hash="true"`, and `data-do-not-track="true"`.

A first-party client adapter sends one explicit pageview after each successful route transition. Its payload contains only Website ID, exact trusted hostname, `window.location.pathname`, bounded document title, and a canonical HTTPS referrer origin or empty referrer. It never forwards `window.location.search`, hash, raw referrer path/query, browser cookie, local/session storage, or application state. Because automatic tracking is disabled, the provider script cannot emit a second unsanitized pageview.

The CSP permits only the exact Celebix-managed Umami origin in the minimum required `script-src` and `connect-src` directives. It does not add `*`, broad `https:`, wildcard subdomains, `unsafe-inline`, or merchant-controlled destinations. Disabled, missing, failed, cross-store, alias, unknown-host, and unavailable configurations emit no analytics script or provider destination.

First-party commerce event names are fixed and versioned:

- `product_view`;
- `add_to_cart`;
- `checkout_started`;
- `purchase`.

Allowed event data is limited to non-negative safe numeric value, three-letter currency, bounded product category/slug where already public, item count, and source enum. Names, e-mail addresses, phone numbers, postal addresses, cookies, IP values, raw referrers containing private query data, order/link/cart IDs, session credentials, payment tokens, authorization codes, tenant IDs, and database IDs are forbidden.

`purchase` is enqueued atomically with proven durable payment/order settlement. A bounded worker sends only the safe event payload and marks the claimed outbox row delivered. Replay of the same settlement cannot enqueue a second row. Provider collection failure never changes checkout/order state; the row is retried with bounded exponential backoff and a stable safe error code. Permanently failed delivery remains operationally visible without customer data or provider response text.

## 8. Authenticated HTTP projection

Customer-panel routes:

- `GET /api/analytics/connection`;
- `POST /api/analytics/connection` with only enable/disable intent and idempotency key;
- `GET /api/analytics/summary?range=7d|30d|90d`;
- `GET /api/analytics/metrics?range=7d|30d|90d&type=path|referrer|device|country`.

All routes:

- require the genuine panel session and current `TenantContext`;
- require the `analytics` entitlement;
- accept only the exact GET path and canonical allowlisted query shape;
- reject body, transfer encoding, credentials in URL, duplicate/unknown parameters, private authority headers, and browser-supplied IDs;
- set `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and safe JSON content type;
- return safe `400`, `401`, `403`, `404`, `409`, or `503` error codes with no provider or authority details.

Connection mutation additionally requires exact same-origin `Origin`, `store_owner`/`admin`, a bounded JSON body with an exact content type/length, operation fingerprinting, and a current analytics entitlement. It does not accept hostname, Website ID, Umami URL, credentials, provider, store ID, or status from the browser.

The summary DTO contains:

- time range and `asOf`;
- pageviews, visitors, visits, bounces, bounded total time, and active visitors;
- computed bounce rate and average visit duration derived only from validated integers;
- pageview and visit series;
- comparison values when returned by Umami.

Metric DTO rows contain only a bounded public label and non-negative count. Path labels must be absolute paths without query or fragment. Referrer labels are reduced to a canonical HTTPS origin or the fixed labels `direct`/`unknown`; raw referrer paths and queries are not exposed. No Umami session ID, visitor ID, distinct ID, event ID, user ID, team ID, raw URL query, or provider payload field is exposed.

## 9. Merchant presentation

Navigation gains an `Analizler` destination only in the task that completes its authority, API, and tested UI. It is not shown in disabled/unsupported builds.

The dashboard `analytics` slice changes from `AuthoritySlice<never>` to a typed safe summary. It renders:

- real visitors, pageviews, visits, bounce rate, and active visitors;
- a real time-series chart;
- a clear `Umami · son güncelleme` source label;
- independent loading, loaded, empty, unavailable, retry, and disabled states.

The dedicated `/analytics` console provides 7/30/90-day range selection, pageview/visit chart, top pages, referrers, devices, and countries. It follows the existing Hemenaku-derived shell, topbar, desktop/mobile breakpoints, 48px targets, reduced-motion behavior, keyboard navigation, focus visibility, and no-horizontal-overflow requirements.

No fabricated conversion rate, revenue attribution, live person identity, heatmap, recording, funnel, or campaign ROI is displayed. Revenue continues to come from durable Celebix order authority. This slice does not correlate Umami sessions with order identities.

## 10. Errors and recovery

- Missing/disabled connection: truthful disabled state; no provider call.
- Inactive store, membership, subscription, entitlement, hostname, or connection: deny before provider call.
- Provider timeout/network/5xx/invalid response: stable retryable `analytics_unavailable`; no stale success fabrication.
- Provider authentication denial: stable non-retryable `analytics_configuration_invalid`; secret is not echoed.
- Website/domain mismatch during provisioning: fail closed and do not activate the connection.
- Unknown mutation commit: perform one read-only operation recovery by operation ID/fingerprint; never issue an automatic second write.
- Store hostname change: active connection becomes unusable until a server-authorized re-verification binds the new canonical hostname.

## 11. Test and evidence matrix

Implementation is test-first. Required evidence:

- contract parser exact-shape, numeric bound, URL-label privacy, and deep immutability tests;
- migration apply/assert/rollback/reapply, manifest checksum, grants, RLS, cross-store denial, role/feature denial, idempotency, concurrency, stale version, operation recovery, hostname change, and cleanup under disposable PostgreSQL 16;
- repository SQL/parameter/projection/error/unknown-commit tests;
- configuration tests for disabled/staging/production-like modes and every URL/internal-host near match;
- gateway tests for exact endpoints, authentication headers, timeout, redirect, status, content type, byte limits, fatal UTF-8, malformed/oversized JSON, result limits, and no secret logging;
- authenticated HTTP method/path/query/header/body/session/entitlement/isolation tests;
- storefront exact-host/alias/unknown-host/CSP/script/event allowlist tests;
- dashboard and analytics console loaded/empty/loading/error/retry/disabled tests;
- navigation exact `/analytics` activation plus `/analytics-evil`, child, encoded, query, fragment, and unauthorized-state negatives;
- accessibility checks for keyboard, focus, labels, chart alternatives, 48px targets, contrast, reduced motion, 1024px mobile shell, and 1025px desktop shell;
- desktop and mobile screenshots for dashboard and `/analytics` loaded/empty/error states;
- customer-panel, storefront-shared, saas-contracts, saas-data, Owner regression, typecheck, and production build commands;
- DOM, RSC, network, logs, database safe projections, tracked diff, secret patterns, private IDs, cookies, tokens, visitor IDs, raw query, and provider payload scans;
- `apps/admin/**` diff count remains zero.

Live staging acceptance requires one isolated Umami staging service/database, one disposable staging store/website mapping, generated non-production traffic, exact aggregate verification, failure-mode checks, and credential revocation/retention reporting without raw values. It is a separately authorized deployment gate.

## 12. Official protocol references

- Umami v3 API overview: <https://docs.umami.is/docs/api>
- Authentication: <https://docs.umami.is/docs/api/authentication>
- Websites: <https://docs.umami.is/docs/api/websites>
- Website statistics: <https://docs.umami.is/docs/api/website-stats>
- Events: <https://docs.umami.is/docs/api/events>
- Sending stats: <https://docs.umami.is/docs/api/sending-stats>
- Tracker configuration: <https://docs.umami.is/docs/tracker-configuration>
- Tracker functions: <https://docs.umami.is/docs/tracker-functions>
- Installation: <https://docs.umami.is/docs/install>
- Environment variables: <https://docs.umami.is/docs/environment-variables>

## 13. Definition of code-complete

The slice is code-complete when migrations, contracts, repository, configuration, server-only Umami gateway, storefront collection, authenticated HTTP routes, dashboard analytics slice, `/analytics` console, navigation, security scans, PostgreSQL 16 harnesses, workspace regressions, accessibility checks, and local screenshots all pass; `apps/admin/**` remains unchanged; staging/production deployments are zero; and remote branch parity is proven.

The full live phase is complete only after separately authorized isolated staging provisioning and browser/network/database acceptance. Production remains disabled until a later explicit production-readiness decision.

## 14. Following shipping integration cycle

After analytics code-complete, a separate approved design will adapt the pinned Hemenaku shipping presentation into the shared authority model. The donor proves real outbound dispatch only for Basit Kargo; Shipink and Geliver are definition/UI-only. The shipping cycle therefore activates Basit Kargo first with encrypted server-only credentials, provider health verification, idempotent dispatch, tracking reconciliation, order-event audit, sandbox tests, and a truthful settings UI. Shipink and Geliver remain unavailable until their own official protocol adapters and sandbox evidence pass.
