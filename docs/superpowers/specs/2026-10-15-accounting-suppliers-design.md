# Supplier debts and recorded payments

## Approved intent

The user explicitly requests implementation and shared NET → SITE publication. Add understandable supplier debt tracking, partial/full payment recording, and clear remaining-debt and cash/bank balance effects. Existing customer debt, sales, stock, payments, cash counts, auth and owner/storefront behavior must remain compatible. The direct request and Customer Panel AGENTS authorize the implementation and rollout without another approval round.

## Experience

`Muhasebe → Tedarikçi borçları` lists individually identified debts. Add supplier name, explanation, amount/currency, debt date, optional due date and document number. Names are immutable snapshots, matching existing purchasing conventions; this release does not create a supplier directory or infer debt from purchase orders. A new debt changes no cash, expense or inventory record.

`Yapılan ödemeyi kaydet` records money already paid, with an existing matching-currency cash/bank account, amount, payment date and explanation. Show debt and account balances before → after. Cards, insufficient funds, overpayment and stale balances are rejected. This does not initiate a bank transfer. Paid amounts appear once in existing paid-expense totals. Show payment history and an explicit explanation-based cancellation of a mistaken payment. A debt can be cancelled only when no effective payments remain; retain evidence rather than delete it.

Filters: query, status(open/paid/cancelled/all), due(all/overdue/today/upcoming/undated), currency. Apply server-side before the 100-row limit. Detail shows latest100 payments with hasMore; amounts/version derive from the full history. No polling, attachment storage, automatic reminders, procurement changes or new staff grants.

## Additive data contract

New module `packages/saas-contracts/src/accounting/suppliers.ts`; no changes to old DTO keys or native1848 functions.

```
AccountingSupplierAction = 'createDebt' | 'pay' | 'reversePayment' | 'cancelDebt'
AccountingSupplierCreateIntent = {supplierName,amountCents,currency,occurredOn,dueOn,documentNumber,note}
AccountingSupplierPayIntent = {debtId,accountId,amountCents,currency,occurredOn,note,expectedVersion,expectedAccountVersion}
AccountingSupplierReverseIntent = {debtId,paymentId,reason,expectedVersion,expectedAccountVersion}
AccountingSupplierCancelIntent = {debtId,reason,expectedVersion}
AccountingSupplierDebt = {id,supplierName,currency,amountCents,paidCents,dueCents,occurredOn,dueOn,documentNumber,note,status,version,createdAt,createdBy,cancelledAt,cancelledBy,cancellationReason}
AccountingSupplierPayment = {id,debtId,eventId,accountId,accountName,accountType,currency,amountCents,occurredOn,createdAt,note,reversed,reversalReason}
AccountingSupplierList = {debts,today,hasMore}
AccountingSupplierDetail = {debt,payments,hasMore}
AccountingSupplierResult = {operationId,replayed,kind,debt,payment,account,previousDueCents,previousBalanceCents}
```

All cents/versions are safe integers, positive input amounts, three-letter currency, canonical UUID/timestamps/calendar dates. `dueOn/documentNumber` nullable; `dueOn >= occurredOn`; debt/payment dates not future in store timezone. SupplierName1–200, document1–100, note/reason1–2000, trimmed/no control characters. Status unpaid/partial/paid/cancelled; accountType cash/bank. Cancelled fields nullable together. Noncancelled amount=paid+due; cancelled paid=due=0. Debt id=create operationId; payment id=pay operationId. Version=1+all payment count+their reversal count+debt cancellation count. Result binds exact original command; pay/reversal account version increments once; frozen before/after arithmetic is checked.

Exports: parseAccountingSupplierIntent(kind,value), parseAccountingSupplierFilters(value), parseAccountingSupplierDebt, parseAccountingSupplierPayment, parseAccountingSupplierList, parseAccountingSupplierDetail, parseAccountingSupplierResult, accountingSupplierResultMatches(result,kind,intent,operationId), AccountingSupplierIntentMap/Filters and interfaces above.

Repository/client methods: suppliers(filters?,signal?), supplier(debtId,signal?), supplierMutate(kind,intent,operationId), supplierOperation(operationId). Repository authority-input variants follow cash methods, with filters/debtId/kind+intent fields. Native3RPCs: accounting_suppliers_read(auth7,p_filters jsonb,p_debt uuid DEFAULT NULL), accounting_suppliers_mutate(auth7,p_operation uuid,p_fingerprint text,p_kind text,p_args jsonb), accounting_suppliers_get_operation(auth7,p_operation uuid,p_expected_fingerprint text DEFAULT NULL). Read result is list when debt null and detail otherwise. Same auth7 types/order as existing accounting RPCs.

HTTP: GET `/api/accounting/suppliers`; GET `/api/accounting/suppliers/:id`; POST `/api/accounting/suppliers/actions/:kind`; GET `/api/accounting/supplier-operations/:id`. Existing central auth/origin/header/body/operation guards; manager only. Same-origin/no-store client. Immutable actor/store scoped receipt and command persistence before POST; uncertain results freeze exact command and require manual check/retry. Normal Cancel/Escape closes and restores focus. No silent duplicate or discarded unknown operation.

## Native money integrity

Four new private forced-RLS immutable tables: debts, payment→existing expense links, debt cancellations, operation receipts. Add indexes/FKs, revoke direct app/table/internal helper privileges. Recheck durable authority after common release/operation/catalog-store/accounting-store locks. Derive paid and version from payments and existing reversals, so the existing expense reversal correctly reopens debt without modifying old functions.

Payment delegates once to existing `accounting_mutate('expense')` within the same database transaction using category `Tedarikçi ödemesi`, then links its event. Reversal delegates once to existing reverse. Never return a normal failure after a ledger write; raise on a failed postcondition so the entire transaction rolls back. The new receipt freezes supplier+account result. Existing expense receipts cannot be attached using a reused operation key. A failed/cancelled debt creates no financial event. Cash-session expectation naturally sees these ledger movements.

## Verification and rollout

Focused RED→GREEN tests: strict contracts, RPC authority/binding, HTTP/client recovery, UI arithmetic/keyboard/mobile; real PG partial/full/overpay/insufficient/stale/concurrent/replay/reverse/cancel, tenant/cashier denial and cash-session ledger delta. Independent review and normal production build. Native241 preserves exact1848 predecessors and strengthens previous verifier legacy exclusion with the new exact predecessor manifest. Root is sole publisher. Fresh private guarded evidence, canonical lock, global idle and6GiB floor; compatible native first, NET read-only live acceptance, SITE read-only live acceptance, final source/native/payment/domain witnesses. No real financial writes in live QA.
