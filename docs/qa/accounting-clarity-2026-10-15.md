# Shared accounting clarity — 2026-10-15

## Approved first release

Make the existing accounting screens understandable without accounting training. Use familiar action labels, distinguish a recorded movement from a bank/payment-provider operation, and show the effect on debt and recorded account balances before saving. The user approved implementation and shared publication after the accounting review.

This release changes presentation and local previews. Existing operation keys, frozen recovery payloads, server previews, current-version checks, role/tenant authority and immutable financial history remain authoritative. No schema, ledger mutation, payment adapter, inventory calculation or authorization change is required.

## Function inventory

- Overview: sales, collections, expenses, returns, refunds, commission and recorded web-payment evidence; separate currencies, current customer debt and refund due.
- Filters: dates on all workspaces; customer search on customer debts; channel on overview/debts; currency on overview/debts/expenses. Only supported filters are shown and sent. Explicit Apply, retained current-query data during refresh and honest loading/error states remain.
- Customer debt: named/archived customers, order/opening debt, dates and due dates, collected/remaining/refund amounts, customer history and order links.
- All ten actions: collection, prior customer debt, account creation, additive starting money, paid expense, account transfer, card settlement with commission, reversal, return credit and recorded refund.
- Accounts: cash/bank/card, currency, recorded balances, transfer/settlement and opening money.
- Expenses: category, note, optional document number, date and CSV export.
- Recovery: same-operation recheck, original key/body, preserved input, no second receipt after an unknown result.
- Cashier: collection-only customer debt screen and history; no account-balance read or management action added.
- Existing navigation, business details, invoice connection settings, loading/empty/error, modal cancel/Escape/focus and responsive behavior remain available.

## Accounting meaning

Open balance adds the entered amount to the recorded balance; it never overwrites the account balance. Return credit changes debt/refund due and does not return inventory. A recorded refund tracks money already returned and does not call a payment provider. Transfer and card settlement record movements that happened outside the panel. Reversal keeps the original entry, creates its opposite, and may be rejected when later transactions make it inconsistent.

Before/change/after rows use integer minor units and the known current snapshot. Missing account balances remain unknown, never zero. Reversal effects use original allocations and transfer metadata; incomplete evidence produces a qualified delta rather than an invented balance. Preview is explanatory; the existing server still validates the committed result. Uncertain submissions keep their frozen details and do not display a new draft as the pending transaction.

## Research differences and ordered follow-up

These source observations were checked on 2026-10-15. The priority and Celebix adaptation are product decisions, not claims made by competitors. No future capability below should be described as shipped by this release.

| Priority | Observed reference | Celebix adaptation | Release boundary |
| --- | --- | --- | --- |
| 1 | Paraşüt supports partial customer/invoice collection and debt allocation | Clear customer debt/payment/remaining preview, familiar terms | Existing workflow simplified in this release |
| 1 | Intuit reversals retain the original and add an opposite entry | “Hatalı kaydı geri al”, recorded effects and preserved history | Existing reversal simplified in this release |
| 1 | NN/g recommends familiar language and visible contextual information | Action-specific buttons, consequence summaries and short help | Included in this release |
| 2 | Paraşüt groups collection by due date and overdue status | Editable debt due date, Today/Overdue/Upcoming views, installment plan | Follow-up requires its own data/ledger design |
| 2 | Paraşüt records payment reminder history | Optional merchant-controlled reminders and their delivery history | Follow-up; no automatic messaging added |
| 3 | Shopify POS compares expected and counted cash | Cash opening/closing, counted amount, difference, explanation and actor | Follow-up; no cash-session records added |
| 4 | Zoho Books attaches receipts to expenses | Receipt/photo attachment and visible document status | Follow-up; existing optional document number retained |
| 4 | Small-merchant payable needs identified in Celebix audit | Unpaid expenses/supplier debts, due dates and paid/pending status | Follow-up; this release still records paid expenses |
| 5 | Shopify POS separates item quantities, restock and refund | Guided return with explicit stock, debt and refund consequences | Follow-up; existing accounting return/refund remain separate |
| 6 | Current activity endpoints cap recent records | Paginated complete history, customer statement and full exports | Follow-up; visible list scope stays honest |
| 7 | Zoho Books reconciles bank statement and recorded transactions | Bank/statement comparison first, optional feed later | Follow-up; no real-bank balance or automatic feed claimed |
| 7 | Current invoicing screen stores provider connection settings | Verify real invoice issuance, error/retry and document delivery end to end | Separate provider project; a saved setting is not invoice issuance |

Additional audit items to retain: account name/archive management, complete customer statement/receipt export and product-cost prerequisites before any profit metric. Sales minus recorded expenses must not be labeled net profit. Preserve existing multi-currency separation; the current manual-sale posting remains TRY and transfers require matching currencies.

### Official references

- [Paraşüt: collection recording](https://www.parasut.com/kullanim-kilavuzu/tahsilatlarinizi-kaydetmek)
- [Paraşüt: due-date tracking](https://www.parasut.com/kullanim-kilavuzu/faturalarinizin-vade-takibi)
- [Paraşüt: payment reminders](https://www.parasut.com/kullanim-kilavuzu/musterinize-odeme-hatirlatma)
- [Shopify POS: register sessions](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-pos)
- [Shopify POS: refunds](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/complete-refund-orders)
- [Zoho Books: expenses and receipt attachments](https://www.zoho.com/us/books/help/expense/basic-functions.html)
- [Zoho Books: bank reconciliation](https://www.zoho.com/us/books/help/banking/reconciliation.html)
- [Intuit: reversing an entry](https://quickbooks.intuit.com/learn-support/en-us/help-article/journal-entries/reverse-delete-journal-entry-quickbooks-online/L2prlrnkh_US_en_US)
- [NN/g: familiar language and usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)

## Verification and publication

Baseline accounting UI/component tests passed 30/30 and server/HTTP/repository tests passed 23/23 before implementation. Final accounting/presentation/navigation tests passed 78/78; focused POS, order, navigation and server-page regressions passed 165/165. The production Customer Panel build exited successfully. Independent final review found no release-blocking P1/P2. Local real-component fixtures cover effect previews, cancellation, focus and responsive layout; they are explicitly test data, not live financial operations.

Publication is sequential: Panel NET, authenticated UI acceptance, then Panel SITE and authenticated UI acceptance. Final fresh runtime, protected native state and live acceptance evidence are retained in the private accounting release packet after publication. No actual financial movement is performed for UI acceptance.
