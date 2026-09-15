# Independent whole-branch review

Reviewed range: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5..508eb54260c9fbbec55d36b03177b59b9ca2ad19`.

Reviewer: existing independent review agent (no implementation authorship). A new highest-capability seat and resuming the former highest-capability reviewer were unavailable due the tool's thread limit; an existing review seat completed the full diff review. This is not an implementer self-review.

## Findings

- Critical: none.
- Important: `StarterThemeComposer.tsx` product-row category→latest/sale replacement loses V3 `sectionId`; strict serialization then rejects the edit. Preserve the existing row identity centrally and add mounted regressions for both source changes, order and strict parsing.
- Minor: extracted `StarterThemePreviewScaffolds.tsx` changes legacy real-product cap3→4 and always emits4 canvas examples regardless of row limit. Preserve legacy cap and honor canvas limit with an explicit count/cap.

No new lifecycle defect was found. The reviewer confirmed frontend scope, conservative conditional save/recovery, honest isolated persistence labels and explicit A03 server-projection limitation. The Node transform diagnostic is documented runner noise, not an application warning.

## Required final gate

One combined correction wave, then one scoped re-review. Final existing119+new regressions, full Panel tests, affected typechecks, production build, diff-check and final browser/screenshot matrix remain controller responsibilities. No merge or deployment is authorized.

Initial verdict: not ready to merge until the Important fix and final gate complete. Final correction and re-review results will be appended here.

## Reviewed correction — 8cf59075d9117b6ee16dfcbb4b581290c75144f8

One combined correction addressed all original final-review findings. Independent scoped re-review confirmed:

- Stable V3 source-switch identity: addressed (`StarterThemeComposer.tsx:223–227`, mounted latest/sale tests).
- Legacy three-card cap: addressed at both legacy call sites.
- Canvas row limit: addressed with validated 4/8/12 counts.
- New breakage in that scoped code review: none.

## Subsequent acceptance defects

The real 390px screenshot exposed a CSS rule that DOM-count tests missed: legacy `previewProducts article:nth-child(3)` hides the third example card at outer widths below700, but not at outer1440/mobile390. A new real-browser assertion failed with3≠4. A07 was reopened; the successful toolbar/column assertions did not establish complete responsive parity.

The full Panel test's first group failed one test: `merchant-admin-ui/route-behavior.test.ts` did not provide `node:crypto` or the already-required session in its mocked page imports/context. Actual production build and full typechecks passed; this is a test-fixture integration gap, not a verified runtime auth failure. The remaining second test group was separately run (54/54 PASS).

Both are being corrected within the original frontend/test permission, with independent scoped review and affected final validation required before closeout. No green full-suite claim is made from these intermediate results.

## Acceptance correction — 1badb864b64c3bcc8138f3b6157e6c4bc6c9f085

Independent scoped re-review: **all findings addressed; no new Critical/Important breakage**.

- Canvas-scoped override at `design-settings.module.css:114` outranks only the leaked rule; legacy preview remains unchanged. Effective CSS test covers outer390 and1440.
- The exact route fixture executes real crypto with a synthetic session; original assertions remain and literal opaque scope/key assertions were added.
- Controller Chrome RED→GREEN: both rows now4/4 visible at outer390 and outer1440/mobile390.
- Controller full Panel suite:1422 PASS /0 FAIL /1 existing SKIP on this source. Original test gap is resolved, not reclassified as baseline.
- Final build and source-bound evidence are recorded in [validation.md](validation.md). A03 remains explicitly partial; no authorization to merge/deploy follows from this review.
