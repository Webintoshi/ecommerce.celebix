# Task 1 Report: Customers

## Scope and route inventory

Owned product paths: `apps/customer-panel/components/customers/**` and the customer presentation coverage in `apps/customer-panel/lib/customer-console.test.ts` and `apps/customer-panel/lib/customer-ui/route-behavior.test.ts`.

Reviewed customer routes:

1. `/customers` — list/table pattern. Primary task: find and inspect a customer. Visible information: active/archive/email-consent/total-spend summary, identity, contact, tags, order count, spend, status, updated date. Actions and state retained: workspace create action for managers, search, status filter, CSV export, detail links, load more, first-use create action, loading, filtered/unfiltered empty, load error/retry, and mobile summary cards.
2. `/customers/new` — create-form pattern. Primary task: create one customer with optional default address and explicit channel consents. Fields and state retained: first/last name, email, phone, address, city, postal code, country, email/phone/WhatsApp consents, inline validation, API error, busy state, cancel, submit, and draft values after failure.
3. `/customers/:customerId` — detail pattern. Primary task: understand and operate on a customer in context. Information/actions retained: identity/status/timestamps/version, previous/next neighbors, edit links, contact, linked order history and partial-history notice, addresses, internal notes, spend/order/taxonomy summary, consents, tag/segment membership, taxonomy management links, and archive confirmation.
4. `/customers/:customerId/edit` — edit-form pattern. Primary task: safely update profile, consent, and address book at the loaded version. Actions/state retained: load/retry, version-conflict error, identity fields, up to 20 addresses, add/remove/default address, consents, cancel, save, busy state, and no stale cross-route snapshot.
5. `/customers/segments` — taxonomy/settings pattern. Primary task: create and scan manual segments. Information/actions retained: manager-only creation, name/description validation, list count, descriptions, customer membership counts, empty/loading/error states, and read-only visibility.
6. `/customers/tags` — taxonomy/settings pattern. Primary task: create and scan reusable tags. Information/actions retained: manager-only creation, name and user-selected color, neutral preview with data-backed color marker, stored color value, customer usage count, empty/loading/error states, and read-only visibility.

Existing customer contracts expose archive but no restore operation. No restore UI/API was invented because backend/API changes were explicitly out of scope. Existing customer routes also expose no sort control; none was invented.

## Changes

- Rebuilt the scoped customer stylesheet as one coherent 1,620-line system, down from 2,616 lines (38% smaller), instead of adding another override layer.
- Applied the approved `#F8F7F5` canvas, `#FFFDFC` surface, `#E7E2DD` border, graphite action/text, and limited `#FE6100` focus/selection language.
- Tightened the list into compact summary metrics, a dense 48 px-row desktop table, an intentional filter/export toolbar, and prioritized mobile cards.
- Removed the duplicate create link from the embedded list. The canonical workspace header remains the one primary create action, while the no-record empty state still offers an appropriate first-use create action.
- Scoped the shared workspace header action to graphite within `components/customers/**`; no shared/global CSS was edited.
- Made export failures visible inline without discarding a successfully loaded customer list.
- Protected note and taxonomy drafts typed while a save is in flight: the submitted values are compared with the current form before any successful-save reset.
- Grouped edit identity and consent controls into labeled sections, added autocomplete metadata, and made create/edit save areas persistent and mobile reachable.
- Rebalanced detail into a primary column plus sticky 18–22 rem summary rail, collapsing to one column on mobile while retaining neighbors, linked orders, taxonomy, notes, addresses, and archive.
- Retained user-defined tag color values and save payloads. Color is now an identifying dot/value on neutral chips instead of tinting full decorative surfaces; the new-tag default is neutral `#667085`.
- Added explicit focus-visible, touch-target, reduced-motion, 1024 px, 760 px, and 480 px behavior. At 390 px the summary is 2×2, forms are single-column, the table becomes cards, and scoped save bars clear the fixed shell navigation by 76 px.

## RED evidence

1. Duplicate create destination: `node --experimental-transform-types --test lib/customer-ui/route-behavior.test.ts` failed at `embedded-list-defers-create-action-to-workspace-header` (`true !== false`).
2. CSV failure visibility: the same focused behavior test failed at `export-failure-is-visible-without-discarding-loaded-list`; loaded list text omitted the service-unavailable error.
3. Mobile save clearance: `node --experimental-transform-types --test lib/customer-console.test.ts` failed at `mobile customer save bars must clear the fixed shell navigation` because no mobile bottom clearance existed.
4. Canonical workspace CTA styling: the presentation test failed because `CustomerWorkspace` did not provide the scoped `workspacePrimaryAction` hook and therefore inherited the shared bright primary treatment.
5. In-flight draft preservation: the focused route tests failed with reset counts of `1 !== 0` for detail notes and tag/segment creation after a user typed a new draft while the prior value was saving.

## GREEN evidence

- Focused command: `node --experimental-transform-types --test lib/customer-console.test.ts lib/customer-ui/route-behavior.test.ts lib/customer-ui/taxonomy-route-behavior.test.ts`
- Result: 10 tests passed, 0 failed (fresh run after the final source and CSS changes).
- `git diff --check` on the exact owned product/test paths: clean.
- Existing focused baseline supplied by root before behavior changes: 15/15 customer tests passed.

## Visual and interaction QA

- Root-owned fixture coverage and final viewport evidence are recorded separately in `docs/qa/mira-panel-rollout.md`.
- Verified during coordinated fixture review: list search filtered records correctly; archived filtering showed the honest filtered-empty state; canonical list at 390 px used a compact 2×2/179 px summary; page-level horizontal overflow was zero at 390 px; duplicate toolbar create action was absent; and the neutral customer palette rendered.
- The fixed-nav overlap on the mobile create/edit submit action was reproduced and fixed through scoped footer clearance. The edit action then reached the controlled `409`, displayed the conflict, and kept `Deniz Korunan`.
- Detail previous/next navigation updated the identity correctly. Controlled `409` checks kept the entered tag label and `Korunan QA notu` while leaving loaded detail visible.
- Inspected fixture views: list at 1440/1024/390; detail at 1440/390; segments at 1440/390; tags at 390; create at 1024/390; edit at 390.
- A complete six-route × three-viewport screenshot matrix and a fresh all-routes console/network-clear claim were not completed by this task. Package typecheck remains coordinated by root to avoid colliding with the active fixture server.

## Boundaries and limitations

- Backend/API/SQL/auth/global CSS/Orders/admin/other applications changed: **NONE**.
- No build, full suite, server start, push, deployment, or real customer mutation was run by this task agent.
- Fixture data is visual/interaction evidence only, not live certification.
- The customer API has no restore endpoint or client method. A restore action cannot be implemented within this presentation-only scope.
- No new unsaved-navigation guard was introduced. Existing back/cancel link behavior remains unchanged; this task verifies preservation after failures/conflicts and while note/taxonomy saves are pending.

## Review fix round 1

Changes:

- Split initial list loading/error state from pagination loading/error state. A failed `Daha fazla yükle` request now keeps the loaded customer rows and cursor visible, reports the failure inline, and offers a distinct retry action.
- Added an in-flight ref guard plus disabled/loading button state so repeated activation cannot start duplicate append requests.
- Changed the 1024 px customer-detail layout from a squeezed two-column composition to a single column and removed sticky positioning from the summary rail at that breakpoint.
- Changed note and tag/segment successful-save cleanup to compare the raw submitted draft with the raw current field values. Whitespace-only edits made while a request is pending are therefore treated as new draft input and are not reset, while normalized payloads remain unchanged.

RED evidence:

1. The covering route test failed at `list-prevents-duplicate-append-while-busy` with `2 !== 1` before the in-flight append guard.
2. The taxonomy route test failed at `tags:preserves-new-draft-typed-during-save` with reset count `1 !== 0` when the pending edit only added whitespace.
3. The initial 1024 px CSS assertion was tightened to require the one-column declaration within the 1024-only media block; the previous two-column rail declaration did not satisfy the corrected regression.
4. After the append behavior was fixed, the retry fixture initially returned a false `503` because it called the local `customer(version, status)` helper with `(customerId, 1, "Grace")`; the second-customer constant was also missing. Correcting only that local fixture construction produced the intended real-handler `503` then `200` sequence; no handler or validation contract changed.

Final covering evidence:

- Command: `node --experimental-transform-types --test lib/customer-console.test.ts lib/customer-ui/route-behavior.test.ts lib/customer-ui/taxonomy-route-behavior.test.ts`
- Result: 10 passed, 0 failed; duration 10.958 s.
- Command: `git diff --check -- components/customers lib/customer-console.test.ts lib/customer-ui/route-behavior.test.ts lib/customer-ui/taxonomy-route-behavior.test.ts`
- Result: clean.
- Coordinated browser check: customer detail at 1024 × 900 rendered as one readable column with page-level horizontal overflow `0`. This is focused fix evidence, not a new full-matrix claim.
