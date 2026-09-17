# Task 3 — authenticated active-order archive surface

## Scope and base

- Base: `ce754bf28f1e9a758223a8fe4e2709ace44d0fb7`
- Changed only the archive client, order detail console, and their existing focused test file.
- No backend, SQL, authorization, notification, credential, live-data, deployment, or push activity.

## TDD evidence

### RED

Command:

```text
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts
```

Result: exit 1; 37 tests, 33 passed, 4 failed. The new failures were exactly the absent `archiveOrder` client, absent rendered archive form, and absent archive submit handler in the two interaction tests.

### GREEN

Command:

```text
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts
```

Result: exit 0; 37 tests passed, 0 failed, 0 skipped. Node emitted only its existing experimental transform-types warning.

`git diff --check` also passed with no output.

## Implementation

- Added strict same-origin `archiveOrder` POST handling with explicit idempotency key and exact order/operation/archive-state response binding.
- Added a compact native details/form action for active orders, visible only with server-projected `manage` capability; archived orders keep the existing restore form and read-only users see neither mutation action.
- Explicit submission rechecks archive eligibility before the write, uses the fixed non-secret `merchant-panel/orders/archive` evidence reference, blocks duplicate busy submissions, and reuses one operation ID for the same order-and-reason retry intent.
- Ineligible submissions show a concise operator-facing error and perform no archive mutation. Successful mutations use the existing reload path so the refreshed order renders as archived.

## Review concerns

- No Task 3 release blocker found in the owned surface.
- The form intentionally exposes no technical operation, target, or evidence identifiers.
- Focused actual-render coverage uses the repository's existing React static-render harness; no local browser/server or heavy build was run under the low-disk constraint.
- Required independent scoped review remains controller-owned.
