# Owner New-Store Standard Package 1

## Current Flow Audit

| Step | Current behavior | Supabase dependency? | New standard gap | Fix needed |
| --- | --- | --- | --- | --- |
| New store form | `CreateStoreForm` defaults `databaseMode` to `light_postgres`; `full_supabase` is only under Advanced Legacy. | No for default path. | Standard provider copy needed to be explicit. | Done: UI now states Postgres + Logto + Umami + R2 and Supabase not used. |
| Create action/API | `POST /api/stores` calls `resolveDefaultDatabaseMode`; missing value becomes `light_postgres`. | No for default path. | Request payload did not expose all standard metadata fields directly. | Done in platform config defaults. |
| Provisioning orchestrator | `runStoreProvisioningWorkflow` branches by `store.databaseMode`. | Only when explicit `full_supabase`. | Logto/Umami live hooks were implied by placeholder steps. | Done: typed hook registry added for later packages. |
| Store registry/config generation | `createStore` writes config, registry and env template. | No for `light_postgres`; legacy fields remain for compatibility. | Top-level provider/status/readiness fields were not explicit. | Done: standardized fields added and normalized. |
| Admin scaffold/deploy authority | Admin blueprint/deploy uses Coolify with build-server/GHCR defaults. | No for default generated runtime. | Readiness field for admin was not explicit in store config. | Done: readiness model added. |
| Storefront scaffold/deploy authority | Storefront scaffold, repo sync and Coolify deploy use generated app authority. | No for `light_postgres`; Supabase env is not required in that mode. | Smoke acceptance was not modeled. | Done: smoke checklist model added. |
| DB provisioning | `supabase_provision` step name is compatibility naming; `light_postgres` calls `provisionLightPostgresForStore`. | No for default path. | Step label is compatibility-named. | Keep for metadata compatibility; hook model documents `provisionLightPostgres`. |
| R2 provisioning | `provisionR2ForStore` and owner R2 authority update are present. | No. | Config had `provisioning`, but not requested `status`. | Done: `r2.status` and storage readiness added. |
| Auth provisioning | `auth_setup` records Logto-ready placeholder for light Postgres. | No. | No live Logto app automation yet. | Package 3. |
| Analytics provisioning | `analytics_setup` records Umami-ready placeholder for light Postgres. | No. | No live Umami website automation yet. | Package 4. |
| Coolify app creation | Admin/storefront Coolify app provisioning exists in generated deploy steps. | No Supabase unless explicit legacy flow is chosen. | Smoke gate is not a runner yet. | Package 7. |
| Deploy branch generation | `getStoreDeploymentBranches` writes owner/admin and storefront branches. | No. | None for Package 1. | Monitor in Package 6. |
| Build server/GHCR config | Generated deployment defaults use `build_server_ghcr`, GHCR images and `celebix-build-01`. | No. | None for Package 1. | Acceptance checks in later packages. |

Answer: owner new-store flow does not create Supabase resources unless `databaseMode=full_supabase` is explicitly selected in Advanced Legacy.

## Standard Fields

New default store config authority now carries:

- `databaseMode = light_postgres`
- `authProvider = logto`
- `customerAuthProvider = logto`
- `analyticsProvider = umami`
- `storageProvider = r2`
- `supabaseStatus = none`
- `logto.adminAppStatus = pending`
- `logto.customerAppStatus = pending`
- `umami.websiteStatus = pending`
- `umami.websiteId = null`
- `r2.status = pending`
- `readiness.database/storage/auth/analytics/admin/storefront/smoke = pending`

Legacy `full_supabase` remains explicit and advanced-only.

## Lifecycle Model

Owner provisioning states now recognize:

- `provisioning`
- `database_ready`
- `storage_ready`
- `auth_ready`
- `analytics_ready`
- `admin_ready`
- `storefront_ready`
- `smoke_ready`
- `ready`
- `pending_auth`
- `pending_analytics`
- `pending_payment`
- `pending_dns`
- `pending_smoke`
- `pending_repair`
- `failed`

Supabase absence in `light_postgres` mode is not a failure signal.

## Hook Model

`apps/owner/lib/new-store-standard-provisioning.ts` defines typed hook names for the later live-resource packages:

- `provisionLightPostgres`
- `provisionR2`
- `provisionLogtoAdminApp`
- `provisionLogtoCustomerApp`
- `provisionUmamiWebsite`
- `configureStorefrontTracking`
- `configureAdminAnalytics`
- `runNewStoreSmoke`

Package 1 does not call live Logto, Umami, Coolify or store creation flows.

## Smoke Checklist Model

The smoke model covers storefront, admin, auth, analytics and checkout checks. It is a typed checklist only; Package 7 will implement the runner and Package 8 will run disposable store acceptance.

## Implementation Packages Plan

| Package | Target | File areas | Risk | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Package 2 | Harden light_postgres provisioning schema, seeds and readiness checks. | `apps/owner/lib/light-postgres-provisioning.ts`, platform config readiness. | Schema drift between admin/storefront adapters. | Required tables/settings/payment defaults exist and readiness.database becomes ready. |
| Package 3 | Automate Logto admin/customer app provisioning. | Owner Logto bootstrap library, store config authority, runtime env generation. | Redirect URI mistakes or connector assumptions. | Admin/customer app IDs persist; no localhost/0.0.0.0/:3000 callbacks; auth readiness updates. |
| Package 4 | Automate Umami website creation and tracking config. | Owner Umami adapter, admin analytics endpoints/widgets, storefront tracking runtime. | Token exposure or wrong website scope. | websiteId persists; token stays server-side; tracking and admin analytics are scoped. |
| Package 5 | Finalize R2/media standard. | `apps/owner/lib/r2-bootstrap.ts`, generated env builders, media health. | Bucket naming/public URL mismatch. | R2 upload/read path works and no Supabase storage appears in new standard. |
| Package 6 | Integrate admin/storefront scaffold authority. | `apps/owner/lib/admin-deployment*`, `storefront-scaffold`, repo sync. | Generated app branch/image authority drift. | Admin/storefront branches and GHCR/build-server payloads are correct. |
| Package 7 | Implement new-store smoke runner. | Smoke runner library, provisioning lifecycle, owner UI status. | Flaky DNS/runtime timing. | Smoke checklist writes pending_smoke/smoke_ready and prevents ready until pass. |
| Package 8 | Run disposable test store create acceptance. | Owner API/UI, disposable store cleanup, docs. | Live resources and cleanup scope. | Disposable store passes end-to-end and cleanup plan is verified. |
