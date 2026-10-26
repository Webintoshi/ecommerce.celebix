# Customer detail and search correction

> Root integrates, verifies and publishes. Implementation agent owns exactly the detail presentation and customer CSS; no controller or API changes.

**Goal:** Correct the pale search action and the fragmented customer detail screen identified by the user after release367296d57469753ac1d6da7f3b94bc2f8961f879.

**Observed cause:** Search explicitly uses the pale `--cp-soft` fill. Detail uses eight framed cards for nine groups, repeats status and customer name, exposes the same editor in three places and puts its mobile metrics below all primary content.

**Primary task:** Identify a customer, understand their order/spending history, contact them and perform the permitted next action.

**Chosen layout:** Three coherent surfaces. A full-width profile band contains identity/status, back/neighbor navigation, the sole edit action, email/phone, four facts and quiet creation/update/last-order/version metadata. A main activity surface groups orders and internal notes. One information rail groups addresses, consent, tags, segments and explicit archive confirmation using flat dividers. Mobile order is profile/facts → activity → information. Search receives graphite fill/inverse text, matching the user's explicit correction.

**Alternatives considered:** CSS repaint alone retains the fragmented hierarchy. New tabs would hide existing information/actions. The three-surface regrouping addresses both problems without a new workflow.

## Preservation inventory

- Exact name/status, created/updated/version, mailto/tel, last-order/empty, four actual counts/amount/currency.
- Back and previous/next links, canonical edit with manage+active gate.
- Every order number/link/date/order+payment status/amount; partial versus unavailable/empty history.
- All address labels/default/recipient/lines/district/city/postcode/country and count.
- Notes text/dates, required2000-character composer, native submit, busy/notice/error, conditional reset and stale-customer safeguards.
- Consent channel/state/recorded date; all tag colors/checked state, segment checks, management links, growth_tools link.
- Independent manage/archive/active/busy/segmentsAvailable gates, archive disclosure then explicit confirmation.
- Loading, initial error/retry, retained refresh/error buffers, no merchant writes during QA.

## Bounded work

- [ ] `CustomerDetailConsole.tsx`: presentation markup regroup only. Imports/helpers/controller suffix remain byte-identical. Remove only duplicate breadcrumb name, second status badge and two duplicate edit links; canonical actions retained.
- [ ] `customer-console.module.css`: filled search action, three-surface detail arrangement and responsive layout. Preserve other customer page styles, global tokens/Urbanist and single focus behavior.
- [x] Actual-component regression before editing: five tests, three pass and two intended failures (missing compact profile surface and pale search fill).
- [ ] Tests preserve all facts/events/gates and prove single edit/status plus early metric DOM order. Update only obsolete duplicate-link/rail-label expectations in two existing tests if needed.
- [ ] Actual screenshots at1440/1024/390, rich and empty/read-only/archive/locked/error states, keyboard focus/Enter, notes failure retention; independent visual/source review.
- [ ] New source-only locked release kit, exact final reviewed detail hash plus frozen controller/expressions,346unchanged dependency witnesses, six route and font proofs.
- [ ] Fresh baseline, exact-candidate official build/signup/provider checks, Cemo exactSHA review; NET then SITE acceptance and authenticated live proof. Root sole publisher confirmed by Cemo; no backend/native/env change.
