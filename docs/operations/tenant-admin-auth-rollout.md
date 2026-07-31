# Tenant Admin Authentication Rollout

## Scope

This runbook covers the shared customer-panel and Owner authentication services for canonical tenant admin hosts. Logto remains the identity provider and the self-hosted PostgreSQL 16 database remains authoritative for tenant membership, panel sessions, cross-host handoffs, store switching, and principal-global logout.

Canonical hosts:

- Production: `https://<store-slug>.admin.celebix.site`
- Staging: `https://<store-slug>.admin.saas-staging.celebix.site`
- Shared staging callback/login authority: `https://panel.saas-staging.celebix.site`

## Wildcard TLS and instant Starter readiness

Cloudflare is used only for DNS and Traefik ACME DNS-01 validation. Tenant authority remains the exact active PostgreSQL storefront/admin domain record. Customer registration must never call Cloudflare, Coolify, Traefik, or ACME: wildcard DNS, certificates, and shared routers are platform prerequisites.

Required certificate scopes:

| Environment | Admin | Storefront |
| --- | --- | --- |
| Staging | `*.admin.saas-staging.celebix.site` | `*.saas-staging.celebix.site` |
| Production | `*.admin.celebix.site` | `*.celebix.site` |

Exact platform routers for `auth`, `panel`, `ecommerce`, `api`, `media`, and other reserved services must have higher priority than the storefront wildcard router. Existing exact-domain routers and certificates remain installed during the wildcard canary.

Run the read-only staging preflight before and after every router/certificate change:

```bash
npm run verify:tenant-wildcard -- \
  --environment staging \
  --known-admin guzide-kuyumcu-4.admin.saas-staging.celebix.site \
  --known-storefront guzide-kuyumcu-4.saas-staging.celebix.site
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

## Deployment order

1. Apply migration `069`, then its assertion file.
2. Apply migration `071`, then its assertion file.
3. Apply migration `072`, then its assertion file.
4. Apply the idempotent Güzide seed `073`, then its assertion file.
5. Grant the bounded customer-panel runtime memberships above.
6. Deploy the customer-panel and Owner services from the same exact commit.
7. Configure the shared panel domain and each verified canonical tenant admin domain in Coolify.
8. Verify the unauthenticated tenant login, shared login redirect, Logto authorization prompt, callback rejection without state, and health route.
9. Remove every temporary migration credential from production and preview environment variables before the final clean redeploy.

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
