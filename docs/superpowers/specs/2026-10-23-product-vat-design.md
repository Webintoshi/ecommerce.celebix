# Shared product VAT

User approved implementation and shared publication on 2026-10-23 after the product-tax audit. Root owns the release. Existing prices and historical orders must not change.

## Outcome and approach

Collect product KDV in quick creation, detailed creation and editing. Variants inherit the product unless explicitly overridden. An explicit taxable zero differs from exempt and from missing information. Use integer basis points and cents. Price entry may explicitly convert a tax-exclusive input to the visible final customer amount, but a tax-only edit never reprices a product. Costs keep their existing meaning; no invented purchase VAT or tax-adjusted profit.

The approved approach is additive native tax metadata with immutable future sale evidence. A UI-only field would not reach orders, and a blanket20% default would invent data for mixed catalogs. Old Product/Variant JSON projections stay byte-shape compatible with existing owner/storefront readers; the new panel reads a dedicated authoritative tax projection. Old requests without tax retain their original mutation paths and replay fingerprints. Requests containing tax persist all fields atomically.

## Data and interfaces

`ProductTaxChoice` is `{treatment:'taxable',rateBps:integer0..10000}` or `{treatment:'exempt',rateBps:null}`. Missing product tax is unknown; a null variant override inherits. Native product/variant tax columns are nullable, with no guessed backfill. Imported free-text tax attributes remain evidence, not automatically authoritative values.

`GET /api/catalog/products/[productId]/tax` returns productId, productVersion, tax and variants with variantId, variantVersion, tax, effectiveTax and taxSource (`variant|product|unknown`). Product/variant mutation inputs gain optional `.tax`; new UI product creation requires a choice. New scalar tax wrappers extend existing RPCs, while atomic onboarding/import JSON accepts the optional key. Native authority, version checks, receipts and unknown-commit recovery remain mandatory.

New sales retain the applied tax choice, gross amount, base and VAT after allocated discounts. Capture tax at preparation/quote time, so a later catalog edit cannot change settlement. Existing prepares and old orders remain explicitly unknown. Order edit revisions, returns and reversals retain their original evidence rather than consulting today's product. Existing charged totals, ledgers, customer debt, cash, commissions and cost-based profit remain unchanged. Authoritative future paid/completed recognition is retained in a private append-only marker, so deleting an order does not remove its recorded sales VAT. Provider imports retain the legacy payload fingerprint by excluding only the new line tax key; unchanged historical replays cannot rewrite orders. Future provider corrections create immutable tax revisions and preserve their original line tax.

Accounting uses the same store-local calendar dates as the existing profitability view, with native timezone-derived bounds and an echoed date range. Return reversals are shown separately in their own period, preserving the original return period. VAT splitting rounds the VAT half-up first and subtracts it from gross, consistently across SQL and shared arithmetic.

Accounting adds a separately named sales VAT breakdown and coverage of unknown historical lines. Pre-migration deleted orders without retained merchandise/shipping detail are explicitly excluded, with a fixed report limitation and UI note; no merchandise/tax amount is invented from retained ledger cash. It must not call sales VAT payable tax or imply purchase VAT/expense tax was captured. Marketplace tax derives from the product's effective choice; missing or unsupported provider rates stay actionable. Preserve the Trendyol267 serialization, uncertain-write protections and provider-managed order boundaries. Google Merchant continues publishing the final storefront price; never add VAT again.

## Verification and release

Test missing/zero/exempt, inheritance/override, integer rounding, create/edit/replay, mixed-rate discounted sale preparation, catalog changes after preparation, old prepares/orders, order edits/returns and marketplace unsupported/missing tax. Preserve all prior gross price/payment/ledger evidence. Verify catalog, checkout/POS, orders/accounting and marketplace regressions, exact-source current/historical signup rehearsals and affected builds/typechecks.

Publish compatible native support first, then shared Customer Panel NET→SITE, preserving owner/storefront pins and all unrelated environment values. Root verifies running source, worker health, native protected data and authenticated UI. No real store receives a guessed rate or test transaction.
