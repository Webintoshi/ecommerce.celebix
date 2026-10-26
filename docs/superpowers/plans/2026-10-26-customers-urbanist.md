# Customers Urbanist Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the bounded tasks below. Root owns browser QA, integration and publication.

**Goal:** Bring all six customer screens into the approved Urbanist operations language, fix confusing control affordances, and publish both shared Customer Panels.

**Architecture:** Consolidate the existing local customer CSS and make only exact reviewed presentation/semantic changes. Preserve all data hooks, handlers, calculations, permissions, clients, APIs, contracts and operational recovery. Reuse the isolated checkout and existing synthetic customer browser fixtures.

**Tech Stack:** Existing Next.js/React, CSS Modules, Urbanist variable font, Lucide and flat SVG. No new dependency.

**Spec:** This user's direct request for customers and child pages, extending the approved orders/analytics design. Prior instruction is direct implementation and rollout without another mockup/approval round.

## Global constraints

- Exact base dedeae71c44f9ac4dfe15989896f12e84dc2326a. Root is sole publisher, confirmed with Cemo.
- Six routes: /customers, /customers/new, /customers/[customerId], /customers/[customerId]/edit, /customers/tags, /customers/segments.
- Actual shared tokens remain authoritative: warm canvas, white thin-bordered radius12 surfaces; graphite primary, quiet neutral secondary, restrained orange selection.
- Existing Urbanist and five roles remain unchanged: body500, control600, heading700, value700, helper400.
- No visible repeated page title/introduction; retain semantic headings and the header bridge.
- Preserve every action, fact, data field, deep link, role/plan gate, field buffer, version check and stale-response protection.
- No backend, auth, permission, payment/accounting, schema, infrastructure or environment change.
- Zero page overflow at1440/1024/390; complete mobile facts and44px targets; one2px focus indicator.
- Real native selectors, color picker, consent checkboxes and default-address radio remain appropriate controls.
- Root uses CUA for browser checks; fixture mutations only, no merchant record writes.

## Function inventory / primary tasks

**List: find and open a customer.** Preserve four real summary values; submitted search and editable search buffer; all/active/archive select and clear;25-row server cursor pagination, stale/duplicate append guards, retained rows on same-query refresh, hidden previous-query rows, scoped errors/retry; full CSV export, all seven table columns and complete mobile records including tags; permission-gated new-customer action.

**New/edit: save the intended customer contact, address and consent data.** Preserve required first/last name, optional email/phone, conditional address requirements, country normalization, all address fields, up to20 edit addresses and single default radio/fallback; three consent channels and email-change consent reset; first-invalid focus, labels/autocomplete/aria errors; actual create/versioned update, busy/error/conflict states, field preservation, canonical navigation/cancel.

**Detail: inspect the customer and perform the permitted next action.** Preserve identity/status/dates/version, back/previous/next/edit; current contact, last-order and all real order-history facts/links/status/payment/amount; all addresses/default marker; notes and conditional reset; four facts, consent dates/status, immediate tag/segment checkbox assignments and management links; separate manage/archive permissions, growth_tools segment gate/upgrade link, archive confirmation, read-only/archive state and late-record/route guards.

**Tags/segments: create a reusable classification and inspect its use.** Tags retain name, native merchant-selected color, live preview, swatch/hex and membership counts. Segments retain name, optional description, manual kind and membership counts. Preserve blank-name validation, real create, editable typing during busy/refresh, conditional reset, retained records, initial/error/empty/read-only states and late kind/write protection. No new row edit/delete/search/pagination is invented.

## Observed control defect / root cause

Live DOM confirms export/load-more buttons use cursor:default and user-select:auto; selects and action buttons share near-identical white borders. Search input has a2px outline while its parent adds a3px orange shadow; clicking its submit button keeps the input-like parent highlight. The parent is a label with two labelable descendants (input+button). Source also places a transparent native color input over a label without an explicit full-area size.

Fix at these boundaries: clear button affordance/cursor and non-selectable action text; single focus ring for the focused input or action; native select retains a visible choice affordance; search wrapper becomes a div while its existing accessible input label and submit handler stay exact; color control retains native semantics and an explicit hit area. Never suppress keyboard focus globally.

## Review focus

- Mouse click on a button must not look like editing/selecting a text field; keyboard focus remains visible and correctly owned.
- Failing save/refresh, edits while busy and uncertain/late responses must retain correct buffers and customer/kind authority.
- Archived, cashier/analyst and growth_tools-locked views retain all existing gates.
- Customer order/debt/consent data and login/cart identity remain byte-identical sources.
- Long names, merchant tag colors, full addresses and mobile actions remain readable and complete.

## Tasks

### 1. Shared visual system (single CSS writer)

- [x] Consolidate components/customers/customer-console.module.css into a coherent local stylesheet; retain every used class.
- [x] Use white summary/list/detail/form/taxonomy panels; compact44px controls, readable13/14px tables, clear profile hierarchy and intentional single-column mobile.
- [x] Implement shared pointer/user-select/hover/disabled policy for action controls; correct single focus ownership and native color hit area.
- [x] Remove obsolete style layers and local/global token fallbacks; keep merchant-configured tag colors intact.

### 2. Exact semantic/CTA presentation fixes

- [x] Add a failing actual-component regression covering one control per label, named search input, submit button and unchanged search execution.
- [x] CustomerListConsole: change only the search wrapper label to div; keep all input props, submit event and state code identical.
- [x] CustomerWorkspace: add an optional presentation-only primary-action flag (default true); tags/segments pass false so their create action is primary and the retained New customer link is secondary. Preserve href and canManage gates.
- [x] Keep all other production TSX byte-identical; guard each exact permitted transform rather than broad JSX masking.
- [x] Verify semantic behavior test plus existing customer stability/route/API tests. Update pure obsolete style assertions only after review; never weaken behavior assertions.

### 3. Synthetic QA and integration

- [x] Reuse /mira-customers/{list,new,detail,edit,tags,segments} fixtures; add narrowly isolated state/transport support only where necessary.
- [x] Inspect1440/1024/390 for all six screens, loading/empty/error/read-only and retained errors/typing, native color selection, consent/default radio, search/action focus and keyboard navigation.
- [x] Independent source/visual Atlas review; typecheck and exact official candidate build/signup/provider checks.

### 4. Root publication

- [ ] New locked source-only customers release kit; six exact route/client/CSS proofs, exact presentation transform guard, customer/data authority witnesses, unchanged global typography/orders/dashboard.
- [ ] Fresh baseline/native/payment/env/capacity and sole-publisher checks; exact final SHA review with Cemo, official build, fresh admissions/seal and exact rendered helper lint.
- [ ] NET acceptance plus authenticated live UI, then SITE acceptance plus live UI; verify globally idle queues and four owner/storefront witnesses.
- [ ] Restore only owned generated metadata, stop owned fixture server, keep the result visible and report any material existing limitation.
