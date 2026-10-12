# Tenant Admin Authentication Rollout

## Scope

This runbook covers the shared customer-panel and Owner authentication services for canonical tenant admin hosts. Logto remains the identity provider and the self-hosted PostgreSQL 16 database remains authoritative for tenant membership, panel sessions, cross-host handoffs, store switching, and principal-global logout.

Canonical hosts:

- Production: `https://<store-slug>.admin.celebix.site`
- SITE staging: `https://<store-slug>.admin.saas-staging.celebix.site`
- NET staging: `https://<store-slug>.admin.saas-staging.celebix.net`
- SITE staging callback/login authority: `https://panel.saas-staging.celebix.site`
- NET staging callback/login authority: `https://panel.saas-staging.celebix.net`
- Shared SITE/NET staging Logto identity provider: `https://auth.saas-staging.celebix.site`

## Wildcard TLS and instant Starter readiness

Cloudflare is used only for DNS and Traefik ACME DNS-01 validation. Tenant authority remains the exact active PostgreSQL storefront/admin domain record. Customer registration must never call Cloudflare, Coolify, Traefik, or ACME: wildcard DNS, certificates, and shared routers are platform prerequisites.

Required certificate scopes:

| Environment | Admin | Storefront |
| --- | --- | --- |
| SITE staging (`staging`) | `*.admin.saas-staging.celebix.site` | `*.saas-staging.celebix.site` |
| NET staging (`staging_net`) | `*.admin.saas-staging.celebix.net` | `*.saas-staging.celebix.net` |
| Production | `*.admin.celebix.site` | `*.celebix.site` |

Exact platform routers for `auth`, `panel`, `ecommerce`, `api`, `media`, and other reserved services must have higher priority than the storefront wildcard router. Existing exact-domain routers and certificates remain installed during the wildcard canary.

Run the read-only preflight for the affected environment before and after every router/certificate change. SITE staging:

```bash
npm run verify:tenant-wildcard -- \
  --environment staging \
  --known-admin guzide-kuyumcu-4.admin.saas-staging.celebix.site \
  --known-storefront guzide-kuyumcu-4.saas-staging.celebix.site
```

NET staging uses NET tenant hosts and the NET panel while checking the shared SITE Logto host:

```bash
npm run verify:tenant-wildcard -- \
  --environment staging_net \
  --known-admin alpler-spor.admin.saas-staging.celebix.net \
  --known-storefront alpler-spor.saas-staging.celebix.net
```

The verifier requires both wildcard SANs, rejects certificates below the critical 14-day threshold, warns below 30 days, checks that central platform hosts remain healthy, compares route body fingerprints, and requires random unknown tenant hosts to fail closed with 404 or 503. Any TLS verification failure, Traefik default certificate, route collision, accepted unknown tenant, or unhealthy platform host aborts rollout.

Before a proxy reload/restart, capture without secrets:

- current proxy container/image identifier and health;
- current static/dynamic configuration digests;
- current certificate-store backup path and digest;
- existing exact router names, priorities, services, and certificate resolvers;
- current application deployment ids/image digests;
- the pre-change verifier output and timestamp.

Rollback restores the captured proxy configuration and certificate store, reloads the last known-good proxy, then re-runs the same verifier and every pre-existing exact-host health check. Never delete exact-domain configuration merely because a wildcard router exists.

## Required PostgreSQL runtime roles

The customer-panel database login is a `LOGIN NOINHERIT` workload role. It must not be a superuser, own tenant tables, bypass RLS, create roles/databases, or receive direct tenant-table privileges. It must be a member of exactly the bounded roles needed by the shared panel runtime:

```sql
GRANT celebix_saas_identity,
      celebix_saas_app,
      celebix_saas_host_resolver
TO "<panel-runtime-login>";
```

Before deploying, verify the workload role and memberships with an administrative connection:

```sql
SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname = '<panel-runtime-login>';

SELECT
  pg_catalog.pg_has_role('<panel-runtime-login>', 'celebix_saas_identity', 'MEMBER') AS identity_member,
  pg_catalog.pg_has_role('<panel-runtime-login>', 'celebix_saas_app', 'MEMBER') AS app_member,
  pg_catalog.pg_has_role('<panel-runtime-login>', 'celebix_saas_host_resolver', 'MEMBER') AS host_resolver_member;
```

Expected: `rolcanlogin=true`, `rolinherit=false`, every dangerous attribute is `false`, and all three bounded memberships are `true`. A missing `host_resolver` membership intentionally makes the panel fail closed and renders only the generic login fallback.

## Shared Logto logout callback prerequisite

Before enabling a shared panel instance, read its existing
`CELEBIX_LOGTO_CLIENT_ID` and the corresponding Logto application registration.
The current NET and SITE instances use one shared `Traditional` application;
its `oidcClientMetadata.postLogoutRedirectUris` must include both exact values:

```text
https://panel.saas-staging.celebix.net/auth/logout/callback
https://panel.saas-staging.celebix.site/auth/logout/callback
```

These are shared callbacks, independent of the store's platform or custom admin
hostname. Newly registered stores and verified custom admin domains use the
same callbacks. Do not register tenant-specific logout addresses or wildcard
addresses. A separate environment/application must register its own approved
central panel callback before that instance is enabled.

Configure through the authenticated Logto Console or official Management API:

1. Read `GET /api/applications/<existing-client-id>`. Keep the full response and
   the previous `oidcClientMetadata` in a private, access-controlled rollback
   snapshot. Do not print or commit the application response, authorization
   token, or client secrets.
2. Compare the existing `postLogoutRedirectUris` with the two exact callbacks
   above. The current installed deployment stores these entries as strings.
   Preserve all existing entries, including the existing SITE root and SITE
   logout callback; append only the missing NET callback.
3. Send `PATCH /api/applications/<existing-client-id>` with the existing
   `oidcClientMetadata` object and its additively updated
   `postLogoutRedirectUris`. For this correction, the request body has this
   shape; `currentMetadata` means the object read in step 1:

   ```javascript
   const netCallback = "https://panel.saas-staging.celebix.net/auth/logout/callback";
   const currentUris = currentMetadata.postLogoutRedirectUris;
   const body = {
     oidcClientMetadata: {
       ...currentMetadata,
       postLogoutRedirectUris: currentUris.includes(netCallback)
         ? currentUris
         : [...currentUris, netCallback],
     },
   };
   ```

4. Read the same application again. Verify the required exact callbacks are
   present and every other application/metadata value matches the private
   snapshot. Do not replace the application from defaults, modify login
   callbacks, permissions, grants, secrets, token lifetimes, or sign-in policy,
   or create another OAuth application.
5. Run the public provider smoke and authenticated acceptance below. Keep only
   status/boolean checks and public hostname/path in the receipt; omit cookies,
   signed state, authorization parameters, and credentials. If rollback is
   required, restore only the captured `oidcClientMetadata` through the same
   official API and verify the remaining application values are unchanged.

### Recognizing and verifying the callback failure

The 2026-10-12 failure was reproduced without a panel credential: an empty
`application/x-www-form-urlencoded` POST to a known tenant's
`/api/session/logout`, with that tenant's exact HTTPS `Origin`, returned the
expected `303` to the shared Logto end-session endpoint. The provider then
returned HTTP `400`, `oidc.invalid_request`, with
`error_description: post_logout_redirect_uri not registered`.

The shared application already allowed the SITE callbacks and both login
callbacks, but omitted the NET logout callback. This is a provider-registration
failure after the panel handler, rather than a failed origin check or native
session revocation. Preserve those protections; do not add an ID token,
relax CSRF validation, remove signed return-state verification, or redirect
around a failed provider logout to disguise this configuration failure.

Required acceptance after the correction:

| Check | Required result |
| --- | --- |
| Credential-free tenant logout POST with exact Origin and empty form | `303` to the configured shared Logto end-session endpoint |
| Follow that redirect without a Cookie header or cookie jar | Provider accepts the registered callback; no `400` / `post_logout_redirect_uri not registered` response. Its normal confirmation page or logout redirect may follow. |
| Real authenticated custom-domain logout | Native principal-global session revocation completes before cookie deletion, Logto ends its session, the fixed shared callback validates signed state and the exact active admin host, and the browser returns to that verified host's `/login` |
| Example NET custom domain | `admin.alplerspor.com` → shared NET `/auth/logout/callback` → `https://admin.alplerspor.com/login` |
| Existing platform tenant in NET and SITE | Same protocol, using that environment's shared callback and the verified tenant host's `/login` |
| Protected page after authenticated logout | Access is denied or redirected to login; the revoked session cannot reopen the panel |
| Cross-site request, tampered/expired state, unknown host, or native revocation failure | Existing rejection remains; no successful logout or unverified redirect is reported |

The credential-free provider smoke proves callback registration only. It does
not prove authenticated session revocation; retain the real browser check as a
separate acceptance gate. Future tenant creation requires no per-tenant Logto
registration or extra callback permission.

## Deployment order

1. Apply migration `069`, then its assertion file.
2. Apply migration `071`, then its assertion file.
3. Apply migration `072`, then its assertion file.
4. Apply the idempotent Güzide seed `073`, then its assertion file.
5. Grant the bounded customer-panel runtime memberships above.
6. Verify the existing shared Logto application's exact logout callbacks and metadata preservation as described above.
7. Deploy the customer-panel and Owner services from the same exact commit.
8. Configure the shared panel domain and each verified canonical tenant admin domain in Coolify.
9. Verify the unauthenticated tenant login, shared login redirect, Logto authorization prompt, callback rejection without state, health route, and the public/authenticated logout acceptance above.
10. Remove every temporary migration credential from production and preview environment variables before the final clean redeploy.

Do not deploy only the customer-panel half of the protocol. The destination-bound returning-login request uses Owner internal gateway schema version 3; an older Owner service safely rejects it with HTTP 503.

## Güzide staging evidence (2026-07-30)

- Git branch: `codex/guzide-staging-integration`
- Exact shared commit: `d4d3a57e8bef37b8c2dc12e715edfc79d094a1fe`
- Customer-panel Coolify application: `yk1h6d97z7ex0h74ok3zrj5c`
- Owner Coolify application: `bpsgdwfiswna06mooguu2mr3`
- Tenant-admin migration execution: success at `2026-07-30 13:59:20 UTC`
- Customer-panel host-resolver membership execution: success at `2026-07-30 14:13:16 UTC`
- Final customer-panel deployment: `m5f6guvqv2cybwyeouni4p8l`, finished
- Final Owner deployment: `rtuin278edgdn3an8w2l3egr`, finished
- Canonical pilot host: `https://guzide-kuyumcu-4.admin.saas-staging.celebix.site`

Observed HTTP contracts after the clean deployments:

| Request | Expected/observed result |
| --- | --- |
| `GET /login` on the Güzide admin host | `200`, Güzide Kuyumcu branded login |
| `GET /` on the Güzide admin host without a session | `307` to the same host `/login` |
| `GET /api/health` on the Güzide admin host | `200` |
| `GET /auth/login?destination=<Güzide-host>` on the shared panel | `303` to Logto OIDC authorization with `prompt=login` |
| `GET /auth/callback` without the required state/code | controlled `400` |

The final Coolify customer-panel environment contains no migration database URL. Both applications run from the exact commit above.

## Rollback

Application rollback is performed in Coolify by selecting the last known-good exact deployment for both the customer-panel and Owner services together. Do not roll back only one half of the internal auth protocol.

Database rollback, when explicitly approved and only after confirming there are no issued tenant-admin sessions or handoffs that must be preserved, runs in reverse order:

1. `202607300073_seed_guzide_pilot_admin_domain.down.sql`
2. `202607300072_panel_store_options.down.sql`
3. `202607300071_returning_login_admin_host.down.sql`
4. `202607300069_tenant_admin_domains_and_principal_logout.down.sql`

To fail closed immediately without dropping schema, revoke only the new hostname-resolution membership from the affected panel workload login and redeploy the panel:

```sql
REVOKE celebix_saas_host_resolver FROM "<panel-runtime-login>";
```

This disables tenant-branded resolution; it is not a normal operating state.
