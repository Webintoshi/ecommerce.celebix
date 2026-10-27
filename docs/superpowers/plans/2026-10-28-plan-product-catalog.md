# Package Product Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make packages visually distinct products with clear, accurate comparison and purchase information.
**Architecture:** Retain existing payment/request behavior; change shared panel presentation and static checkout artwork mapping only.
**Tech Stack:** Existing Next.js/React/TypeScript, CSS modules, generated optimized WebP assets.
**Spec:** `docs/superpowers/specs/2026-10-28-plan-product-catalog-design.md`

## Global Constraints

- Preserve catalog prices, immutable historic agreements, permissions, signed checkout and fulfillment.
- No SQL/API/auth changes, invented upgrade billing, actual charge, or store-specific UI hardcoding.
- Use existing theme/font tokens and accurate native UI text; generated assets contain only product branding.

## Review Focus

- Period switches update every card and selected total together.
- Historic/paid/current/lower plans do not gain unintended checkout rights.
- Uncertain writes retain operation keys and recover without duplicate mutations.
- Staff/support can inspect plans without purchase or private usage disclosure.
- At 390px images and controls fit; only the comparison region scrolls horizontally.

## Tasks

- [ ] Generate and optimize four product images; record stable versioned paths.
- [ ] Implement card/term/summary/comparison presentation and focused behavior tests in the shared customer panel.
- [ ] Add selected-offer artwork mapping in the existing main-site checkout, preserving fallback and all financial code.
- [ ] Review, typecheck and run relevant regressions; verify visual fidelity and responsive/keyboard behavior.
- [ ] Publish exact reviewed candidates through the existing guarded sequence, then verify running source and live acceptance without a card charge.
