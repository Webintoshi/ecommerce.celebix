# Pilot Plan Assignment Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable `pilot v1` entitlements and an atomic bootstrap-only store plan assignment so the 1,628-product Güzide staging migration can proceed without weakening `free_starter v1`.

**Architecture:** A versioned SQL migration seeds and verifies the exact pilot snapshot, then exposes one SECURITY DEFINER plan-assignment function. The target subscription UUID is the idempotency identity; the function locks durable store/subscription authority and changes the active subscription in one transaction.

**Tech Stack:** PostgreSQL 16, Node.js test runner, existing SaaS SQL manifest/checksum conventions, native/container disposable PostgreSQL harness.

## Global Constraints

- `free_starter v1` and self-service registration remain byte-for-byte behaviorally unchanged.
- No application-role, browser, session, cookie, header, slug, or client-body plan authority.
- No production access, deploy, DNS, credential, merge, or customer-domain mutation.
- No Güzide identity, slug, or credential in committed source.
- Staging assignment must call the bootstrap-only function; no direct subscription table mutation.

---

### Task 1: Red PostgreSQL authority harness

**Files:**
- Create: `tests/saas-phase3/pilot-plan-authority/postgres-harness.mjs`

**Interfaces:**
- Consumes: foundation plan/subscription tables and frozen-plan triggers.
- Produces: a 12-scenario executable contract for `saas.assign_store_plan(...)`.

- [ ] **Step 1: Create a disposable PostgreSQL 16 harness**

The harness must apply the existing foundation chain, apply `202607290064_pilot_plan_authority.up.sql`, seed two stores with active `free_starter v1` subscriptions, and expose:

```js
function assign({
  store = STORE_A,
  expectedSubscription = FREE_SUB_A,
  expectedCode = "free_starter",
  expectedVersion = 1,
  targetSubscription = PILOT_SUB_A,
  targetCode = "pilot",
  targetVersion = 1,
  now = NOW,
} = {}) {
  return appSql(`SELECT outcome,result_payload FROM saas.assign_store_plan(
    '${store}','${expectedSubscription}','${expectedCode}',${expectedVersion},
    '${targetSubscription}','${targetCode}',${targetVersion},'${now}'
  )`);
}
```

Scenarios: exact seed, immutable trigger preservation, app-role denial, invalid input, wrong store/current subscription, missing/inactive target plan, successful atomic assignment, exact replay, target-ID mismatch, cross-tenant denial, concurrent one-winner/replay, rollback/reapply/cleanup.

- [ ] **Step 2: Run the harness and capture RED**

Run: `node tests/saas-phase3/pilot-plan-authority/postgres-harness.mjs`

Expected: FAIL because `202607290064_pilot_plan_authority.up.sql` or `saas.assign_store_plan` does not exist.

### Task 2: Minimal immutable plan and assignment SQL

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607290064_pilot_plan_authority.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607290064_pilot_plan_authority.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607290064_pilot_plan_authority_assertions.sql`

**Interfaces:**
- Produces: `saas.assign_store_plan(uuid,uuid,text,bigint,uuid,text,bigint,timestamptz)`.

- [ ] **Step 1: Seed and verify exact `pilot v1`**

Use advisory lock `phase3:pilot:v1`, deterministic plan ID `00000000-0000-4000-8000-000000000002`, all 13 existing feature keys enabled in existing ordinal order, and limits `2000/5/10000000000/10000/1`. If any existing row differs, raise `PILOT_PLAN_SEED_DRIFT`.

- [ ] **Step 2: Implement the atomic function**

Validate canonical plan codes and positive versions, lock the store and current active subscription, verify the exact expected current subscription, verify target plan validity, set the previous subscription inactive, and insert the target active subscription in one transaction. Exact target-subscription replay returns `operation_replayed`; target-ID reuse with different values returns `operation_mismatch`.

- [ ] **Step 3: Seal privileges**

```sql
ALTER FUNCTION saas.assign_store_plan(uuid,uuid,text,bigint,uuid,text,bigint,timestamptz)
  OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.assign_store_plan(uuid,uuid,text,bigint,uuid,text,bigint,timestamptz)
  FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
       celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.assign_store_plan(uuid,uuid,text,bigint,uuid,text,bigint,timestamptz)
  TO celebix_saas_bootstrap;
```

- [ ] **Step 4: Run PostgreSQL GREEN**

Run: `node tests/saas-phase3/pilot-plan-authority/postgres-harness.mjs`

Expected: `12/12 PASS`, PostgreSQL 16, cleanup PASS.

### Task 3: Static assertions and checksum manifest

**Files:**
- Create: `tests/saas-phase3/pilot-plan-authority/static-security.test.mjs`
- Create: `apps/owner/scripts/sql/saas/phase3w-pilot-plan-authority-manifest.json`

**Interfaces:**
- Consumes: exact SHA-256 checksums of the three SQL artifacts.
- Produces: drift-detecting phase manifest and static security proof.

- [ ] **Step 1: Write RED static tests**

Assert exact plan values, no `free_starter` UPDATE, SECURITY DEFINER fixed search path, bootstrap-only grant, no app grant, row locks, same-transaction old-inactive/new-active mutation, and exact manifest checksums.

Run: `node --test tests/saas-phase3/pilot-plan-authority/static-security.test.mjs`

Expected: FAIL before the manifest exists.

- [ ] **Step 2: Generate real checksums and write the manifest**

Use `shasum -a 256` on the SQL artifacts; do not fabricate checksum strings. Manifest phase is `phase3w-pilot-plan-authority`, PostgreSQL major is `16`, external connections and production mutations are `0`.

- [ ] **Step 3: Run static and regression GREEN**

Run:

```bash
node --test tests/saas-phase3/pilot-plan-authority/static-security.test.mjs
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
git diff --check
```

Expected: all PASS and no secret-pattern hits in the tracked diff.

### Task 4: Commit, staging assignment, and real migration

**Files:**
- Modify only by generated checksums: `apps/owner/scripts/sql/saas/phase3w-pilot-plan-authority-manifest.json`
- No customer identity in source files.

**Interfaces:**
- Consumes: bootstrap-only SQL function and exact Güzide staging subscription discovered read-only at runtime.
- Produces: Güzide staging `pilot v1` active subscription and completed WooCommerce migration.

- [ ] **Step 1: Commit and push**

Commit design/plan separately, then SQL/tests/manifest as independently reviewable commits. Push `codex/guzide-staging-integration` without force.

- [ ] **Step 2: Apply the migration only to staging PostgreSQL**

Run the up migration and assertions with the existing staging migrator/owner workflow. Verify exact `pilot v1`, function ACL, and unchanged `free_starter v1` read-only.

- [ ] **Step 3: Assign only the Güzide staging store**

Read the store ID and exact active subscription ID by slug through a read-only owner query. Generate a fresh target subscription UUID locally. Invoke `saas.assign_store_plan` as `celebix_saas_bootstrap`; verify `assigned`, then replay the exact call once and verify `operation_replayed`. Confirm every other active subscription remains unchanged.

- [ ] **Step 4: Resume the browser import**

Use the already-selected official WooCommerce CSV. Verify preview `1,628 products / 1,628 variants / 5,423 media`, begin the import, monitor 25-product batches and two media workers, and continue/recover only through the same idempotent migration UI.

- [ ] **Step 5: Verify durable results**

Verify 1,628 non-archived products, 1,195 active, 433 draft, 1,628 variants, expected category/brand counts, 5,423 media terminal outcomes, sample gram/weight fields, tenant-prefixed R2 object keys, zero foreign-store rows, no raw-secret/log leak, and no production/domain/DNS change.

