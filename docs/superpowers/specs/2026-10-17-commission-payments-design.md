# Cashier commission payments

## Intent and scope

Extend the shared Primler screen with partial payment recording, payment history and correction, outstanding commission debt and explicit cash/bank balance effects. The user directly requested implementation following the released native250 commission entitlement feature. Existing earned-sales calculation and staff permissions stay intact. Root owns live rollout.

## Financial rules

- Keep the selected-period earned report unchanged. Payment balances are explicitly all-time, per store and cashier, in TRY. A different report period cannot create fresh payable entitlement.
- Net paid is the sum of actual unreversed commission expense events. Outstanding is max(earned minus paid, 0); overpaid is max(paid minus earned, 0). Later returns and settlement discounts can create overpaid entitlement; show it separately and offset future earnings. Never rewrite a prior cash event or automatically claw back money.
- Record one positive partial payment against an existing active cash/bank account, with current account version and a content token for the cashier balance. Reject overpayment, currency/type mismatch, insufficient funds and stale state. Snapshot the recipient's actual name/masked phone. Revoked/former staff with earned snapshots remain payable.
- The same transaction creates a normal expense event, debits the selected account and records an immutable commission-payment relation and frozen operation receipt. Category is Kasiyer primi. Existing cash summary and paid expense/profit reporting therefore see the movement exactly once. Earned entitlement itself creates no second expense.
- Derive reversal state from the actual ledger reversal relation so corrections from either Primler or existing expense correction remain consistent. A dedicated correction recredits the original account once and restores outstanding debt, including overpaid cases.
- Reads, payment and correction commands and recovery are manager/store-owner only, scoped to server session/current store/current package. Existing cashier accounting grants do not disclose the private payment workspace.
- Use existing ledger lock/transaction and operation-key recovery patterns. No automatic write retries after uncertain commit; the exact saved command and key can be checked/retried safely. No bank transfer is initiated: this records a payment the store already made.

## Additive interfaces

Preserve the exact native250/legacy commission report. Add native251 private payout storage and helpers plus four manager-authorized RPCs: accounting_commission_balances_read(auth7), accounting_commission_payments_read(auth7, membershipId), accounting_commission_payment_mutate(auth7, kind, operationId, fingerprint, intent), accounting_commission_payment_operation(auth7, operationId).

Contracts: AccountingCommissionBalance includes membership/name/masked phone, TRY, earnedCommissionCents, paidCents, dueCents, overpaidCents and a 64-hex balanceToken. Balances has rows (maximum1000) and exact summed totals. Payment detail has balance, payments (maximum100) and hasMore; balances always include all payment rows. Payment has id/member/event/account/name/type/currency/amount/date/createdAt/note and derived reversed/reversalReason.

Actions are pay and reversePayment. Pay carries membershipId, accountId, amountCents, currency, occurredOn, note, expectedBalanceToken and expectedAccountVersion. Correction carries membershipId, paymentId, reason and both concurrency controls. Result carries operationId/replayed/kind/balance/payment/account, previousDueCents, previousOverpaidCents, previousBalanceCents and previousBalanceToken. Strict parsers bind arithmetic, membership, account, token, operation and original intent.

HTTP GET commission-balances, GET commission-payments/:membershipId, GET commission-payment-operations/:operationId, POST commission-payments/actions/:kind. No browser-supplied tenant authority; approved origin, bounded body, exact JSON and idempotency-key checks apply.

## UI and verification

Reuse shared FinanceModal and safe pending-command pattern. Show all-time earned/paid/due and any overpaid amount separately from selected-period performance. Payment form shows recipient, amount, date, note, chosen account, current debt/account balance and both resulting amounts before Save. History shows partial payments and correction actions. Keep form values/focus and explicit recovery on errors; no false empty or zero after failed reads. Keep existing period controls and explanation.

Focused tests cover partial/full payments, two concurrent commands, replay/lost response recovery, stale token/account, overpayment/funds/foreign account, old disabled staff, returns after payment, both reversal entry points, exact expense/balance effects and manager isolation. Check responsive and keyboard behavior without writing real payments. Build panel/owner compatibility; additive native stage preserves existing1888 functions and rows, then publish shared NET to SITE with actual-source and protected environment/payment/native verification.
