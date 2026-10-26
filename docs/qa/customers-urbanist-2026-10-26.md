# Customers Urbanist acceptance — 2026-10-26

Scope: six customer screens on the shared Customer Panel. Backend/API/auth/customer/accounting/order contracts unchanged. Five production presentation files only: one consolidated stylesheet and four exact semantic/CTA transforms.

## Implementation and control repair

- Search input and submit button no longer share one label. Accessible input name and native submit handler remain unchanged.
- Pointer, non-selectable action text and quiet secondary surfaces distinguish operations from native choice controls.
- Search, select, color, consent and address controls retain one keyboard focus indicator.
- Taxonomy creation is primary; retained New customer navigation is secondary on tags/segments.
- Forms use a consistent width, aligned fields and save bars above mobile navigation. List/table/card/detail facts and authority gates remain intact.

## Verification

- Root customer-focused command: 34 tests passed, zero failed. Actual-component tests cover search click/native form path, trimmed queries, label semantics, CTA variants/permissions; existing route/client/HTTP/server/stability tests remain.
- Customer Panel TypeScript check passed.
- Release source checker: 22 Python and 18 Node tests passed; exact four TSX transforms plus local CSS, 343 unchanged production dependency witnesses.
- CUA rendered QA at 1440, 1024 and 390 px for list, new, detail, edit, tags and segments: zero page overflow. Full synthetic long names/contact/address/order statuses/amounts, tags and consent details remain available.
- Real browser Enter submits search; clicking Ara focuses an action, not the input label. Single 2px keyboard rings, pointer cursor and native color input's full 44px hit area confirmed.
- Empty and loading states inspected; initial list error persists until real Retry, then loaded eight synthetic records through cursor pagination.
- New form invalid submit focuses first required field. Synthetic failed save preserves names and selected consent.
- Read-only new/edit denial, read-only detail, archived detail and growth-tools locked segment controls checked. Existing locked-feature behavior tests retained.
- Atlas source/fixture/screenshot review: no material blockers after fixture permission and deterministic-error fixes.
- Browser logs: only development Fast Refresh reload notices; no application error observed.

Screenshots and layout checks are saved under the task visualization directory, prefixed customers-. Synthetic fixtures only; no live merchant records were changed.

## Publication

Exact-candidate official build/signup/provider proof, independent SHA review, and sequential NET/SITE acceptance are still required. Publication receipts will be recorded privately in the owned release kit.
