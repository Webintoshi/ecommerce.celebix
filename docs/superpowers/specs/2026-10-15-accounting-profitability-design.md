# Shared income, cash and profitability overview

User authorizes shared implementation and sequential NET → SITE publication. Root is sole publisher.

## Experience

`Muhasebe → Gelir ve kâr` is a separate read-only page. Current Istanbul month defaults, explicit dates (at most366 days), optional currency, all channels. No polling or money mutations. Three values: net recorded sales, received payments including older debt, and recorded-cost profit. Currency totals are never combined. Existing accounting overview, collections, stock, checkout, supplier/cash workflows remain intact.

## Meaning of the figures

Net sales = dated recorded sales − dated return credits. Collections are independent from revenue. Cash remainder = collections − actual recorded refunds − all paid expenses − card commission; includes card collections and is not bank balance. Opening balances, brought-forward debt and internal transfers are excluded.

Product cost must be historical evidence, never today's catalog cost applied to older sales. Future order line insertion records private immutable cost evidence (zero valid, unknown nullable); no retroactive guess. Order deletion and product detachment remain compatible. Monetary line mutation invalidates cost evidence conservatively. Aggregate totals are signed safe cents and dated reversals retain their own period.

Gross profit = net sales − known cost only when every included sale has complete evidence and no unresolved return cost. Recorded profit additionally subtracts paid operating expenses and commissions. Supplier payments are tracked separately because stock versus service classification is unavailable; their presence blocks whole profit rather than subtracting inventory twice or pretending they are all stock. Missing cost, uncertain returns and unclassified supplier payment counts are explicit. The result excludes tax and unrecorded expenses; it is not a certified net-profit statement.

## Contracts and security

A separate strict RPC/DTO with existing manager-only durable authority and GET-only session transport. Exact dates/currency echoed and checked before COMMIT and browser rendering. Bounded date input and numeric arithmetic; foreign tenant and channel injection rejected. Old DTOs/functions remain exact; native242 is additive, forced-RLS private evidence and definer RPC only. Future stores use the same shared runtime.

## Acceptance

Focused contract, repository, HTTP/client/runtime and component tests; real PostgreSQL behavior for historical missing cost, future snapshots, returns, signed reversals, supplier exclusion, currency/date boundaries, tenant/role denial and old contracts. Normal production build. Actual component at1440/1024/390 and keyboard; then authenticated read-only live acceptance NET/SITE. Full1855 predecessor functions/ACLs/owners preserved, current source-bound proof and fresh deployment witnesses required. No real financial test records in stores.
