# Tenant Admin Authentication Rollout

## Scope

This runbook covers the shared customer-panel and Owner authentication services for canonical tenant admin hosts. Logto remains the identity provider and the self-hosted PostgreSQL 16 database remains authoritative for tenant membership, panel sessions, cross-host handoffs, store switching, and principal-global logout.

Canonical hosts:

- Production: `https://<store-slug>.admin.celebix.site`
- Staging: `https://<store-slug>.admin.saas-staging.celebix.site`
- Shared staging callback/login authority: `https://panel.saas-staging.celebix.site`

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
