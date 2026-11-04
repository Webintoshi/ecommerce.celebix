# Ezmeo commerce navigation implementation plan

**Goal:** Apply the approved sidebar organization to Ezmeo first, leaving existing pages, business behavior, permissions and other stores unchanged.

**Architecture:** A server-derived, optional presentation boolean enables the sidebar variant for an exact trusted store slug present in `CELEBIX_PANEL_COMMERCE_NAV_STORES`. Only the NET customer-panel runtime receives `ezmeo`; absence or invalid configuration preserves legacy navigation. The variant reorganizes the already permission-filtered navigation objects and retains original URLs and lock presentations.

**Scope approved by user:** Existing Celebix shell and pages; F-Ticaret / E-Ticaret headings; pinned New sale; four catalog groups; shared stock and pricing group. No sample prototype content is promoted.

**Constraints:** No API/SQL/schema/auth/payment/order/inventory calculation or page implementation changes. Register/cashier navigation remains unchanged in this first pilot. Current all-channel orders retain the truthful label “Tüm siparişler”. Existing sales-history dialog remains inside the existing manual sale screen. Cash shortcut reuses the existing `/accounting/accounts` link and its lock rather than introducing another route. Every existing visible destination remains reachable/searchable. Existing historical plan rights stay untouched.

## Tasks

- [ ] Pure presentation model and exact allowlist parser with focused isolation, destination coverage and cashier-preservation checks.
- [ ] Wire server-side flag into the existing client chrome; render recursive short groups, inherited route locks, searchable destinations and pinned sale in existing desktop/drawer components. Existing route rendering remains untouched.
- [ ] Verify typecheck, focused navigation/sidebar/cashier behavior suites, legacy/new mode, meaningful mobile/focus checks, and exact-candidate signup release guard. Independent scope/code review.
- [ ] Guarded NET-only release: fresh seven-app/native/provider snapshot, exact source and one new runtime env row, immutable config witnesses, official build, source-bound build proof and runtime verification. SITE and all owner/front/main witnesses unchanged.
- [ ] Authenticated Ezmeo live UI checks plus non-target store navigation witness; final screenshot and concise report. Keep server flag reversible to legacy.

## Review focus

Nested routes must expand their full ancestor path; menu search must reach every previous destination. Grouping must not smuggle staff links into non-owner views. Route locks must follow original hrefs. Store switching must recompute the server-derived flag and never leak the pilot into another tenant. No wrong claim of channel-filtered order history is introduced by presentation labels.

## Execution ledger

- Reused existing clean dedicated worktree and created `codex/ezmeo-commerce-navigation-20261105` from accepted panel source c3b14a393259bca981e93a6cc82e29dcaf239642.
- Fresh infrastructure observation: seven applications unchanged, native2151, global idle, approximately12.35GiB available before build.
- Ruling: menu grouping uses existing pages and nested menu groups; no new workspace pages or order-filter behavior. This preserves the user's explicit scope restriction.
