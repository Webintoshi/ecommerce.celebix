# Accounting: due dates and installment plans

The user requested the next implementation stage of the accounting roadmap. This stage adds an editable due date or installment plan for existing customer debt to the shared panel. It does not create debt, collect payment, change inventory or send reminders.

## Rules

- A plan contains 1–36 positive integer minor-unit amounts with distinct increasing calendar dates. Its sum must equal the current remaining debt when saved.
- Existing finance managers can save plans; cashiers retain only their existing debt-read/collection grant. Every RPC rechecks durable store, membership and plan authority.
- Save locks the same accounting store scope as collections, checks the receivable version, and increments receivable/customer versions. Operation UUID and canonical fingerprint provide immutable replay/recovery.
- Plan revisions and operation receipts are append-only. Money ledger rows and collection allocations remain unchanged.
- Current debt reductions close installments oldest first. The UI calls this “Kapanan” because returns can also reduce debt. A reversal that reopens more than the plan total creates an explicit unscheduled residual, with the original due date when known. No new date is invented.
- Today/overdue/upcoming/undated filters run before the server limit. A debt matches every bucket containing a positive installment/residual. Dates use the store timezone. No browser polling.
- Existing exact response shapes remain unchanged. New schedule endpoints use separate strict contracts; old receivable dueDate and overview overdue values derive from outstanding obligations.
- Unknown saves retain the original payload/key. Recheck uses the dedicated schedule operation route. Form closes only on confirmed success or explicit safe cancellation.

## Implementation and verification

1. Add schedule contracts, strict validation, repository RPCs, authenticated HTTP routes and client with focused tests.
2. Add native239 RLS/private tables and least-privilege RPCs; verify real PostgreSQL fixtures for authority, sums, idempotency, concurrent/stale plans, collections, returns and reversals.
3. Add shared debt filters and plan form with integer allocation, clear preview, keyboard/mobile behavior and preserved recovery state.
4. Run scoped accounting/permission regressions, independent review and production build.
5. Publish compatible native support, then shared Panel NET and SITE sequentially. Verify running source and authenticated read-only live UI. No production financial mutations for testing.

Reminders, cash counting, supplier debts, attachments, guided stock returns and full history remain later roadmap stages.
