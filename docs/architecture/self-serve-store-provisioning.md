# Celebix Self-Serve Store Provisioning Architecture

Status: Phase 0/1 proposal

This document describes the safe path from the current operator-controlled store delivery model to a self-serve SaaS onboarding model. It is not a production rollout plan and does not authorize live provisioning, DNS changes, Logto mutations, or database migration apply.

## Current Architecture

The current owner control plane is optimized for operator-led store creation. Store records are tracked in `owner_stores` and repository-backed `stores/*/store.config.json` files. The existing `/api/stores` create route remains `super_admin` guarded and starts the provisioning workflow after creating store authority.

Owner authentication still depends on owner Supabase auth and `owner_profiles`. Store admin authentication can run through Supabase or Logto, but the Logto admin bridge currently resolves back to store-local legacy users and roles. Storefront customer Logto work has already introduced the right separation pattern with `auth_principals` and `auth_store_memberships`.

Provisioning has useful preflight and lifecycle concepts for `light_postgres`, R2, GitHub/GHCR, Coolify, admin deployment, storefront deployment, and smoke readiness. The next architectural gap is durability: self-serve onboarding should not depend on `queueMicrotask` or request lifetime.

## Target Architecture

Logto is the identity provider. Celebix platform database is the authority for store ownership, admin rights, lifecycle state, billing state, and provisioning jobs.

The target self-serve flow:

1. User signs up on `accounts.celebix.co` or `panel.celebix.co` through Logto.
2. Platform creates or resolves a platform principal for the Logto subject.
3. First login starts a store onboarding session.
4. User enters store profile, region, starter setup, and slug.
5. Platform reserves `{slug}.celebix.shop`.
6. Platform creates a durable provisioning job.
7. Storefront becomes available on `{slug}.celebix.shop`.
8. Admin management starts at `panel.celebix.co/stores/{slug}`.
9. Custom domain can be attached after ownership verification.

## Identity And Authority Boundary

Logto provides identity only. Logto claims may improve UX, but they must not be treated as store authorization authority.

Celebix platform DB provides authority:

- Store ownership.
- Store admin/staff membership.
- Support and super admin access.
- Billing/trial entitlement.
- Store lifecycle and provisioning state.

This boundary prevents a forged or stale Logto claim from granting cross-tenant access.

## User Types

| User type | Identity source | DB authority | Notes |
| --- | --- | --- | --- |
| `platform_user` | Logto | Platform principal | Can start onboarding, no store access by default. |
| `store_owner` | Logto | `store_memberships` | Owns billing, domains, staff, and store settings. |
| `store_admin` | Logto | `store_memberships` | Manages store operations. |
| `store_staff` | Logto | Scoped store membership | Limited catalog, order, content, or support actions. |
| `support_admin` | Logto internal app/org | Platform support membership | Needs audited access and optional impersonation controls. |
| `super_admin` | Logto internal app/org | Platform super admin membership | Can bypass tenant boundaries only with audit logging. |
| `storefront_customer` | Logto customer app | Store customer link/membership | Must never receive admin API access. |

## Routing

Short-term admin route: `panel.celebix.co/stores/{slug}`.

This keeps cookies, callbacks, and RBAC centralized while the existing per-store admin URLs continue to work:

- `admin.hemenaku.com`
- `admin.derycraft.com.tr`
- Other existing customer admin domains.

Storefront target route: `{slug}.celebix.shop`.

The storefront tier needs a tenant resolver that maps hostname to `store_id`, enforces domain status, and isolates runtime cache keys by tenant.

## Provisioning Pipeline

Self-serve provisioning should become a durable job pipeline:

1. Create `stores` row in `reserved` or `draft` state.
2. Create `store_onboarding_sessions` row for draft data.
3. Reserve platform subdomain in `store_domains`.
4. Create `store_provisioning_jobs` row with an idempotency key.
5. Create or connect `light_postgres` database.
6. Apply idempotent schema and seed baseline data.
7. Create R2 namespace or prefix.
8. Create Logto admin/customer app configuration or bind to shared app strategy.
9. Create owner membership for the initiating principal.
10. Create Umami website and analytics runtime values.
11. Prepare storefront/admin runtime config.
12. Deploy or mark pending deployment depending environment.
13. Run health and smoke checks.
14. Mark store `ready`, `pending_dns`, `pending_auth`, `pending_analytics`, `pending_payment`, `pending_repair`, or `failed`.

## Idempotency

Every step must be retry-safe:

- Store slug reservation is unique.
- Domain hostname is unique.
- DB/schema statements use deterministic names and `IF NOT EXISTS`.
- R2 resources use deterministic bucket/prefix names.
- Memberships use unique `store_id`, `principal_id`, `subject_type`.
- Logto apps are looked up before creation.
- Jobs use `idempotency_key` and retry counters.

## Failure States

Recommended store states:

- `draft`
- `reserved`
- `provisioning`
- `pending_auth`
- `pending_analytics`
- `pending_payment`
- `pending_dns`
- `pending_repair`
- `ready`
- `suspended`
- `failed`
- `cancelled`

Provisioning failures should not delete live resources automatically. They should record a repairable state and preserve step metadata.

## Domain Strategy

Default public storefront domain: `{slug}.celebix.shop`.

Requirements:

- Wildcard DNS for `*.celebix.shop`.
- Wildcard TLS or automatic certificate issuance.
- Reserved words and forbidden names.
- Domain uniqueness in platform DB.
- Custom domain ownership verification before activation.
- No Logto callback redirect generated from unverified user input.

## Billing And Trial

Billing is a future phase. The first implementation should model the data, not charge users.

Recommended baseline:

- 14-day trial.
- Custom domain locked until paid plan.
- Payment activation locked until store owner completes required business fields.
- Product, staff, media, and advanced inventory limits by plan.
- Suspended/unpaid stores keep admin read-only and disable checkout until resolved.

## Migration Plan

Existing stores should be imported into the platform registry before self-serve goes live:

1. Map current `owner_stores` and `stores/registry.json` into `stores`.
2. Map current storefront and admin domains into `store_domains`.
3. Map known owner contacts into `store_memberships`.
4. Preserve per-store admin URLs.
5. Add central panel switcher at `panel.celebix.co/stores/{slug}`.
6. Run read-only parity checks before moving write actions.

No existing customer store should be migrated by this Phase 0/1 work.

## Phase 0/1 Safety Boundary

This phase may add docs, proposal-only SQL, slug helper code, and a feature-flagged draft UI.

This phase must not:

- Open `/api/stores` to self-serve.
- Remove `super_admin` guard from current store create.
- Apply DB migrations.
- Create Logto apps.
- Create DNS/Coolify resources.
- Deploy owner/admin/storefront apps.
- Mutate any customer store.
