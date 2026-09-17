# Task 1 review fix — archive readiness contract

## Scope and base

- Base: `114bf535` (Task 3 commit).
- Addressed only the verified readiness/facade defect identified by `task-1-review.md`.
- No production SQL, schema, authorization rule, route, credential, live environment, deployment, or push change.

## Review verification

The finding was confirmed in current source: `PostgresOrderRepository.getOrder` calls `orders_get_with_archive`, while approved-staging preflight did not require migration 127's archive relations/functions and the server-order facade accepted all four archive methods as optional despite always-mounted routes.

## TDD evidence

### RED

Command:

```text
node --experimental-transform-types --test apps/customer-panel/lib/server-orders/runtime.test.ts
```

Result: exit 1; 3 tests, 1 passed and 2 failed. The new failures proved that a repository missing `archiveOrder` was accepted and the preflight omitted archive relations/contracts.

### GREEN

Command:

```text
node --experimental-transform-types --test apps/customer-panel/lib/server-orders/runtime.test.ts
```

Result: exit 0; 3 tests passed, 0 failed, 0 skipped. Node emitted only its existing experimental transform-types warning.

`git diff --check` also passed with no output.

## Implementation

- Approved-staging preflight now requires both `order_archive_operations` and `order_archive_state`.
- It requires the exact signatures of `orders_get_with_archive`, `orders_archive_eligibility`, `orders_list_archived`, `orders_archive`, and `orders_restore`, plus `celebix_saas_app` `EXECUTE` privilege on each.
- The new aggregate is included in the fail-closed readiness result check without removing or weakening any legacy table/function check.
- The server-order facade now requires and binds `getArchiveEligibility`, `listArchivedOrders`, `archiveOrder`, and `restoreOrder` instead of conditionally exposing them.
- Focused tests assert the relations, signatures, privileges, readiness row gate, and fail-closed behavior for a missing archive method.

## Remaining concerns

- No local PostgreSQL preflight was run under the explicit low-disk/no-PG constraint; the focused test validates the exact query contract statically and facade behavior dynamically.
- Migration-first rollout and the previously identified migration-127-after-128 rehearsal remain release gates outside this fix.
- This change intentionally does not address the review's lower-priority HTTP coverage or historical-document follow-ups.
