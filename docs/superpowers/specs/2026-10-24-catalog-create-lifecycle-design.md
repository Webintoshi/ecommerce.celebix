# Shared catalog creation and lifecycle fixes

## Intent

Make saved cart lines removable after catalog withdrawal; connect list trash actions to audited permanent deletion; make detailed new product entry start with an explicit single or variant product choice; keep desktop classification reachable while scrolling.

## Approach

Reuse existing catalog deletion, variant matrix, draft, image/gallery recovery and create contracts. The creation choice changes the starting presentation, without an intermediate product save. Variant setup appears immediately after product basics, before description and optional settings. The existing editor remains responsible for one final Save and preserving draft values. No new dependencies or alternate product creation API.

Alternatives considered: a new multi-page wizard would duplicate form/recovery ownership; merely linking to the old lower variant section keeps the confusing order. A choice followed by the existing reorganized editor is the smallest complete change. This is an implementation choice based on the user's explicit requested sequence.

## Function inventory

Primary task: create one complete product with correct variants, tax, images and categories in one Save.
Information/actions preserved: title, rich description and AI, physical/digital type, tax and price basis, variant price/stock/SKU/barcode/cost/shipping/measurements, option creation and selected combinations, variant galleries, image drag ordering/cover/alt text, categories/brand/collections/tags/supplier/channels, SEO/AI, order limits and Google category, optional resources, cancel/back, dirty navigation, pending barcode/resource operations, validation and media/gallery retry recovery.

## Boundaries

- Canonical customer panel and shared storefront affect every tenant. No store-specific names or authorization exceptions.
- Removal must authenticate the real cart and line, retain operation/version/replay guards, and avoid requiring an active product or current price.
- Permanent deletion cleans mutable saved cart references atomically. Existing payment/checkout blockers and order/accounting/abandoned history remain protected. Failed deletion does not clean carts.
- Choosing a different entry presentation must not silently discard existing variant data or incomplete saved media recovery.
- Desktop category rail uses the actual panel scroll container and topbar offset, bounded scrolling if taller than the viewport. Compact/mobile presentation remains inline and all controls reachable.
- Owner auth, 30-day sessions, package permissions, pricing, checkout and stock formulas remain unchanged.

## Acceptance

Archived/unpriced cart removal, last-line removal and retry; deletion with saved cart reference plus permission and blocker rollback; trash opens permanent-delete confirmation; detailed entry presents two choices; variant entry exposes option setup without scrolling through description and saves variants once; single product/quick handoff, pending-operation and recovery behavior remain intact; sticky rail and zero page overflow at 1440/1024/390; keyboard/focus and rendered screenshot review; exact candidate builds/proof and rollout acceptance.
