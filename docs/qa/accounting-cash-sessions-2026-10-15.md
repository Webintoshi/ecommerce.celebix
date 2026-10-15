# Shared cash opening, closing and count differences

## Scope and user flow

`Muhasebe → Kasa sayımı` selects an existing physical cash account, records an opening count, and later records the closing count. Counts start blank and accept explicit zero. Opening difference, this session's difference, and total difference against the ledger remain separate and are labeled `Eksik`, `Fazla`, or `Fark yok`. A difference requires a note. Bank/card accounts are excluded. Existing account creation, opening-balance additions, transfers, card settlements, collections, expenses and reversals remain available.

The cash expectation is opening count plus the current ledger balance minus the opening ledger snapshot. Timestamp-filtered event lists are not used: backdated and delayed requests must affect the ledger delta correctly. Count operations do not write financial events, movements, account balances/versions, customer debt, payment provider state, orders or inventory. Closed counts retain their original snapshots after later financial activity. Existing owner/admin permissions apply; cashier grants do not expand.

## Recovery and compatibility

Separate strict cash contracts and three private RPCs preserve all old accounting/POS/Owner/storefront DTO shapes. SQL240 adds two private forced-RLS tables and six functions without replacing the1842 existing native functions. One active count per account, original session identity and current financial version prevent duplicate/stale opening or closing. Canonical UUID receipts are scoped to the actor/store and retain their original result.

Unknown outcomes freeze the exact original command across reloads. Storage write/readback must succeed before sending. Recovery validates operation, action, account, session, currency, count, note and financial snapshot. No polling or automatic retry. Normal Cancel/Escape closes the shared FinanceModal and returns focus; an unknown operation cannot be discarded before resolution.

## Verification

- Root accounting contracts/repository/HTTP/client/runtime checks:54/54 passed.
- Root affected accounting component/model/navigation checks:70/70 passed after the final storage-readback fix.
- Contracts, data and Customer Panel typechecks passed; final normal production Next build passed with TypeScript checking enabled.
- Real PostgreSQL16:36 behavior cases and63 actual native outputs accepted by strict frontend parsers. Includes actual collection, transfer, backdated expense, refund and reversal effects; old request timestamps after opening; inherited-only and new differences; explicit zero; negative expectation; safe-integer overflow; same/different concurrent operations; cash-only/cross-store/cashier denial; replay and frozen history.
- Latest UP and strengthened assertions passed in one atomic transaction in a fresh unused fixture. Empty DOWN/reapply and used-DOWN refusal passed. Full schema/function/ACL verifier accepted populated records and rejected a missing FK, wrong unique-index columns and unauthorized internal EXECUTE grant; each tamper rolled back.
- Root inspected the actual component at390/1024/1440px: page/dialog horizontal overflow0, initial count focus and blank count, expected/count/difference arithmetic, Cancel/Escape and restored trigger focus. No framework overlay or browser console errors. Screenshots contain fake fixture data only.
- Independent code and release-packet reviews left no P1/P2 findings. Open receipt/session identity binding was tightened with a failing regression before the fix.

Local fixtures contain1841 predecessor functions and1847 after240; one unrelated historical WhatsApp bootstrap routine is absent locally. This is not a full1842 live clone. Root publication verifies the entire actual1842 predecessor and adds exactly6 functions under the canonical release guard.

## Publication acceptance

Native support and sequential NET/SITE publication require Root's fresh private source/native/runtime/payment/domain proofs and authenticated read-only UI acceptance. No real cash session or financial record is created for deployment QA. Deployment receipts and final running-source evidence are retained in the private cash240 release packet.

## Product limits

This is physical cash counting, not a fiscal report or automatic ledger correction. The screen shows the latest100 closed counts with an explicit older-record notice. There is no automatic closing, reminder, or cash transaction execution.
