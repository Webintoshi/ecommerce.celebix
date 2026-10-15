# Shared supplier debt and recorded payment acceptance

## User workflow

`Muhasebe → Tedarikçi borçları` records separately identified supplier obligations, optional document/due date and an explanation. Creating a debt does not create a paid expense, change cash/bank, receive stock or infer a purchase order. Supplier names remain snapshots; names are not automatically merged into a supplier directory.

Partial/full actual payments use existing same-currency cash/bank accounts. Preview shows remaining debt and account balance before → after. Card accounts, overpayment, insufficient funds and stale versions are rejected. Recording does not initiate bank transfers. A payment produces one existing expense event and one negative account movement in the same transaction as the supplier link and frozen operation receipt. Thus existing paid-expense totals count it once, and active cash counts see its real ledger delta.

Mistaken payment cancellation requires a reason and reverses both the recorded expense and supplier debt effect. Existing generic expense reversal also reopens the linked debt because paid/version derive from the full immutable payment/reversal history. Debt cancellation requires no effective payments and retains the original evidence. Existing closed cash counts stay frozen.

## Compatibility and recovery

Native241 adds four private immutable forced-RLS tables and seven functions, including three app RPCs. Existing1848 native definitions, owners and ACLs, old exact DTO fields, customer collection/order/stock/payment behavior and staff grants remain unchanged. Root compares the exact1848 predecessor manifest, excluding only the reviewed seven new signatures. Native236–240 guards remain;240's historical legacy diagnostic is replaced by the stronger exact1848 predecessor proof.

Manager-only HTTP/repository paths use existing cookie/origin/durable tenant authority. Native writes acquire the existing operation/catalog-store/accounting-store locks before nested expense/reversal delegation. Derived debt and locked account versions prevent concurrent overspending or overpayment. Any failed post-ledger condition raises to roll the entire transaction back.

Browser commands must be saved and read back in actor/store-scoped session storage before POST. Uncertain results freeze the original key/body and allow only explicit manual lookup/retry. Lookup failure retains uncertainty; definite failures retain form inputs. Malformed stored commands fail closed. Normal Cancel/Escape closes the dialog and restores focus; scheduled focus is cancelled to prevent a rapid-close race.

## Observed verification

- All accounting contracts:30/30; initial new supplier contract12/12 observed RED→GREEN.
- Root combined contracts/repository/HTTP/client/runtime/model/component regressions:202/202 passed.
- Contracts/data typechecks and normal production Customer Panel build passed, with TypeScript checking enabled and `/accounting/suppliers` generated.
- Actual component on fake data at1440/1024/390: no page/dialog horizontal overflow. Partial preview800→500 and cash1500→1200; blank initial amount, initial input focus, Cancel/Escape closure, restored trigger focus, console warnings/errors0. No real financial write used for UI acceptance.
- Independent source review found the omitted-status/open-list mismatch; it was corrected from default all to open with a native failing regression before the fix. No other P1/P2 finding remained.
- Isolated PostgreSQL16 covered partial/full payment, direct/generic reversals,3 concurrency cases, immutable receipts, funds/overpayment/currency/stale authority, cross-store/cashier denial, Istanbul dates, filters before100-row limits and101-payment totals. Forced post-ledger failure rolled back every money/receipt row. Exact sources, payload parser counts, final atomic assertions/down/reapply and drift proof are retained in the private native241 fixture receipts.

The isolated fixture has1847 predecessor functions, missing one unrelated historical WhatsApp bootstrap routine; it is not presented as a full live1848 clone. Root's fresh live application guard proves all1848 actual predecessors remain exact.

## Publication gates and limits

Root alone applies current UP+assertions atomically under the canonical lock, verifies native boundaries, then publishes shared NET and SITE sequentially with actual read-only authenticated acceptance. Exact running-source, native, six-runtime, payment, domain and disk-floor evidence lives in the private supplier241 release packet. No real supplier debt/payment is created for publication QA.

Lists show at most100 matches and disclose more results; use filters to narrow. Details disclose capped payment history while outstanding totals/version use all payments. No background polling, automatic procurement posting, supplier directory, attachment storage, reminders or actual bank transfer is added.
