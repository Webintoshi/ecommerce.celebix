# Discounts list UX — 2026-10-09

## Scope

Customer Panel `/discounts` (`PromotionList`). Warm shared canvas, neutral summary strip, one graphite create action, search, quick status filters, modal advanced filters, open rows and a native popover for existing actions. Existing flat SVG empty artwork retained. No backend, contracts, SQL, auth, payment, tenant or environment changes.

## Preserved functions

- Real overview for 7/30/90 days: active campaigns, affected paid orders, discount, campaign revenue and recovered cart revenue. Currencies remain separate; summary range does not filter the campaign list.
- Server name/code search, effective status, trigger, seven benefits, six audience choices and schedule dates in the store timezone. End date is the next local civil-day start.
- Global cursor pagination; existing items survive append failure and retry.
- View, analysis and coupons; manage-only edit/duplicate, publish-only pause/resume and archive-only archive. Expected record version and durable API client unchanged; conflicts reload the applied query.
- Coded duplication requires a new code; archive confirmation remains. API errors do not remove existing filter intent.

## Evidence

Real production component rendered inside the real panel shell with a development-only injected API fixture. Fixture removed before production build and commit. No production data was mutated during UI QA.

- Browser: 1440×1000, 1024×900, 390×844; document width equals viewport width at each size. Mobile has open stacked rows with complete trigger, code count, usage, status, financials, date and action information.
- Native popover: visible within desktop/mobile viewport; Tab enters actions, Escape closes and restores trigger focus.
- Shared filter dialog: desktop grid/mobile single column, cancel/Escape restores values and focus, incomplete dates show inline error and focus the missing date. Native keyboard date change verified.
- Server filter rendering, cursor append error/retry (three rows retained, five after successful retry), empty/error states and readonly action menu verified.
- Browser error/warning log empty.
- Screenshots: external task artifacts `discounts-list-qa/desktop-1440.jpg`, `mobile-390.jpg`, `mobile-filters-390.jpg` under the task visualization directory.
- Customer Panel typecheck passed. Production Next build passed (compile and TypeScript); removed fixture route absent from build output.
- New behavior tests: 8 passed. Independent source review found no P1/P2 issues.
- Focused promotion UI suite: 92 tests, 89 passed. Three existing `studio.source.test.ts` assertions fail against unchanged `PromotionEditor.tsx`; editor, stylesheet and assertion source are identical to baseline 446557f574ef3d99081f54f2fe138b1fe487a55a. No tests suppressed.

Deployment acceptance is recorded separately after the shared release slot becomes available.
