---
name: celebix-storefront-workflow
description: Use when working on a specific Celebix store storefront theme. Triggers on requests to design, polish, refactor, build, or connect a store-specific frontend such as apps/storefront-deri-kordon. Use for homepage, collection, product, cart, checkout, SEO, and theme work that must stay isolated to one store.
---

# Celebix Storefront Workflow

Use this skill for any store-specific frontend work.

## Core rule

Work only inside the target store app:

- `apps/storefront-<slug>`

Treat this folder as the active theme. Do not edit:

- `apps/admin`
- `apps/owner`
- `packages/*` unless the task explicitly requires shared infrastructure

Use these files as the source of truth:

- `stores/<slug>/store.config.json`
- `apps/storefront-base`

## Required workflow

1. Read `stores/<slug>/store.config.json`
2. Confirm the target storefront folder exists at `apps/storefront-<slug>`
3. Use `apps/storefront-base` only as reference, not as the delivery target
4. Make all theme and UX changes inside `apps/storefront-<slug>`
5. Preserve compatibility with the existing Supabase tables and public API routes
6. Build the store app after edits

## Contracts that must not break

- Product listing and product detail must keep using the current store data contract
- Category, settings, cart, checkout, and auth flows must remain compatible with the same store Supabase project
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ADMIN_URL`, and store branding env values must stay store-specific
- Canonical, metadata, and JSON-LD must resolve to the current store domain, not another brand

## Allowed changes

- Homepage layout
- Collection and product presentation
- Typography, spacing, color, motion, and merchandising blocks
- Store-specific copy and trust sections
- Store-specific SEO text and schema wording

## Escalate before changing

Do not change shared infrastructure without clear need:

- `apps/storefront-base`
- `packages/platform-config`
- shared Supabase schema
- owner provisioning flow

If a new feature is truly reusable across many stores, implement it in the active store first, then propose promoting it into `apps/storefront-base`.

## Validation

After edits, run:

- `npm run build --workspace @celebix/storefront-<slug>`

If local preview is needed, run:

- `npm run dev --workspace @celebix/storefront-<slug>`

