# Package catalog visual and behavior verification

## Assets and generation

Built-in Image Gen was used for the concept and four distinct product images. The common production prompt was: standalone CELEBIX software-license sculpture, luxury studio product photography, landscape3:2, fully visible centered on a low matte stone plinth, soft neutral background, controlled brand orange #FE6100 with ivory/graphite, clean embossed sans-serif branding, no prices, slogans, badges or UI. Each generation referenced the full concept's product family.

| Asset in `apps/customer-panel/public/payments/plans/` | Prompt variation | Final size |
|---|---|---|
| `celebix-free-v1.webp` | Ivory travertine monolith, subtle orange seam; exact “CELEBIX / ÜCRETSİZ” |960×640,52,546bytes|
| `celebix-starter-v1.webp` | Single folded orange slab with diagonal facets; exact “CELEBIX / BAŞLANGIÇ” |960×640,64,474bytes|
| `celebix-growth-v1.webp` | Charcoal front slab and two ascending orange panels; exact “CELEBIX / BÜYÜME” |960×640,51,440bytes|
| `celebix-professional-v1.webp` | Charcoal monolith and satin-orange architectural arch; exact “CELEBIX / PROFESYONEL” |960×640,55,866bytes|

Main-site `public/payments/plans/` contains identical bytes. Originals remain in the Image Gen output folder. Final WebP export changes only resolution/encoding.

## Fidelity ledger

Concept: `exec-3fd499d2-a8db-4f30-a815-0bece0fa8212.png` in the Image Gen folder identified in the design. Render screenshots: `/tmp/celebix-plan-desktop-20261028.png`, `/tmp/celebix-plan-summary-20261028.png`, `/tmp/celebix-plan-mobile-20261028.png`, `/tmp/celebix-plan-tablet-20261028.png`.

- Palette/font: existing Urbanist, graphite, neutral canvas and controlled orange preserved; no font or global shell replacement.
- Product hierarchy: four named, equal-sized cards, coherent generated artwork, native radio selection and clear prices match the concept direction.
- Purchase hierarchy: selected thumbnail, package/period and net/VAT/total precede the full comparison, with one checkout/request action.
- Pricing/copy: actual catalog wins over illustrative data in the concept. Period changes synchronize cards, equivalent price, summary, offer and checkout term. Above-fold copy has no unrelated additions or popularity claims.
- Tables: actual fifteen capabilities and five quota rows preserved. Historical agreement limits are read independently from offered tariffs.
- Asset treatment: uncropped3:2 artwork with native dimensions reserved. Main checkout's square thumbnail now uses contain for package art; other product kinds keep their original framing.
- Responsive: exact inner-browser QA widths390/1024/1440 had document scroll widths390/1024/1440. All images loaded. Mobile table scrolled680px inside356px container; other widths fit internally. Native IAB viewport is1280px, so additional widths used same-origin iframe QA frames; no production frame was added.
- Keyboard: Tab reaches term controls and native radios; Right selects Growth and updates its annual summary to54,444TL including VAT.

Intentional differences: preserve the real existing244px app shell, actual catalog seat counts2/5/15, full capability table, final3:2 asset family and responsive summary wrapping. The generated1159×1358 concept cannot dictate a narrower replacement sidebar or invented data.

## Verification boundaries

Panel focused behavior19/19 and typecheck passed. Main checkout tests32/32 and typecheck passed before the final package-image framing adjustment; all32 tests rerun for that adjustment. Main payment calculations, authority and fulfillment were not changed. No actual card charge is part of QA.

The unchanged broad PageGuard test-loader cannot resolve `logo-manifest.json`; independent review located its pre-existing JSON-resolution limitation. Relevant package/checkout suites pass. IAB's iframe inspection bridge emitted MutationObserver errors only during the local frame-width harness; the bundled QA application contains no MutationObserver. Final direct live-page console inspection is required.
