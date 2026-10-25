# Shared Catalog Creation and Lifecycle Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent cart, list and creation UI tasks. Root alone commits and publishes.

**Goal:** Fix the four reported catalog/cart issues across all stores.

**Architecture:** Preserve native Postgres authority, audited permanent deletion and one final product save. Add entry choice and reorder existing creation sections rather than duplicate editor state.

**Tech Stack:** TypeScript, React/Next.js, existing CSS modules and native PostgreSQL16.

**Spec:** `docs/superpowers/specs/2026-10-24-catalog-create-lifecycle-design.md`

## Global Constraints

- Preserve tenant isolation, permissions, operation keys, recovery buffers and financial history.
- Root is the only publisher; immutable previous release kits and SQL remain unchanged.
- Keep current and historical signup proof valid and build every affected canonical application.

## Review Focus

- Archived cart removal must not depend on catalog availability or current price.
- Failed deletion must leave mutable carts unchanged; checkout/history blockers remain enforced.
- Existing variant values must survive navigation, image sorting and recovery.
- Choosing variant entry must not accidentally create the default single variant.
- Sticky classification must not hide controls at short heights or on mobile.

## Tasks

- [ ] Reproduce native cart/remove and saved-cart deletion failures; add focused lifecycle regressions and migration273 only as needed. Preserve original authority and version/replay guards.
- [ ] Bind list trash to existing deletion impact/dialog/API and remove row only on verified success; focused behavior and permission/retry tests.
- [ ] Add detailed entry choice in ProductCreateForm; keep draft navigation/recovery; expose variant setup after basics in ProductAdvancedEditor and test choice-to-payload behavior.
- [ ] Make the desktop create rail sticky with viewport-bound scrolling and compact/mobile inline layout; inspect screenshots and focus at three viewport widths.
- [ ] Independently review changed boundaries, run focused regressions and affected production builds; refresh/commit exact source-bound signup proof.
- [ ] Capture fresh six-app source/runtime/native baseline and publish shared storefront/panels sequentially with root-owned definitions; verify actual installed native source and all targeted running sources before reporting live completion.
