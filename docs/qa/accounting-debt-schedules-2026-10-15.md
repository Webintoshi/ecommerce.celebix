# Shared accounting: due dates and installments

## Scope

The second accounting stage adds debt due dates, 1–36 dated installments, server-side Today/Overdue/Upcoming/Undated views and a plan detail/edit dialog. All stores use the same shared Customer Panel implementation. No provider/payment execution, automatic reminders, inventory changes or new borrowing is introduced.

## Accounting and compatibility

Plan sums equal current remaining debt at save time, under the existing accounting locks and receivable version. Collections and returns reduce the earliest installments dynamically; the display calls this amount “Kapanan”, not “Tahsil edildi”. Reopened debt beyond the plan appears explicitly as an unscheduled residual. Original due dates remain available as the residual fallback. Plan edits append a revision; they never overwrite financial history.

New strict schedule contracts and four dedicated RPCs coexist with unchanged old accounting/POS response key sets. Only existing receivable dueDate and overview overdue values change to reflect pending installments. Customer and receivable versions advance after plan edits, invalidating old collection previews safely. Cashier permissions remain collection scoped, with no account-balance exposure or plan-management grant.

Unknown saves retain their operation key and immutable payload across retries/reloads. Dedicated recovery reads can return the original frozen committed response. No automatic polling or automatic resubmission is added.

## Verification record

Focused accounting contract/data/HTTP/client/runtime tests passed76/76. Component and draft-model checks passed46/46, covering restored pending plans without a visible list row, mismatched recovery results, version conflicts, cashier read-only details and normal/uncertain cancellation. Existing inventory/topbar/staff/auth test fixtures passed31/31 after their TypeScript test-double annotations were corrected; production behavior in those areas is unchanged. Contracts typecheck and the normal Customer Panel production build passed with TypeScript checking enabled.

Isolated PostgreSQL16 checks passed21/21: strict sums and dates, no money movement on save, server filtering before the200-row limit, store timezone boundaries, actual collections/returns/reversals, reopened residual, stale writes, operation mismatch/replay and concurrent writes, cashier grants and retained history on downgrade. Atomic up+assertions and unused down/reapply passed. The populated native verifier passed and rejected a removed FK or unauthorized internal RPC grant. The fixture has1829 predecessor functions; its single missing function is an unrelated historical WhatsApp bootstrap routine. It is not represented as a full1830 live clone.

Root visually checked the real components at390/1024/1440px with zero page/dialog horizontal overflow, initial date focus, Escape close and restored trigger focus. Fixtures contain fake data only. Production acceptance remains read-only; no live debt/payment record is created for testing.

Sequential native support and NET/SITE publication are pending final running-source and authenticated acceptance evidence in the private release packet.
