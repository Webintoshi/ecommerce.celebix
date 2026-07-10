# Shared SaaS Implementation Boundaries

## Frozen Decision

Atlas approved Option B for the shared SaaS rollout:

- New self-serve stores use a separate shared SaaS PostgreSQL database.
- `ecommerce.celebix.co` remains the Celebix super-admin control plane.
- `apps/customer-panel` will be the shared customer-admin runtime.
- `apps/storefront-shared` will be the shared storefront runtime.
- Existing dedicated stores and customer deployments remain unchanged.
- `apps/admin` and `apps/storefront-base` are read-only donors.
- The current dedicated generator and provisioner remain available only as a future enterprise exception.

The contracts in `packages/saas-contracts` are frozen after Atlas approval. Breaking changes require a schema-version increment and explicit integration review. Agents import these types and must not copy or redefine them.

## Integration Lead

The Integration Lead owns:

- `packages/saas-contracts/**`
- `docs/architecture/saas-implementation-boundaries.md`
- root `package.json`
- root `package-lock.json`
- workspace wiring
- the integration branch and end-to-end conflict resolution

Only the Integration Lead may resolve cross-agent integration conflicts.

## Agent A - Tenant Core

Branch: `codex/saas-tenant-core`

Owned paths:

- `packages/saas-tenant-core/**`
- `packages/saas-data/**`
- `apps/owner/scripts/sql/saas/**`
- `apps/owner/lib/saas-tenant-core/**`
- `apps/owner/app/api/internal/saas-tenants/**`

Inputs:

- `CreateStarterTenantInput`
- `StoreMembership`
- `PlanEntitlements`

Outputs:

- `CreateStarterTenantResult`
- a contract-compatible tenant repository and transaction API

Agent A must not edit registration, customer-panel, shared-storefront, frozen-contract, root-workspace, dedicated-app, or dedicated-provisioning paths.

## Agent B - Registration, Auth, and Panel Session

Branch: `codex/saas-registration-auth-panel`

Owned paths:

- `apps/owner/app/kayit/**`
- `apps/owner/app/api/self-serve/**`
- `apps/owner/components/self-serve/**`
- `apps/owner/lib/self-serve-*.ts`
- `apps/customer-panel/**`

Inputs:

- `CreateStarterTenantInput`
- `CreateStarterTenantResult`
- `TenantContext`
- `StoreMembership`
- the shared SaaS error contract

Outputs:

- registration orchestration
- OIDC and session adapter interfaces
- customer-panel `TenantContext` construction

Agent B must not edit Tenant Core, SaaS SQL, shared-storefront, frozen-contract, root-workspace, donor-app, or dedicated-provisioning paths.

## Agent C - Shared Storefront and Routing

Branch: `codex/saas-shared-runtime-routing`

Owned paths:

- `apps/storefront-shared/**`
- `packages/saas-storefront-runtime/**`

Inputs:

- `ResolvedStoreHost`
- `TenantContext`
- `PlanEntitlements`

Outputs:

- an exact host resolver
- storefront `TenantContext` construction
- tenant-aware storage and cache adapter interfaces

Agent C must not edit Tenant Core, registration/auth/panel, frozen-contract, root-workspace, donor-app, dedicated-storefront, or dedicated-provisioning paths.

## Globally Forbidden Paths

All implementation agents are forbidden from editing:

- `packages/saas-contracts/**`
- `docs/architecture/saas-implementation-boundaries.md`
- root `package.json`
- root `package-lock.json`
- `apps/admin/**`
- `apps/storefront-base/**`
- dedicated storefront workspaces, including `apps/storefront-deri-kordon/**` and `apps/storefront-test1/**`
- `stores/**`
- existing customer deployments
- existing dedicated provisioning, deployment, bootstrap, cleanup, and secret-authority code
- production environment or infrastructure configuration

Reading donor code is allowed. Editing it is not.

## Shared Contract Rules

- Identity authority is immutable issuer plus subject; email is contact metadata only.
- No password, private authentication material, credential, database location, or private infrastructure value crosses a contract boundary.
- `TenantContext` is server-produced and requires an authenticated principal, active membership, and allowed store.
- Caller-provided store IDs are hints and never authority.
- When membership and resolved host are both present, their store IDs match.
- Exact host resolution fails closed for unknown, ambiguous, disabled, or unverified hosts.
- Idempotency binds an opaque key to a canonical payload fingerprint. A matching replay returns the prior operation; a fingerprint mismatch returns `idempotency_mismatch`.
- Entitlements deny unknown features and limits by default.
- Agent outputs must import shared contract types and must not redefine them.

## Global Stop Conditions

An agent stops and reports a blocker before it:

- edits another agent's owned path
- edits frozen contracts or this boundary document
- edits root workspace or lock files
- accesses production database, environment, DNS, R2, Redis, Logto, Coolify, TLS, queues, or customer deployments
- uses a service-role client in an untrusted tenant request path
- weakens tenant filtering or authorization
- treats a client-provided store ID as authority
- places reusable authentication material or secrets in URLs
- changes existing dedicated runtime, deployment, or provisioning behavior
- bypasses a failing cross-tenant test
- treats an unknown capability as enabled by default

Schema, migration, authentication, infrastructure, shared-runtime deployment, and production-beta work each require a separate explicit Atlas approval gate.
