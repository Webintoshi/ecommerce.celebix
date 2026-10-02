# Barcode label price emphasis

## Task and retained actions

Primary task: select catalog variants and produce labels whose sale price is easy to read.
Inventory: paged search/selection, barcode reservation, quantities, system/custom templates, field visibility/order/alignment/font size/line limit/auto shrink, dimensions/margins, thermal/A4 layouts, preview, browser print, PDF download and Zebra203/300 exports. All controls and price snapshot verification remain intact.

## Root cause and scope

Preview already uses700 but inherits graphite. Browser print HTML uses default400 for price. PDF maps bold to a real500 Roboto Medium font. Apply black700 price only in preview/browser/PDF. Add a server-only static Roboto Bold font; no browser font request. Preserve all barcode geometry/renderer calls and label/document price values. Zebra font0 commands remain unchanged pending physical printer proof; do not change global thermal darkness.

## Verification

- Typecheck and production build PASS.
- 38 targeted tests PASS: outputs (independent Code128/EAN decode, exact thermal/A4 dimensions, repeated5000 labels, embedded actual700 face/line metrics), HTTP print/authority/isolation, presentation scope.
- Preview computed price color `rgb(0,0,0)`, weight700 at1440/1024/390; page horizontal overflow false at each size. Console errors0.
- Real PDF raster/text checks: retail50×30 mm with₺8.950,00 and jewelry55.9×12.7 mm with₺999.999,99. One page, complete currency/text, no cut-off. Price uses embeddedRoboto-Bold; other faces preserved.
- Evidence: `evidence/barcode-price-2026-10-02/`. Browser printer hardware and physical Zebra output not exercised.
- Atlas independent read-only review PASS; six independent PDF/print cases PASS. Live rollout pending.
