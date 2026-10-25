# Urbanist analytics implementation plan

> **For agentic workers:** Use superpowers:executing-plans for root UI integration and focused subagents for independent font, pure helpers and release preparation.

**Goal:** Apply the approved Urbanist typography across Customer Panel and the approved compact analytics design with no lost functions.

**Architecture:** Keep the authenticated analytics routes/contracts and existing polling. Change interface presentation, self-host the font, and remove repeated frontend computation through bounded formatter reuse and indexed lookups.

**Tech Stack:** Next 16.2.1, React 19.2.3, TypeScript, CSS modules, lightweight SVG, existing Node/happy-dom behavior tests.

**Spec:** `docs/superpowers/specs/2026-10-26-urbanist-analytics-design.md`

## Global constraints

- Base all changes on canonical `e6ac39db4974155c0d92dc0afab51be14c3fe6ad`.
- No API/SQL/auth/payment changes or fabricated data; monetary currencies remain separate.
- Keep all tabs, filters, date/timezone controls, pagination, disclosures and keyboard behavior.
- One normal self-hosted Urbanist variable WOFF2; no new production dependency.
- Verify 1440, 1024 and 390 px with no page overflow.
- Root owns shared release refs/pins/queues; publish NET then SITE and verify exact running source and compiled font/CSS assets.

## Review focus

- Unavailable traffic versus real zero: existing traffic and workspace behavior tests, plus visible fixture states.
- Multiple currencies and comparison day alignment: existing fixture behavior and daily disclosure tests.
- Late/aborted requests and unchanged URLs: existing request race and duplicate-request tests.
- Mobile filter focus and tab keyboard navigation: existing behavior tests plus browser checks.
- Urbanist Turkish glyphs, currency fallback and substantial financial amounts: font binary verification and live/fixture screenshots.

### Task 1: Font and calculation helpers

**Files:** root layout/globals, shared font module and licensed font assets; analytics-ui traffic/formatter/acquisition helpers and focused tests; fixture root font loader.

- [ ] Add one local normal variable WOFF2 and preserve semantic font exceptions.
- [ ] Add index/formatter behavior tests for unknown/zero, duplicate keys, currencies and calendar-day timezone formatting.
- [ ] Implement and run those focused tests.

### Task 2: Analytics presentation

**Files:** `components/analytics/CommerceAnalyticsWorkspace.tsx`, `ActiveVisitorsCard.tsx`, `SalesTrendChart.tsx` and their existing CSS modules; `lib/analytics-workspace.behavior.test.ts`.

- [ ] Integrate helper signatures and memoize payload-derived values.
- [ ] Apply five-metric strip, compact toolbar, chart/visitor hierarchy, product table/source bars and journey while retaining secondary information.
- [ ] Preserve current active poller with a single mounted reader; no invented historical or location data.
- [ ] Update meaningful behavior assertions for the intentional new layout and rerun analytics tests.

### Task 3: Verification and rollout

- [ ] Run Customer Panel typecheck, official candidate build and required signup/payment generator guards.
- [ ] Use the real-component fixture for 1440/1024/390 screenshots, all five tabs, filters, comparison, empty/error/partial states and keyboard behavior.
- [ ] Obtain independent UI/source review, commit exact candidate and bind a new guarded release kit to all changed source/CSS/font assets.
- [ ] Recheck global idle and canonical lock; publish and accept NET, then SITE; verify all six runtime witnesses and leave a concise evidence record.
