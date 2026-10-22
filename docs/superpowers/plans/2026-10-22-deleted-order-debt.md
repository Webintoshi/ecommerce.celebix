# Close the remaining debt when an order is deleted

## Agreed behavior

Deleting a saved order automatically closes only its outstanding receivable in the same transaction. Existing collections, cash/bank movements, discounts, refunds and accounting history remain intact. A partially paid 2,400 TL order with 2,000 TL collected receives a 400 TL noncash discount adjustment, without creating a refund or restoring inventory. Other orders' debts are unchanged. The generated closure cannot be reversed to reopen a deleted order by accident. Cashier order access does not grant permanent deletion.

## Root cause

Native216 deliberately detaches `accounting_receivables.order_id` and keeps the deleted order number, without changing financial balances. Customer debt readers therefore continue to include the outstanding debt after the visible order has been removed.

## Implementation

1. Add source-pinned native261: private audited zero-cash collection/discount adjustment before the existing detach, within the existing authorized/idempotent deletion transaction. Preserve lock order, version checks, actor/operation identity, historical readers and actual money evidence.
2. Explain the automatic debt closure and retained collections in the existing delete confirmation. Preserve its typed confirmation, impact checks, pending state and safe retries; no new interaction step or response contract.
3. Verify unpaid, partial, waived, paid/refund, edited orders, other-order isolation, duplicate/recovery/rollback and authorization cases in disposable PostgreSQL16; focused UI copy/behavior and affected type checks.
4. Refresh and commit the source-bound signup compatibility proof. Root only publishes compatible native support then shared panels NET→SITE, with four unchanged owner/storefront witnesses and live read-only confirmation checks. Do not delete a real customer order for testing.

Previously deleted orders are not bulk-adjusted by this migration.
