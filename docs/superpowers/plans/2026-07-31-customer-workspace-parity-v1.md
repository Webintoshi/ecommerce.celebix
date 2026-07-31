# Customer Workspace Parity V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer list/detail/edit routes into a responsive merchant workspace with real tenant-scoped order history, deterministic customer navigation, editable address-book rows, and truthful lifecycle operations.

**Architecture:** Keep the existing customer authority, mutation, notes, tags, segments, export, and optimistic-version boundaries. Add one narrow PostgreSQL read function that returns only customer navigation and the latest 50 linked orders, expose it through the existing repository/runtime/HTTP/client stack, then refactor the customer detail and edit presentations without inventing provider effects.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, CSS Modules, Node test runner, PostgreSQL 16 PL/pgSQL, `@celebix/saas-contracts`, and `@celebix/saas-data`.

## Global Constraints

- Work only in `/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/guzide-staging-integration` on `codex/guzide-staging-integration`.
- The active store, principal, membership, plan, database, and credential authority remain server-side.
- Customer order history joins `saas.orders.customer_id`; matching by browser-supplied email, phone, or name is forbidden.
- Navigation is deterministic by `(created_at DESC, id DESC)` and cannot cross a store.
- The history response contains at most 50 safe order summaries and labels a partial history truthfully from the existing `orderCount`.
- Existing create, update, archive, notes, tags, segments, export, session, and storefront behavior must not regress.
- Every production behavior change starts with a focused failing test.
- The customer module stays `foundation` while consent history and privacy erasure remain absent.

---

### Task 1: Customer workspace safe contract and repository API

**Files:**
- Modify: `packages/saas-contracts/src/customers/types.ts`
- Modify: `packages/saas-contracts/src/customers/validation.ts`
- Modify: `packages/saas-contracts/src/customers/index.ts`
- Modify: `packages/saas-contracts/src/customers/customers.test.ts`
- Modify: `packages/saas-data/src/customers/types.ts`
- Modify: `packages/saas-data/src/customers/repository.ts`
- Modify: `packages/saas-data/src/customers/repository.test.ts`

**Interfaces:**
- Produces `CustomerNeighbor`, `CustomerOrderSummary`, `CustomerWorkspace`, and `parseCustomerWorkspace(value)`.
- Adds `CustomerRepository.getWorkspace(input: GetCustomerInput): Promise<CustomerWorkspace>`.
- `CustomerOrderSummary` contains exactly `id`, `orderNumber`, `status`, `paymentStatus`, `totalCents`, `currency`, and `createdAt`.

- [ ] **Step 1: Write contract tests for exact, deeply frozen workspace output**

Assert literal neighbor and order fixtures, omitted neighbors, empty history, duplicate neighbor IDs, private authority fields, malformed UUIDs, invalid money/status/currency/timestamp values, and more than 50 orders.

- [ ] **Step 2: Run the contract test and observe RED**

Run: `node --experimental-transform-types --test packages/saas-contracts/src/customers/customers.test.ts`

Expected: FAIL because `parseCustomerWorkspace` is not exported.

- [ ] **Step 3: Implement the strict parser and run GREEN**

Reuse the existing exact-object, UUID, money, currency, timestamp, and deep-freeze rules. Do not accept customer contact data or tenant authority inside workspace orders.

- [ ] **Step 4: Write repository tests for the exact SQL boundary**

Assert this call and its argument order:

```sql
SELECT outcome,result_payload FROM saas.customers_get_workspace(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
)
```

Cover found, not found, cross-customer identity mismatch, malformed projection, driver failure, rollback, release, and immutable output.

- [ ] **Step 5: Run repository RED, implement `getWorkspace`, then run GREEN**

Run:

```bash
node --experimental-transform-types --test packages/saas-data/src/customers/repository.test.ts
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
```

- [ ] **Step 6: Commit the contract and repository slice**

Commit: `feat(customers): add safe customer workspace contract`

---

### Task 2: Tenant-scoped PostgreSQL customer workspace

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607310076_customer_workspace.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607310076_customer_workspace.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607310076_customer_workspace_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/customer-workspace-migration.test.ts`
- Create: `apps/owner/scripts/sql/saas/phase3-customer-workspace-manifest.json`
- Create: `tests/saas-phase3/customer-workspace/postgres-harness.mjs`

**Interfaces:**
- Produces `saas.customers_get_workspace(authority tuple, customer_id)` returning `found`, `customer_not_found`, or an existing authority error.

- [ ] **Step 1: Write static migration tests and observe RED**

Assert the migration triple, manifest hashes, signature, `SECURITY DEFINER`, `STABLE`, fixed search path, owner, PUBLIC revoke, app-only execute grant, rollback, and tenant-scoped `customer_id` join.

- [ ] **Step 2: Implement the additive read function**

The function must authorize `customers.read`, find the current customer within `p_store_id`, select previous/next customers by `(created_at,id)`, and aggregate at most 50 `saas.orders` rows where both `store_id=p_store_id` and `customer_id=p_customer_id`.

- [ ] **Step 3: Add PostgreSQL 16 behavioral rehearsal**

Cover first/middle/last navigation, equal timestamps, empty and 51-order history, cross-store isolation, null/unlinked orders, missing customer, analyst access, inactive store, missing feature, ACL, rollback, and reapply.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/customer-workspace-migration.test.ts
node tests/saas-phase3/customer-workspace/postgres-harness.mjs
```

Commit: `feat(customers): add tenant-safe workspace query`

---

### Task 3: Same-origin workspace HTTP and browser client

**Files:**
- Modify: `apps/customer-panel/lib/server-customers/runtime.ts`
- Modify: `apps/customer-panel/lib/customer-http/handler.ts`
- Modify: `apps/customer-panel/lib/customer-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/customer-http/default.ts`
- Modify: `apps/customer-panel/lib/customer-ui/client.ts`
- Modify: `apps/customer-panel/lib/customer-ui/client.test.ts`
- Create: `apps/customer-panel/app/api/customers/[customerId]/workspace/route.ts`

**Interfaces:**
- Adds `GET /api/customers/:customerId/workspace` with forbidden query strings and durable cookie authority.
- Adds `customerApi.workspace(customerId): Promise<CustomerWorkspace>`.

- [ ] **Step 1: Write HTTP and client failing tests**

Cover exact relative URL, GET, same-origin credentials, no-store behavior, malformed ID, forbidden query, missing cookie, private authority headers, store denial, not found, malformed payload, and safe error mapping.

- [ ] **Step 2: Run RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/customer-http/handler.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/customer-ui/client.test.ts
```

- [ ] **Step 3: Implement the minimal handler, route, runtime facade, and client**

Reuse the existing customer authorization and response helpers. No new login or tenant-selection mechanism is allowed.

- [ ] **Step 4: Run GREEN and commit**

Commit: `feat(customers): expose secure customer workspace endpoint`

---

### Task 4: Responsive customer operations workspace

**Files:**
- Modify: `apps/customer-panel/components/customers/CustomerDetailConsole.tsx`
- Modify: `apps/customer-panel/components/customers/CustomerEditConsole.tsx`
- Modify: `apps/customer-panel/components/customers/customer-console.module.css`
- Modify: `apps/customer-panel/lib/customer-console.test.ts`

**Interfaces:**
- `CustomerDetailConsole` loads detail, workspace, tags, and segments in parallel.
- `CustomerDetailPresentation` renders a compact identity bar, previous/next customer navigation, contact and address facts, linked order history, notes, consent timestamps, taxonomy, and a sticky operations rail.
- `CustomerEditConsole` submits editable address rows through the existing optimistic-version update endpoint.

- [ ] **Step 1: Write failing detail and address-book presentation tests**

Assert exact customer/order links, partial-history copy, no guessed email matching, current consent timestamps, semantic regions, inline archive confirmation, mobile-safe controls, address add/remove/default behavior, and preservation of existing version-conflict handling.

- [ ] **Step 2: Run presentation RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/customer-console.test.ts`

- [ ] **Step 3: Implement the detail workspace**

Keep notes, tags, segments, and archive behavior real. Remove duplicated inline profile editing from the detail screen; route edits through the dedicated edit page. Render order rows as links to `/orders/:id` and show `Son 50 sipariş` when `orderCount` exceeds returned rows.

- [ ] **Step 4: Implement address-book editing**

Use controlled address rows limited to 20. A customer may have zero addresses or exactly one default among non-empty rows. Add/remove/default changes submit through `customerApi.update` with `expectedVersion`.

- [ ] **Step 5: Add responsive CSS and run GREEN**

Desktop uses `minmax(0,1fr) minmax(18rem,22rem)` and a sticky rail. At 1024px it becomes one column; at 640px navigation, order rows, address rows, and buttons stack with 44px minimum targets.

- [ ] **Step 6: Run module regressions and commit**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/customer-console.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Commit: `feat(customers): deliver responsive operations workspace`

---

### Task 5: Deploy and live Güzide Kuyumcu evidence

**Files:**
- Modify generated build metadata only during the existing build workflow, then restore source-controlled null metadata.

- [ ] **Step 1: Run full touched-package tests, typechecks, production build, and `git diff --check`**
- [ ] **Step 2: Push the clean branch and confirm local/remote SHA equality**
- [ ] **Step 3: Apply migration `076`, run assertions, and verify function ACL on self-hosted PostgreSQL**
- [ ] **Step 4: Deploy customer panel through the existing Coolify application from the pushed SHA**
- [ ] **Step 5: Verify customer list -> detail -> linked order -> back navigation without mutating business data**
- [ ] **Step 6: Capture desktop/mobile DOM, console, screenshot, health, and one safe interaction proof**
- [ ] **Step 7: Keep the maturity ledger truthful**

After this slice, move `order_history` and `address_book` into the customer operational list, while `consent_history` and `privacy_erasure` remain explicit gaps.
