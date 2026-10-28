# Product list polish

## Direction and task

The merchant finds a product, compares price/stock/publication, then edits or performs a permitted catalog action. The supplied Ezmeo screen confirms the current product list and real data. The established Celebix direction supplies Urbanist, warm canvas, graphite actions, restrained orange selection, rounded 8/12px controls and quiet borders. Anti-slop is active during implementation by the user's explicit choice.

Design Read: ENERGY 2, RHYTHM 2, MOTION 1. Product photographs and readable product names give the page its identity. Compact scope filters, a purposeful toolbar and one dense table form the hierarchy. Hover/focus feedback only; no decorative animation, invented metrics, new brand assets or theme switch.

## Function inventory

- Real summary scopes total/active/draft/out of stock, including unavailable totals and existing stock fallback.
- Debounced catalog search and URL/back-forward/cursor restoration; status, stock, category, brand and collection filters.
- Five sorts, refresh, visible-page guarded CSV export, import, product creation and media-completion link.
- Page sizes20/50/100; next/previous; page-scoped selection; permission-specific atomic bulk active/draft/archive with expected versions, confirmation and reconciliation.
- Product image/title/SKU/effective and comparison prices/stock/status/publication. View, barcode labels, edit, archive, permanent deletion and restore retain existing capability gates.
- Category ranking remains the existing separate workspace with drag/keyboard movement, undo, versioned save and dirty-navigation protection.
- Loading, empty catalog, no matches, query failure, options failure, bulk outcome and stale rows retain truthful copy/retry. Destructive dialogs retain their audited control logic and confirmations.

## Implementation

1. Keep the legacy shared catalog stylesheet and controller intact. Add an isolated product-list stylesheet and only presentation/local keyboard-disclosure changes in ProductListConsole.
2. Replace the oversized equal summary tiles with compact count-bearing scope controls. Real counts stay bound to the same data and handlers.
3. Group search, sort, filter, refresh and ranking in the working surface; keep creation primary. Active filter context remains visible when the filter panel closes.
4. Keep select-all and page controls reachable; show bulk action choice/apply only after selection. Preserve eligible IDs and all busy/version gates.
5. Keep visible Edit/View by each product. Group secondary view/barcode/archive/delete/restore under a native named disclosure, with Escape close and focus restoration. Preserve existing destructive trigger refs and handlers. Disclosure content must remain unclipped at every breakpoint.
6. Use a compact neutral missing-media message with the genuine next-action link. Reuse existing empty-state artwork or honest existing placeholder.
7. At390px, make rows purposeful product summaries retaining every fact/action. Explicitly restore inherited hidden price/stock/publication and page-size controls. At1440/1024/390, zero page overflow and44px targets. Use graphite focus, legible secondary text and semantic statuses.

## Verification and rollout

Run focused catalog controller/deletion/stale-read tests and meaningful interaction tests for changed presentation, typecheck, official exact-candidate build/signup/provider checks. Exercise actual isolated production UI across1440/1024/390, empty/error/loading/readonly/archived and full permissions; record click-through, keyboard and contrast evidence and four-block Anti-slop delivery gate. Submit source/screens to independent Atlas review.

Coordinate the shared publication after existing publications finish; rebase onto the accepted exact baseline, preserve all independent changes. Root alone publishes NET then SITE with fresh source/runtime/native/payment/environment/queue/capacity evidence. Confirm live Ezmeo and a second shared panel before reporting completion. Never mutate merchant catalog records merely to verify presentation.
