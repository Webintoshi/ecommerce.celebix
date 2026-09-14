# Store Domain Replacement Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-isolated, idempotent pending replacement bundle flow that prepares a new storefront/admin pair without deleting the active pair or globally increasing plan quota.

**Architecture:** A new additive migration owns the replacement state machine and all cross-row invariants. The existing storefront and admin provisioning tables and reconciliation workers continue to own provider readiness. The customer-panel domain service provisions both hostnames through the existing provider adapters, while dedicated replacement endpoints activate, cancel, or roll back only through versioned database functions. The UI exposes the replacement path only when an existing custom primary can be selected. `www` remains a DNS redirect/alias outside `store_domains`, so one replacement bundle consumes two provider hostnames (storefront and derived admin) but only one custom-domain plan unit plus the single temporary replacement exception.

**Tech Stack:** PostgreSQL 16 PL/pgSQL, TypeScript, Node test runner, Next.js 16, React 19, existing Cloudflare for SaaS adapters.

**Spec:** `/Users/Celebix/.codex/attachments/0492cfbc-1949-47de-a20e-46d5cf087754/pasted-text.txt`

## Global Constraints

- Do not modify existing migrations, global plan limits, billing, auth, payment, deployment, Auto Deploy, production data, DNS, nameservers, or live Cloudflare state.
- Do not hard-code the Güzide tenant, store ID, or domain names in application code.
- Keep at most one non-closed replacement per store. Activated and rolled-back replacements remain non-closed until a later explicitly designed cleanup flow; therefore the exception cannot accumulate domains.
- Keep the outgoing storefront/admin pair active and primary/canonical until both incoming rows are fully ready.
- Preserve outgoing rows after activation and rollback. Cancellation disables only the incoming rows and lets existing reconciliation remove only their provider hostnames.
- External provider/DNS work is not atomic with database state. Durable prepared rows and the existing worker reconciliation are the retry boundary.

---

## Task 1: Add Replacement Contracts and Persistence Boundary

- [x] Add `StoreDomainReplacementView`, status values, and mutation result types to `packages/saas-contracts/src/types.ts`; export them from `packages/saas-contracts/src/index.ts`.
- [x] Extend `StoreDomainPersistence` and `StoreDomainService` in `packages/saas-domain-core/src/types.ts` and `packages/saas-domain-core/src/service.ts` with `listReplacements`, `createReplacement`, `activateReplacement`, `cancelReplacement`, and `rollbackReplacement`.
- [x] Extend `StoreDomainRepository` and `PostgresStoreDomainRepository` in `packages/saas-data/src/store-domains/types.ts` and `packages/saas-data/src/store-domains/repository.ts` with exact calls to the new SQL functions.
- [x] First add failing tests in `packages/saas-domain-core/src/service.test.ts` and `packages/saas-data/src/store-domains/repository.test.ts` for operation replay, partial admin-provider recovery, versioned state changes, exact tenant authority values, and malformed payload rejection.
- [x] Run `node --experimental-strip-types --test packages/saas-domain-core/src/service.test.ts packages/saas-data/src/store-domains/repository.test.ts` and record the expected RED result before implementation, then rerun to GREEN.

## Task 2: Add the Additive PostgreSQL Replacement State Machine

- [x] Create `apps/owner/scripts/sql/saas/202609140127_store_domain_replacement_bundles.up.sql` with `saas.store_domain_replacements`, immutable operation identity/fingerprint, tenant-bound foreign keys, a partial unique index that permits only one status in `preparing|activated|rolled_back` per store, projection/list, prepare, activate, cancel, and rollback functions.
- [x] In prepare: lock the store, validate merchant authority, lock and verify the outgoing active custom primary plus its system-managed admin companion, reject hostname collisions, reject another non-closed replacement, require current custom count not to exceed `effective_limit`, then insert exactly one incoming storefront/admin bundle plus the replacement record. Replay by the same operation/fingerprint returns the same durable IDs; operation reuse with another fingerprint fails.
- [x] In activate: require the incoming storefront and admin to be active with hostname/SSL/DNS/origin ready and no provider error/removal request; atomically switch storefront `is_primary` and admin `canonical`, set replacement `activated`, and retain outgoing rows.
- [x] In cancel: allow only `preparing`, disable and request removal only for incoming rows, retain outgoing primary/canonical rows, and set replacement `cancelled`.
- [x] In rollback: allow only `activated`, require the outgoing pair still ready, atomically restore outgoing primary/canonical, retain incoming rows as a fallback, and set replacement `rolled_back`.
- [x] Replace the existing bundle-primary function in this new migration so a `preparing` replacement target cannot bypass the paired activation guard.
- [x] Create matching `.down.sql`, `_assertions.sql`, `store-domain-replacement-bundles-migration.test.ts`, and `phase5k-store-domain-replacement-bundles-manifest.json` artifacts. Down must remove only replacement functions/table/guard and restore the prior bundle-primary definition without deleting domain rows.
- [x] Add `tests/saas-phase3/store-domain-replacement-bundles/postgres-harness.mjs` covering prepare/replay, two concurrent attempts, cross-tenant source rejection, not-ready activation, ready activation, cancellation, rollback, fallback preservation, and clean migration rollback/reapply on disposable PostgreSQL 16.
- [x] Run the static migration test and disposable PostgreSQL harness to GREEN.

## Task 3: Wire Customer Panel API and Runtime

- [x] Extend `apps/customer-panel/lib/server-store-domains/runtime.ts` and `default.ts` preflight with the new service methods and SQL signatures. Do not change Owner runtime code.
- [x] Add exact authenticated handlers in `apps/customer-panel/lib/store-domain-http/handler.ts` for collection create/list plus versioned activate/cancel/rollback actions; preserve origin, cookie, permission, body-size, idempotency, and tenant-derived authority checks.
- [x] Add Next route adapters under `apps/customer-panel/app/api/store-domain-replacements/` and default handler exports in `apps/customer-panel/lib/store-domain-http/default.ts`.
- [x] First add failing handler/runtime tests for tenant isolation, exact request shapes, idempotency keys, permissions, state actions, and finite error mapping; then implement and rerun to GREEN.

## Task 4: Add Minimum Safe Management UI

- [x] Extend `apps/customer-panel/lib/store-domain-ui/client.ts` with strict response parsing and methods for replacement list/create/activate/cancel/rollback.
- [x] Update `apps/customer-panel/components/settings/domains/StoreDomainSettings.tsx` and its CSS so a store owner with an existing custom primary can explicitly choose “güvenli alan adı geçişi”; show outgoing/incoming bundle state, keep ordinary create separate, hide ordinary primary/remove actions that would violate an active replacement, and expose activate only when the server projection reports ready.
- [x] State in the UI that `www` is configured as a redirect/alias after validation and is not a separate bundle.
- [x] First add failing client/presentation tests for strict payload parsing and Turkish state labels, then implement and rerun the focused panel tests to GREEN.

## Task 5: Verify, Review, and Prepare the Separate PR

- [x] Run focused contract, data, domain-core, customer-panel domain, static migration, and disposable PostgreSQL tests.
- [x] Run workspace typecheck and the Customer Panel production build; do not run payment generators or deploy commands.
- [x] Run diff checks confirming no Güzide hard-code, no existing migration edits, no plan-limit mutation, no Owner runtime change, and no payment/deployment/DNS changes.
- [x] Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`, address findings, and rerun affected verification.
- [x] Commit on `codex/atlas-guzide-domain-replacement`, push normally, and open a separate draft PR against `codex/design-tabs-save-fix-live`.
- [x] Report the exact PR/head, migration, tests, review, and the single controlled release plan: apply migration 127, deploy only Customer Panel at the exact reviewed SHA, verify preflight/health, then use the existing panel flow and reconciliation workers. Owner code deployment is not required because the worker consumes unchanged domain/admin provisioning schemas and statuses.
