# Shared income and profitability acceptance

## Figures and limits

The new `Muhasebe → Gelir ve kâr` page separates net recorded sales, customer collections and cost-based recorded profit. Manual/POS sales count on completion, web sales use existing verified payment evidence; unpaid/unrecorded web sales are not inferred. Collections can pay older debt and are never substituted for revenue. Brought-forward balances, opening cash and internal transfers are excluded. Refunds, paid expenses and commissions appear separately in cash movement calculations. Each currency remains separate.

Future order line insertion captures private immutable catalog-cost evidence in the order currency. This is order-creation evidence, not a retrospective current-cost calculation and not a tax/inventory valuation method. Zero cost is valid; unknown cost is not zero. Existing historical lines are not backfilled from today's costs. Line changes invalidate evidence conservatively; authorized deletion/product redaction preserves financial history without restrictive new order/item FKs.

Gross/net profit is unavailable where sales lack complete cost or returned-item costs cannot be determined. Actual supplier payment links are separated from operating expenses to prevent subtracting inventory purchases twice; unknown stock-versus-service classification blocks net profit. Generic recorded expenses remain the user's recorded operating expenses; if a user separately records stock purchases there, they must avoid duplicating the product cost. There is no automatic classification, no statutory net profit/tax calculation and no claim that unrecorded expenses are known. Partial/manual returns and old supplier classification cannot be reconstructed by guessing.

## Compatibility

Separate strict report DTO/RPC: bounded inclusive date range366 days, optional currency, manager authority from the existing durable session. No browser tenant authority, polling or financial writes. Request period/currency are bound to response before COMMIT and before rendering. Native242 adds only private cost evidence and three scoped functions; all1855 actual predecessor function definitions/owners/ACLs remain exact. Existing order/payment/stock/collection/supplier/cash DTOs and workflows remain unchanged.

## Observed verification

New contract six tests observed RED→GREEN; scoped contract/repository/HTTP/client/runtime/model/component suite222 passed. Contracts and data typechecks passed. Actual component at1440/1024/390, keyboard Tab/Enter, loading/empty/error/retry/null-profit/multiple currencies passed with no horizontal overflow or browser warnings/errors. Local fixture data are synthetic and do not prove native arithmetic.

Normal TypeScript-enabled production build passed. Independent review of final SQL/contracts/transport/UI and Root publication tooling found no remaining P1/P2. Isolated PostgreSQL verified actual V4 POS create/prepare/cash/completion through the new cost trigger, strict reporting, incomplete historical cost, date/currency/role/tenant boundaries, returns, refunds, signed reversals, zero-price losses, catalog redaction, order deletion and item UUID reuse. Source-bound atomic UP/assertions, empty DOWN and reapply preserve all1,854 local predecessor functions; the local fixture lacks one unrelated historical routine and is not a full live clone. All three local test clusters stopped. Root atomically applied exact current UP/assertions against the actual1,855-function authority and proved all1,855 definitions/owners/ACLs unchanged; new native total1,858. Shared NET/SITE publication uses fresh source-bound packet acceptance before a live-completion claim. No real store debt/payment or test sale is created for acceptance.
